import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEditorStore } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { Plus, ChevronDown, Search, FolderOpen, Trash2, AlertTriangle } from 'lucide-react';

interface Project {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  exhibitions: { id: number; title: string; slug: string; versions?: { id: number }[] }[];
  _count: { assets: number };
}

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

  const fetchProjects = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/projects', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        
        // Auto-select project if none selected
        const currentProjectId = useEditorStore.getState().activeProjectId;
        if (!currentProjectId && data.length > 0) {
          
          // Check current URL to see if user is requesting a specific project by slug
          const path = window.location.pathname;
          const slugMatch = path.match(/^\/([^/]+)\/(edit|assets)/);
          const requestedSlug = slugMatch ? slugMatch[1] : null;

          let project = data[0];
          if (requestedSlug) {
            const matchedProject = data.find((p: Project) => p.slug === requestedSlug);
            if (matchedProject) project = matchedProject;
          }

          const exhibition = project.exhibitions?.[0];
          let versionId: number | null = null;
          if (exhibition) {
            try {
              const vRes = await fetch(`/api/exhibitions/${exhibition.id}/versions`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (vRes.ok) {
                const versions = await vRes.json();
                if (versions.length > 0) versionId = versions[0].id;
              }
            } catch { /* ignore */ }
          }
          setActiveProject(project.id, project.name, project.slug, exhibition?.id ?? null, versionId, exhibition?.slug ?? null);
          triggerRefresh();

          if (path.includes('/assets')) {
            navigate(`/exhibition/${project.slug}/assets`, { replace: true });
          } else {
            navigate(`/exhibition/${project.slug}/edit`, { replace: true });
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch projects:', e);
    }
  }, [token, setActiveProject, triggerRefresh, navigate]);

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

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

  const selectProject = async (project: Project) => {
    // Get first exhibition and its latest version
    const exhibition = project.exhibitions[0];
    let versionId: number | null = null;
    
    if (exhibition) {
      try {
        const res = await fetch(`/api/exhibitions/${exhibition.id}/versions`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const versions = await res.json();
          if (versions.length > 0) {
            versionId = versions[0].id; // Most recent version
          }
        }
      } catch (e) {
        console.error('Failed to fetch versions:', e);
      }
    }

    setActiveProject(project.id, project.name, project.slug, exhibition?.id ?? null, versionId, exhibition?.slug ?? null);
    triggerRefresh();
    setIsOpen(false);
    setSearch('');
    
    // Only navigate to the editor if we are not on the assets page
    if (!location.pathname.includes('/assets')) {
      navigate(`/exhibition/${project.slug}/edit`);
    }
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
        
        // Only navigate to the editor if we are not on the assets page
        if (!location.pathname.includes('/assets')) {
          navigate(`/exhibition/${project.slug}/edit`);
        }
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
        onClick={() => { if (!isOpen) fetchProjects(); setIsOpen(!isOpen); }}
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
