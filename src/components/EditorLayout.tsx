import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { UploadDropzone } from './UploadDropzone';
import { MetadataDialog } from './MetadataDialog';
import { useEditorStore } from '../store/editorStore';
import { Button } from '@/components/ui/button';
import { LogOut, BookOpen, ExternalLink, Globe, Settings } from 'lucide-react';
import { AssetSidebar } from './AssetSidebar';
import { ProjectSelector } from './ProjectSelector';
import { VersionPanel } from './VersionPanel';
import { WikiModal } from './WikiModal';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';

// ViewModeControls import causes a white screen crash (likely due to circular dependency or build issue).
// Temporarily disabled to allow the app to run.
// import { ViewModeControls } from './ViewModeControls';


import { EditorPage } from '../pages/EditorPage';
import { PropertiesPanel } from './PropertiesPanel';

export const EditorLayout = () => {
  const { user, logout } = useAuthStore();
  const refreshAuth = useAuthStore((state) => state.refreshAuth);
  const startPlacement = useEditorStore((state) => state.startPlacement);
  const viewMode = useEditorStore((state) => state.plannerViewMode);
  const navigate = useNavigate();
  const location = useLocation();
  const activeProjectSlug = useEditorStore((state) => state.activeProjectSlug);
  const activeExhibitionId = useEditorStore((state) => state.activeExhibitionId);
  const activeExhibitionSlug = useEditorStore((state) => state.activeExhibitionSlug);
  const token = useAuthStore((state) => state.token);
  const [uploadedAsset, setUploadedAsset] = useState<any | null>(null);
  const [viewerPopoverOpen, setViewerPopoverOpen] = useState(false);
  const [publishedVersionExists, setPublishedVersionExists] = useState<boolean | null>(null);
  const [publishing, setPublishing] = useState(false);
  const viewerPopoverRef = useRef<HTMLDivElement>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const rightOpen = useEditorStore((state) => state.rightSidebarOpen);
  const toggleRight = useEditorStore((state) => state.toggleRightSidebar);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isProf = useAuthStore((s) => s.isProf);

  // Refresh auth (role, token) on mount and whenever the tab regains focus
  useEffect(() => {
    refreshAuth();
    const onFocus = () => refreshAuth();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshAuth]);

  // Check if a published version exists when popover opens
  useEffect(() => {
    if (!viewerPopoverOpen || !activeExhibitionId || !token) return;
    setPublishedVersionExists(null);
    fetch(`/api/exhibitions/${activeExhibitionId}/versions`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((versions: { is_published: boolean }[]) => {
        setPublishedVersionExists(versions.some((v) => v.is_published));
      })
      .catch(() => setPublishedVersionExists(false));
  }, [viewerPopoverOpen, activeExhibitionId, token]);

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (viewerPopoverRef.current && !viewerPopoverRef.current.contains(e.target as Node)) {
        setViewerPopoverOpen(false);
      }
    };
    if (viewerPopoverOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [viewerPopoverOpen]);

  const handlePublishCurrentVersion = async () => {
    if (!activeExhibitionId || !token) return;
    setPublishing(true);
    try {
      const versionsRes = await fetch(`/api/exhibitions/${activeExhibitionId}/versions`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!versionsRes.ok) throw new Error();
      const versions: { id: number; is_published: boolean }[] = await versionsRes.json();
      const latest = versions[0];
      if (!latest) throw new Error();
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}/versions/${latest.id}/publish`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) setPublishedVersionExists(true);
    } catch { /* ignore */ }
    setPublishing(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const setDialogOpen = useEditorStore((state) => state.setDialogOpen);

  const onUploadComplete = (asset: any) => {
      console.log('Upload complete:', asset);
      setUploadedAsset(asset);
      setDialogOpen(true);
  };

  // Update type to receive data object
  const onMetadataSaved = (data: { id: number, width: number, height: number }) => {
      console.log('Artwork saved:', data);
      setUploadedAsset(null);
      setDialogOpen(false);
      
      startPlacement({ 
          id: data.id, 
          type: 'artwork', // Newly created/edited artwork
          width: data.width, 
          height: data.height, 
          url: uploadedAsset.path 
      });
  };

  const isPlanningMode = viewMode !== 'firstPerson';
  const isActive = (path: string) => location.pathname.includes(path);
  const isAssetRoute = location.pathname.includes('/assets');


  return (
    <div className="h-full w-full flex flex-col bg-zinc-950 overflow-hidden">
      <header className="relative z-30 border-b border-zinc-800 p-3 bg-zinc-900 flex justify-between items-center">
        <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold tracking-tight text-white">CuraHub <span className="text-blue-500">Dashboard</span></h1>
            <ProjectSelector />
            <nav className="flex gap-4 ml-2 text-sm font-medium">
                <Link 
                    to={activeProjectSlug ? `/exhibition/${activeProjectSlug}/edit` : "/project"} 
                    className={`transition-colors ${isActive('/edit') ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    Editor
                </Link>
                <Link 
                    to={activeProjectSlug ? `/exhibition/${activeProjectSlug}/assets` : "/project"} 
                    className={`transition-colors ${isActive('/assets') ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    Assets
                </Link>
                <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setWikiOpen(true); }}
                    className="transition-colors text-gray-400 hover:text-white flex items-center gap-1"
                >
                    <BookOpen className="h-3.5 w-3.5" />
                    Wiki
                </a>
                {user?.role === 'admin' && (
                    <Link
                        to="/users"
                        className="transition-colors text-gray-400 hover:text-white"
                    >
                        Benutzerverwaltung
                    </Link>
                )}
            </nav>
        </div>
        
        <div className="flex items-center gap-4">
            {/* Project Settings Button — only for Prof/Admin */}
            {isProf && activeExhibitionId && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded transition-all"
              >
                <Settings className="h-3.5 w-3.5" />
                Projekteinstellungen
              </button>
            )}

            {/* Viewer Button */}
            {activeExhibitionSlug && (
              <div className="relative" ref={viewerPopoverRef}>
                <button
                  onClick={() => setViewerPopoverOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded transition-all"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Viewer testen
                </button>

                {viewerPopoverOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-4 z-50">
                    <p className="text-xs text-zinc-400 mb-2 font-medium uppercase tracking-wider">Öffentlicher Viewer</p>
                    <div className="flex items-center gap-2 bg-zinc-800 rounded px-2 py-1.5 mb-3">
                      <span className="text-xs text-zinc-300 truncate flex-1">
                        {window.location.origin}/exhibition/{activeExhibitionSlug}
                      </span>
                      <a
                        href={`/exhibition/${activeExhibitionSlug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-zinc-400 hover:text-white transition-colors"
                        title="In neuem Tab öffnen"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    {publishedVersionExists === null && (
                      <p className="text-xs text-zinc-500">Wird geprüft…</p>
                    )}
                    {publishedVersionExists === false && (
                      <>
                        <p className="text-xs text-amber-400 mb-3">
                          Diese Ausstellung wurde noch nicht veröffentlicht. Der Viewer zeigt nichts an, bis mindestens eine Version veröffentlicht wird.
                        </p>
                        <button
                          onClick={handlePublishCurrentVersion}
                          disabled={publishing}
                          className="w-full text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 hover:border-zinc-400 text-zinc-200 px-3 py-2 rounded transition-all disabled:opacity-40"
                        >
                          {publishing ? 'Wird veröffentlicht…' : 'Aktuellen Stand veröffentlichen'}
                        </button>
                      </>
                    )}
                    {publishedVersionExists === true && (
                      <p className="text-xs text-green-400">
                        Eine veröffentlichte Version ist verfügbar. Der Viewer ist aktiv.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {user?.email && (
                <span className="text-xs text-gray-500 hidden sm:inline-block">
                    {user.email.split('@')[0]}
                </span>
            )}
            <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-gray-400 hover:text-white hover:bg-zinc-800"
            >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
            </Button>
        </div>
      </header>
      
      <div className="flex-1 relative overflow-hidden">
         <UploadDropzone
            disabled={!isAssetRoute} // Only allow uploads in Assets tab
            onUploadStart={() => console.log('Upload started')}
            onUploadComplete={onUploadComplete}
            onUploadError={(err) => alert(`Upload error: ${err}`)}
         >
            {/* Persistent Editor Background */}
            <div className="absolute inset-0 z-0">
                 <EditorPage />
            </div>

            {/* Content Overlay (Asset Library or empty for Edit route) */}
            <div className={`absolute inset-0 z-10 ${!isAssetRoute ? 'pointer-events-none' : ''}`}>
                 <Outlet />
            </div>
         
            {/* Show Sidebars specifically for the Editor View */}
            {isPlanningMode && !isAssetRoute && (
                <>
                    <AssetSidebar isOpen={leftOpen} onToggle={() => setLeftOpen(!leftOpen)} />
                    <PropertiesPanel isOpen={rightOpen} onToggle={toggleRight} />
                    <VersionPanel 
                      isOpen={versionsOpen} 
                      onToggle={() => setVersionsOpen(!versionsOpen)} 
                      leftSidebarOpen={leftOpen}
                      rightSidebarOpen={rightOpen}
                    />
                </>
            )}
         </UploadDropzone>

         {uploadedAsset && isPlanningMode && (
             <MetadataDialog 
                asset={uploadedAsset}
                onSave={onMetadataSaved}
                onCancel={() => { setUploadedAsset(null); setDialogOpen(false); }}
             />
         )}
         
         {!isPlanningMode && (
             <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white bg-black/60 px-4 py-2 rounded-lg pointer-events-none backdrop-blur-sm text-sm">
                 First Person Preview (Press ESC to exit)
             </div>
         )}
      </div>

      {/* Wiki Modal */}
      <WikiModal isOpen={wikiOpen} onClose={() => setWikiOpen(false)} />

      {/* Project Settings Dialog */}
      <ProjectSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};
