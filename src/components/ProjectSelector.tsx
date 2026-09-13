import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, matchPath } from 'react-router-dom';
import { useEditorStore } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { gooeyToast } from 'goey-toast';
import { Plus, ChevronDown, Search, FolderOpen, Trash2, AlertTriangle } from 'lucide-react';

interface Project {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  exhibitions: { id: number; title: string; slug: string; versions?: { id: number }[] }[];
  _count: { assets: number };
}

// How long a fetched project list is considered fresh — avoids re-fetching /api/projects
// every time the dropdown is opened (see performance audit API-01).
const PROJECTS_CACHE_TTL_MS = 30_000;

export const ProjectSelector = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const token = useAuthStore((state) => state.token);
  const activeProjectId = useEditorStore((state) => state.activeProjectId);
  const activeProjectName = useEditorStore((state) => state.activeProjectName);
  const setActiveProject = useEditorStore((state) => state.setActiveProject);
  const triggerRefresh = useEditorStore((state) => state.triggerInstancesRefresh);
  const navigate = useNavigate();
  const location = useLocation();

  // Timestamp of the last successful /api/projects fetch — drives the 30s dropdown-open cache.
  const lastFetchedAtRef = useRef(0);
  const projectsAbortRef = useRef<AbortController | null>(null);
  // Aborts a still-in-flight "resolve exhibition + version" call when the user picks a
  // different project (or the URL slug changes) before the previous one resolves.
  const selectionAbortRef = useRef<AbortController | null>(null);

  const fetchProjects = useCallback(async (): Promise<Project[] | null> => {
    if (!token) return null;
    projectsAbortRef.current?.abort();
    const controller = new AbortController();
    projectsAbortRef.current = controller;
    try {
      const res = await fetch('/api/projects', {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: controller.signal,
      });
      if (res.ok) {
        const data: Project[] = await res.json();
        setProjects(data);
        lastFetchedAtRef.current = Date.now();
        return data;
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Failed to fetch projects:', e);
      }
    }
    return null;
  }, [token]);

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
    return () => projectsAbortRef.current?.abort();
  }, [fetchProjects]);

  // Re-fetch on dropdown open only if the cached list is older than 30s (see audit API-01).
  const openDropdown = () => {
    if (!isOpen && Date.now() - lastFetchedAtRef.current > PROJECTS_CACHE_TTL_MS) {
      fetchProjects();
    }
    setIsOpen((o) => !o);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Shared helper: resolve a project's first exhibition + its latest version. Used by both
  // the URL-driven selection effect and the manual dropdown pick, so the versions endpoint
  // is only ever hit once per selection instead of being duplicated across call sites
  // (see audit API-01).
  const resolveExhibitionAndVersion = useCallback(async (
    project: Project,
    signal?: AbortSignal
  ): Promise<{ exhibitionId: number | null; exhibitionSlug: string | null; versionId: number | null }> => {
    const exhibition = project.exhibitions?.[0];
    if (!exhibition) return { exhibitionId: null, exhibitionSlug: null, versionId: null };

    let versionId: number | null = null;
    try {
      const res = await fetch(`/api/exhibitions/${exhibition.id}/versions`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal,
      });
      if (res.ok) {
        const versions = await res.json();
        if (versions.length > 0) versionId = versions[0].id; // Most recent version
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Failed to fetch versions:', e);
      }
    }
    return { exhibitionId: exhibition.id, exhibitionSlug: exhibition.slug ?? null, versionId };
  }, [token]);

  // Activates a project in the store (+ optional navigation). Cancels any previous
  // in-flight resolution first, so rapid re-selection (or a fast back/forward) can't
  // let a stale resolve() overwrite a newer one.
  const activateProject = useCallback(async (
    project: Project,
    opts: { navigateMode?: 'edit' | 'assets'; replace?: boolean } = {}
  ) => {
    selectionAbortRef.current?.abort();
    const controller = new AbortController();
    selectionAbortRef.current = controller;

    const { exhibitionId, exhibitionSlug, versionId } = await resolveExhibitionAndVersion(project, controller.signal);
    if (controller.signal.aborted) return;

    setActiveProject(project.id, project.name, project.slug, exhibitionId, versionId, exhibitionSlug);
    triggerRefresh();

    if (opts.navigateMode) {
      navigate(`/exhibition/${project.slug}/${opts.navigateMode}`, { replace: opts.replace });
    }
  }, [resolveExhibitionAndVersion, setActiveProject, triggerRefresh, navigate]);

  // ── FUNC-01: keep the active project in sync with the URL slug ───────────────────────
  // Handles the initial deep link (e.g. `/exhibition/yol/edit`), an unknown/inaccessible
  // slug (toast + fallback), and the URL slug changing while mounted (browser back/forward,
  // header links). Loop guard: we only act when the resolved URL slug differs from
  // `activeProjectSlug`, and every activation WE trigger calls `setActiveProject` before
  // `navigate` — so by the time the URL updates, the store already matches it and this
  // effect no-ops on the next run instead of re-activating.
  useEffect(() => {
    if (!token || projects.length === 0) return;

    const match = matchPath({ path: '/exhibition/:projectSlug/:mode' }, location.pathname);
    const requestedSlug = match?.params.projectSlug ?? null;
    const requestedMode: 'edit' | 'assets' = match?.params.mode === 'assets' ? 'assets' : 'edit';
    const currentSlug = useEditorStore.getState().activeProjectSlug;

    if (requestedSlug === currentSlug) return; // already in sync

    if (!requestedSlug) {
      // No project slug in the URL (e.g. `/project`) — only auto-pick a project if none is
      // selected yet; don't fight the user after e.g. deleting the active project.
      if (!currentSlug) {
        const fallback = projects[0];
        if (fallback) {
          activateProject(fallback, {
            navigateMode: location.pathname.includes('/assets') ? 'assets' : 'edit',
            replace: true,
          });
        }
      }
      return;
    }

    const project = projects.find((p) => p.slug === requestedSlug);
    if (!project) {
      gooeyToast.error('Projekt nicht gefunden', {
        description: `Das Projekt "${requestedSlug}" existiert nicht oder du hast keinen Zugriff darauf.`,
      });
      const fallback = projects[0];
      if (fallback) {
        activateProject(fallback, { navigateMode: requestedMode, replace: true });
      }
      return;
    }

    // Valid slug — select it and keep the current URL as-is.
    activateProject(project);
  }, [location.pathname, projects, token, activateProject]);

  const selectProject = async (project: Project) => {
    setIsOpen(false);
    setSearch('');
    // Always navigate to the new project's current mode (edit/assets) — skipping navigation
    // on the assets page would leave the URL pointing at the old project's slug, which the
    // FUNC-01 URL-sync effect above would then "correct" straight back. Navigating keeps
    // URL and store in lockstep and avoids that loop.
    await activateProject(project, {
      navigateMode: location.pathname.includes('/assets') ? 'assets' : 'edit',
    });
  };

  const createProject = async () => {
    if (!newName.trim() || !token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const project = await res.json();
        setNewName('');
        setIsCreating(false);
        await fetchProjects();
        
        // Auto-select the newly created project
        const exhibition = project.exhibitions?.[0];
        const version = exhibition?.versions?.[0];
        setActiveProject(
          project.id,
          project.name,
          project.slug,
          exhibition?.id ?? null,
          version?.id ?? null,
          exhibition?.slug ?? null
        );
        triggerRefresh();

        // Always navigate to the new project's current mode — see the comment in
        // selectProject() for why skipping this on the assets page would loop.
        navigate(`/exhibition/${project.slug}/${location.pathname.includes('/assets') ? 'assets' : 'edit'}`);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Failed to create project HTTP error:', res.status, errData);
        alert(`Failed to create project:\n${errData.details || errData.error || res.status}`);
      }
    } catch (e) {
      console.error('Failed to create project:', e);
      alert(`Network error creating project: ${e}`);
    }
    setLoading(false);
  };

  const confirmDelete = async () => {
    if (!projectToDelete || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        // Clear active project if deleted
        if (activeProjectId === projectToDelete.id) {
          setActiveProject(null, null, null, null, null);
          navigate('/project'); // Redirect to safety
        }
        setProjectToDelete(null);
        await fetchProjects();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Failed to delete project:\n${errData.error || res.status}`);
      }
    } catch (e) {
      console.error('Failed to delete project:', e);
      alert(`Network error deleting project: ${e}`);
    }
    setLoading(false);
  };

  const filtered = projects.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={openDropdown}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm text-white transition-colors min-w-[160px]"
      >
        <FolderOpen className="h-3.5 w-3.5 text-blue-400" />
        <span className="truncate max-w-[140px]">
          {activeProjectName || 'Select Project'}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-zinc-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
              <input
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
          </div>

          {/* Project List */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                {search ? 'No matching projects' : 'No projects yet'}
              </div>
            ) : (
              filtered.map((project) => (
                <div key={project.id} className="relative group flex items-center w-full">
                  <button
                    onClick={() => selectProject(project)}
                    className={`flex-1 flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-800 transition-colors ${
                      project.id === activeProjectId ? 'bg-zinc-800 border-l-2 border-blue-500' : ''
                    }`}
                  >
                    <FolderOpen className="h-4 w-4 text-gray-400 shrink-0" />
                    <div className="min-w-0 pr-8">
                      <div className="text-sm text-white truncate">{project.name}</div>
                      <div className="text-xs text-gray-500">
                        {project._count.assets} assets
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjectToDelete(project);
                    }}
                    className="absolute right-2 p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-700/50 rounded opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete Project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Create New */}
          <div className="border-t border-zinc-800 p-2">
            {isCreating ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Project name..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createProject()}
                  className="flex-1 min-w-0 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button
                  onClick={createProject}
                  disabled={loading || !newName.trim()}
                  className="shrink-0 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm text-white font-medium transition-colors"
                >
                  {loading ? '...' : 'Create'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-zinc-800 rounded text-sm text-blue-400 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New Project
              </button>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-sm w-full shadow-2xl mx-4">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold text-white">Delete Project</h3>
            </div>
            <p className="text-sm text-zinc-300 mb-6 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-white">"{projectToDelete.name}"</span>? 
              This will permanently remove the project, all its exhibitions, versions, and <span className="text-red-400 font-medium">permanently delete all {projectToDelete._count.assets} uploaded assets</span>. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setProjectToDelete(null)}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors shadow-lg shadow-red-900/20 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? 'Deleting...' : 'Yes, Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
