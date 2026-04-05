import { useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { History, Clock, MessageSquare, Layers, ChevronUp, ChevronDown, Trash2, Globe, Star } from 'lucide-react';
import { SaveVersionDialog } from './SaveVersionDialog';

interface Version {
  id: number;
  comment: string | null;
  created_at: string;
  parent_version_id: number | null;
  is_published: boolean;
  is_featured: boolean;
  creator: { id: number; email: string };
  _count: { instances: number };
}

export const VersionPanel = ({ 
  isOpen, 
  onToggle,
  leftSidebarOpen,
  rightSidebarOpen 
}: { 
  isOpen: boolean; 
  onToggle: () => void;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
}) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const token = useAuthStore((state) => state.token);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const activeExhibitionId = useEditorStore((state) => state.activeExhibitionId);
  const activeVersionId = useEditorStore((state) => state.activeVersionId);
  const setActiveVersion = useEditorStore((state) => state.setActiveVersion);
  const triggerRefresh = useEditorStore((state) => state.triggerInstancesRefresh);

  const fetchVersions = useCallback(async () => {
    if (!token || !activeExhibitionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}/versions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setVersions(data);
      }
    } catch (e) {
      console.error('Failed to fetch versions:', e);
    }
    setLoading(false);
  }, [token, activeExhibitionId]);

  useEffect(() => {
    if (activeExhibitionId) {
      fetchVersions();
    } else {
      setVersions([]);
    }
  }, [activeExhibitionId, fetchVersions]);

  const selectVersion = (versionId: number) => {
    setActiveVersion(versionId);
    triggerRefresh();
  };

  const handleDeleteVersion = async (e: React.MouseEvent, versionId: number) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this version? This cannot be undone.')) return;

    if (!token || !activeExhibitionId) return;
    try {
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}/versions/${versionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        if (activeVersionId === versionId) {
          setActiveVersion(null);
          triggerRefresh();
        }
        fetchVersions();
      } else {
        const err = await res.json();
        alert(`Failed to delete version: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to delete version:', err);
      alert('Network error while deleting version.');
    }
  };

  const onVersionSaved = () => {
    setShowSaveDialog(false);
    fetchVersions();
  };

  const handlePublish = async (e: React.MouseEvent, versionId: number) => {
    e.stopPropagation();
    if (!token || !activeExhibitionId) return;
    try {
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}/versions/${versionId}/publish`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) fetchVersions();
      else alert((await res.json()).error || 'Failed to publish');
    } catch { alert('Network error'); }
  };

  const handleFeature = async (e: React.MouseEvent, versionId: number) => {
    e.stopPropagation();
    if (!token || !activeExhibitionId) return;
    try {
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}/versions/${versionId}/feature`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) fetchVersions();
      else alert((await res.json()).error || 'Failed to feature');
    } catch { alert('Network error'); }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Toggle button (standalone when panel is closed)
  const toggleButton = (
    <button
      onClick={onToggle}
      title={isOpen ? 'Hide Versions' : 'Show Versions'}
      className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-8 bg-blue-600 border border-blue-700 border-b-0 rounded-t-xl flex items-center justify-center hover:bg-blue-500 transition-transform duration-300 z-10 shadow-[0_-4px_15px_-3px_rgba(59,130,246,0.3)] ${
        isOpen ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'
      }`}
    >
      <div className="flex items-center gap-2 text-white font-medium text-xs">
        <History className="h-3.5 w-3.5" />
        <span>Versions</span>
      </div>
      <ChevronUp className="h-4 w-4 text-white absolute top-1 right-2 opacity-50" />
    </button>
  );

  return (
    <>
      {toggleButton}

      {/* Floating Panel Wrapper */}
      <div 
        className={`absolute bottom-8 h-64 bg-zinc-950/80 backdrop-blur-md border border-zinc-800 shadow-2xl z-20 flex flex-col pointer-events-auto rounded-xl overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? 'translate-y-0 opacity-100' : 'translate-y-[calc(100%+2.5rem)] opacity-0 pointer-events-none'
        } ${leftSidebarOpen ? 'left-[18rem]' : 'left-8'} ${rightSidebarOpen ? 'right-[20rem]' : 'right-8'}`}
      >
        {/* Header */}
        <div className="p-3 border-b border-zinc-800 bg-blue-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">Version History</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaveDialog(true)}
              disabled={!activeExhibitionId || !activeVersionId}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs text-white font-medium transition-colors border border-white/20 shadow-sm"
            >
              Save Version
            </button>
            <button
              onClick={onToggle}
              className="p-1 rounded-md text-blue-100 hover:text-white hover:bg-blue-700 transition-colors"
              title="Close Versions"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

      {/* Version List */}
      <div className="flex-1 overflow-x-auto p-4 custom-scrollbar">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-sm text-gray-500">Loading...</div>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-500">
            <Layers className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No versions yet</p>
            <p className="text-xs mt-1">Select a project to get started</p>
          </div>
        ) : (
          <div className="flex items-stretch gap-4 h-full w-max">
            {versions.map((version, index) => {
              const isActive = version.id === activeVersionId;

              return (
                <div 
                  key={version.id} 
                  className={`group relative w-64 flex flex-col rounded-lg border transition-all duration-200 overflow-hidden shrink-0 ${
                    isActive 
                      ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]' 
                      : 'bg-zinc-900/50 border-zinc-800/80 hover:bg-zinc-800/50 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex-1 text-left p-4 h-full flex flex-col justify-start">
                    {/* Row 1: status indicator + label + inline action buttons */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                        isActive
                          ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]'
                          : index === 0 ? 'bg-green-500' : 'bg-zinc-600'
                      }`} />
                      <span className={`text-xs font-medium uppercase tracking-wider ${isActive ? 'text-blue-400' : 'text-zinc-500'}`}>
                        {isActive ? 'Active Version' : index === 0 ? 'Latest' : 'Snapshot'}
                      </span>
                      <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!version.is_published && (
                          <button
                            onClick={(e) => handlePublish(e, version.id)}
                            className="p-1.5 text-zinc-500 hover:text-green-400 hover:bg-green-400/10 rounded-md transition-colors"
                            title="Publish"
                          >
                            <Globe className="h-4 w-4" />
                          </button>
                        )}
                        {isAdmin && version.is_published && !version.is_featured && (
                          <button
                            onClick={(e) => handleFeature(e, version.id)}
                            className="p-1.5 text-zinc-500 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-md transition-colors"
                            title="Feature on Homepage"
                          >
                            <Star className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDeleteVersion(e, version.id)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                          title="Delete Version"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: status badges — own row, never overlaps action buttons */}
                    {(version.is_featured || version.is_published) && (
                      <div className="flex items-center gap-1.5 mb-2">
                        {version.is_featured && (
                          <span className="text-[10px] font-medium text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Star className="h-3 w-3" /> Featured
                          </span>
                        )}
                        {version.is_published && (
                          <span className="text-[10px] font-medium text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Globe className="h-3 w-3" /> Published
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-start gap-2 mb-auto pb-2">
                        <MessageSquare className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
                        <span className="text-sm text-white font-medium line-clamp-2">
                          {version.comment || 'No commit message'}
                        </span>
                    </div>

                    <div className="mt-4 pt-4 border-t border-zinc-800/50 space-y-2">
                      <div className="text-xs text-gray-400 flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                          <span className="truncate">{formatDate(version.created_at)}</span>
                      </div>
                      <div className="text-xs text-gray-400 flex items-center justify-between">
                          <span>{version._count.instances} artworks</span>
                          <span className="truncate max-w-[100px]" title={version.creator.email}>{version.creator.email.split('@')[0]}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Hover Actions */}
                  {!isActive && (
                    <div className="absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black/90 via-black/60 to-transparent translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none group-hover:pointer-events-auto flex items-end">
                      <button
                        onClick={() => selectVersion(version.id)}
                        className="w-full py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors flex items-center justify-center gap-2 shadow-lg"
                      >
                        Load This Version
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

        {/* Save Version Dialog */}
        {showSaveDialog && (
          <SaveVersionDialog
            onSave={onVersionSaved}
            onCancel={() => setShowSaveDialog(false)}
          />
        )}
      </div>
    </>
  );
};
