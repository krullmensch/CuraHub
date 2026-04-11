import { useState, useEffect, useCallback, useRef } from 'react';
import { UploadDropzone } from './UploadDropzone';
import { useEditorStore } from '../store/editorStore';
import { Card, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { gooeyToast } from 'goey-toast';
import {
  Trash2,
  FileIcon,
  Loader2,
  Edit,
  Play,
  Folder as FolderIcon,
  FolderPlus,
  Inbox,
  Layers,
  MoreHorizontal,
  Palette,
  Pencil,
  FolderInput,
} from 'lucide-react';
import { ModelPreviewCard } from './ModelPreviewCard';
import { MetadataDialog } from './MetadataDialog';
import { FolderColorPicker } from './FolderColorPicker';
import {
  type Folder,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  moveAssetToFolder,
  DEFAULT_FOLDER_COLOR,
} from '@/lib/folders';
import { cn } from '@/lib/utils';

interface Asset {
  id: number;
  filename: string;
  path: string;
  mimetype: string;
  size: number;
  type?: string;
  width: number;
  height: number;
  dpi: number;
  duration?: number | null;
  thumbnailPath?: string | null;
  folderId?: number | null;
  createdAt: string;
  artwork?: {
    id: number;
    title: string;
    artist?: string;
    year?: string;
    description?: string;
    width?: number;
    height?: number;
  } | null;
  metadata?: {
    widthCm?: number;
    heightCm?: number;
    projectId?: string;
  };
}

type FolderSelection = number | 'all' | 'unsorted';

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const AssetLibrary = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetsToDelete, setAssetsToDelete] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [contextMenu, setContextMenu] = useState<{ assetId: number; x: number; y: number } | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    filename: string;
    existing: Record<string, unknown>;
    retry: () => Promise<void>;
  } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const activeProjectId = useEditorStore((state) => state.activeProjectId);

  // Folder state
  const [folders, setFolders] = useState<Folder[]>([]);
  const [unsortedCount, setUnsortedCount] = useState(0);
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>('all');
  const [dragOverFolder, setDragOverFolder] = useState<FolderSelection | null>(null);

  // Folder dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createColor, setCreateColor] = useState<string>(DEFAULT_FOLDER_COLOR);
  const [creating, setCreating] = useState(false);

  const [renameTarget, setRenameTarget] = useState<Folder | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  const dragMovedRef = useRef(false);
  const uploadToastIdRef = useRef<string | number | null>(null);


  // ── Fetchers ──
  const buildAssetsUrl = useCallback(
    (folderSel: FolderSelection) => {
      const params = new URLSearchParams();
      if (activeProjectId) params.set('projectId', String(activeProjectId));
      if (folderSel === 'unsorted') params.set('folderId', 'unsorted');
      else if (typeof folderSel === 'number') params.set('folderId', String(folderSel));
      const qs = params.toString();
      return `/api/assets${qs ? `?${qs}` : ''}`;
    },
    [activeProjectId]
  );

  const fetchAssets = useCallback(
    async (folderSel: FolderSelection) => {
      try {
        setLoading(true);
        const res = await fetch(buildAssetsUrl(folderSel));
        if (!res.ok) throw new Error('Failed to fetch assets');
        const data = await res.json();
        setAssets(data);
      } catch (err) {
        gooeyToast.error('Fehler', {
          description: 'Assets konnten nicht geladen werden.',
        });
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [buildAssetsUrl]
  );

  const fetchFolders = useCallback(async () => {
    if (!activeProjectId) {
      setFolders([]);
      setUnsortedCount(0);
      return;
    }
    try {
      const data = await listFolders(activeProjectId);
      setFolders(data.folders);
      setUnsortedCount(data.unsortedCount);
    } catch (err) {
      console.error(err);
      gooeyToast.error('Fehler', {
        description: 'Ordner konnten nicht geladen werden.',
      });
    }
  }, [activeProjectId]);

  // Reset selection + reload when project changes
  useEffect(() => {
    setSelectedFolder('all');
    setSelectedIds([]);
    fetchFolders();
  }, [activeProjectId, fetchFolders]);

  useEffect(() => {
    fetchAssets(selectedFolder);
  }, [selectedFolder, fetchAssets]);

  // ── Derived ──
  const totalAssetsCount =
    folders.reduce((sum, f) => sum + (f._count?.assets ?? 0), 0) + unsortedCount;

  const folderForUpload =
    typeof selectedFolder === 'number' ? selectedFolder : null;

  // ── Asset operations ──
  const confirmDelete = async () => {
    if (assetsToDelete.length === 0) return;

    try {
      const deletePromises = assetsToDelete.map((id) =>
        fetch(`/api/assets/${id}`, { method: 'DELETE' }).then(async (res) => {
          if (!res.ok) throw new Error(`Failed to delete asset ${id}`);
          return id;
        })
      );

      const results = await Promise.allSettled(deletePromises);

      const successfulIds = results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<number>).value);

      const failedCount = results.filter((r) => r.status === 'rejected').length;

      setAssets((prev) => prev.filter((a) => !successfulIds.includes(a.id)));
      setSelectedIds((prev) => prev.filter((id) => !successfulIds.includes(id)));
      // Refresh folder counts
      fetchFolders();

      if (failedCount === 0) {
        gooeyToast.success('Assets gelöscht', {
          description: `${successfulIds.length} Datei(en) entfernt.`,
        });
      } else {
        gooeyToast.warning('Löschen teilweise fehlgeschlagen', {
          description: `${successfulIds.length} gelöscht, ${failedCount} fehlgeschlagen.`,
        });
      }
    } catch (err) {
      gooeyToast.error('Fehler', {
        description: 'Assets konnten nicht gelöscht werden.',
      });
      console.error(err);
    } finally {
      setAssetsToDelete([]);
    }
  };

  const toggleSelect = (id: number, e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (dragMovedRef.current) {
      // Click was the tail of a drag — ignore
      dragMovedRef.current = false;
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === assets.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(assets.map((a) => a.id));
    }
  };

  const handleUploadStart = () => {
    const id = gooeyToast('Upload wird verarbeitet …', {
      description: 'Datei wird optimiert und hochgeladen.',
      showProgress: true,
      duration: 60000,
    });
    uploadToastIdRef.current = id;
  };

  const handleUploadComplete = (newAsset: Asset) => {
    // Dismiss loading toast
    if (uploadToastIdRef.current != null) {
      gooeyToast.dismiss(uploadToastIdRef.current);
      uploadToastIdRef.current = null;
    }

    // Only prepend to local list if it matches the current view
    const matchesCurrentView =
      selectedFolder === 'all' ||
      (selectedFolder === 'unsorted' && !newAsset.folderId) ||
      (typeof selectedFolder === 'number' && newAsset.folderId === selectedFolder);

    if (matchesCurrentView) {
      setAssets((prev) => [newAsset, ...prev]);
    }
    fetchFolders();
    gooeyToast.success('Upload abgeschlossen', {
      description: `${newAsset.filename} wurde hinzugefügt.`,
    });
  };

  const handleMetadataSaved = () => {
    setSelectedAsset(null);
    fetchAssets(selectedFolder);
    gooeyToast.success('Gespeichert', {
      description: 'Artwork-Metadaten aktualisiert.',
    });
  };

  // ── Folder operations ──
  const handleCreateFolder = async () => {
    if (!activeProjectId || !createName.trim()) return;
    setCreating(true);
    try {
      const folder = await createFolder({
        projectId: activeProjectId,
        name: createName.trim(),
        color: createColor,
      });
      setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedFolder(folder.id);
      setCreateDialogOpen(false);
      setCreateName('');
      setCreateColor(DEFAULT_FOLDER_COLOR);
      gooeyToast.success('Ordner erstellt', { description: folder.name });
    } catch (err) {
      gooeyToast.error('Fehler', {
        description: err instanceof Error ? err.message : 'Ordner konnte nicht erstellt werden.',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const updated = await updateFolder(renameTarget.id, { name: renameValue.trim() });
      setFolders((prev) =>
        prev
          .map((f) => (f.id === updated.id ? { ...f, ...updated } : f))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setRenameTarget(null);
      setRenameValue('');
    } catch (err) {
      gooeyToast.error('Fehler', {
        description: err instanceof Error ? err.message : 'Umbenennen fehlgeschlagen.',
      });
    } finally {
      setRenaming(false);
    }
  };

  const handleRecolor = async (folder: Folder, color: string) => {
    try {
      const updated = await updateFolder(folder.id, { color });
      setFolders((prev) => prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)));
    } catch (err) {
      gooeyToast.error('Fehler', {
        description: err instanceof Error ? err.message : 'Farbe konnte nicht gespeichert werden.',
      });
    }
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;
    setDeletingFolder(true);
    try {
      const wasSelected = selectedFolder === folderToDelete.id;
      const result = await deleteFolder(folderToDelete.id);
      setFolders((prev) => prev.filter((f) => f.id !== folderToDelete.id));
      setUnsortedCount(result.unsortedCount);
      if (wasSelected) {
        setSelectedFolder('all');
      } else {
        // If we're not viewing the deleted folder, just refresh asset list to pick up moved items
        fetchAssets(selectedFolder);
      }
      setFolderToDelete(null);
      gooeyToast.success('Ordner gelöscht');
    } catch (err) {
      gooeyToast.error('Fehler', {
        description: err instanceof Error ? err.message : 'Ordner konnte nicht gelöscht werden.',
      });
    } finally {
      setDeletingFolder(false);
    }
  };

  // ── Drag-drop: asset → folder ──
  const handleAssetDragStart = (e: React.DragEvent, assetId: number) => {
    e.stopPropagation();
    dragMovedRef.current = true;
    e.dataTransfer.setData('asset-id', assetId.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDragOver = (e: React.DragEvent, folderSel: FolderSelection) => {
    if (!e.dataTransfer.types.includes('asset-id') && !e.dataTransfer.types.includes('text/plain')) {
      // Allow files (uploads) to bubble through to UploadDropzone
      if (e.dataTransfer.types.includes('Files')) return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolder(folderSel);
  };

  const handleFolderDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setDragOverFolder(null);
  };

  const handleFolderDrop = async (e: React.DragEvent, target: FolderSelection) => {
    if (target === 'all') {
      setDragOverFolder(null);
      return;
    }
    const idStr = e.dataTransfer.getData('asset-id');
    if (!idStr) {
      setDragOverFolder(null);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);

    const draggedId = parseInt(idStr, 10);
    const targetFolderId = target === 'unsorted' ? null : target;

    // If the dragged asset is part of a multi-selection, move all selected
    if (selectedIds.includes(draggedId) && selectedIds.length > 1) {
      handleBulkMove(targetFolderId);
      return;
    }

    // Single asset move
    handleSingleMove(draggedId, targetFolderId);
  };

  // ── Bulk move: selected assets → folder ──
  const handleBulkMove = async (targetFolderId: number | null) => {
    if (selectedIds.length === 0) return;

    const prevAssets = assets;
    const prevFolders = folders;
    const prevUnsorted = unsortedCount;

    // Optimistic: remove from view if filtered, or update folderId
    if (selectedFolder !== 'all') {
      setAssets((prev) => prev.filter((a) => !selectedIds.includes(a.id)));
    } else {
      setAssets((prev) =>
        prev.map((a) =>
          selectedIds.includes(a.id) ? { ...a, folderId: targetFolderId } : a
        )
      );
    }

    // Optimistic folder counts
    const movedAssets = assets.filter((a) => selectedIds.includes(a.id));
    const sourceCountMap = new Map<number | null, number>();
    for (const a of movedAssets) {
      const src = a.folderId ?? null;
      if (src !== targetFolderId) {
        sourceCountMap.set(src, (sourceCountMap.get(src) ?? 0) + 1);
      }
    }
    const targetGain = Array.from(sourceCountMap.values()).reduce((a, b) => a + b, 0);

    setFolders((prev) =>
      prev.map((f) => {
        let delta = 0;
        if (f.id === targetFolderId) delta = targetGain;
        if (sourceCountMap.has(f.id)) delta = -(sourceCountMap.get(f.id)!);
        return delta !== 0
          ? { ...f, _count: { assets: Math.max(0, (f._count?.assets ?? 0) + delta) } }
          : f;
      })
    );
    if (targetFolderId === null) setUnsortedCount((c) => c + targetGain);
    if (sourceCountMap.has(null)) setUnsortedCount((c) => Math.max(0, c - sourceCountMap.get(null)!));

    try {
      await Promise.all(
        selectedIds
          .filter((id) => {
            const a = movedAssets.find((x) => x.id === id);
            return a && (a.folderId ?? null) !== targetFolderId;
          })
          .map((id) => moveAssetToFolder(id, targetFolderId))
      );
      setSelectedIds([]);
      gooeyToast.success('Verschoben', {
        description: `${selectedIds.length} Asset(s) verschoben.`,
      });
    } catch {
      setAssets(prevAssets);
      setFolders(prevFolders);
      setUnsortedCount(prevUnsorted);
      gooeyToast.error('Fehler', {
        description: 'Assets konnten nicht verschoben werden.',
      });
    }
  };

  // ── Single asset context move ──
  const handleSingleMove = async (assetId: number, targetFolderId: number | null) => {
    const prevAssets = assets;
    const prevFolders = folders;
    const prevUnsorted = unsortedCount;
    const asset = assets.find((a) => a.id === assetId);
    if (!asset || (asset.folderId ?? null) === targetFolderId) return;

    const previousFolderId = asset.folderId ?? null;

    if (selectedFolder !== 'all') {
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
    } else {
      setAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, folderId: targetFolderId } : a))
      );
    }
    setFolders((prev) =>
      prev.map((f) => {
        if (f.id === targetFolderId) return { ...f, _count: { assets: (f._count?.assets ?? 0) + 1 } };
        if (f.id === previousFolderId) return { ...f, _count: { assets: Math.max(0, (f._count?.assets ?? 0) - 1) } };
        return f;
      })
    );
    if (targetFolderId === null) setUnsortedCount((c) => c + 1);
    if (previousFolderId === null) setUnsortedCount((c) => Math.max(0, c - 1));

    try {
      await moveAssetToFolder(assetId, targetFolderId);
    } catch {
      setAssets(prevAssets);
      setFolders(prevFolders);
      setUnsortedCount(prevUnsorted);
      gooeyToast.error('Fehler', {
        description: 'Asset konnte nicht verschoben werden.',
      });
    }
  };

  // ── Render helpers ──
  const FolderRow = ({
    sel,
    label,
    icon,
    color,
    count,
    folder,
  }: {
    sel: FolderSelection;
    label: string;
    icon: React.ReactNode;
    color?: string;
    count: number;
    folder?: Folder;
  }) => {
    const isActive = selectedFolder === sel;
    const isDropTarget = dragOverFolder === sel && sel !== 'all';
    return (
      <div
        onClick={() => setSelectedFolder(sel)}
        onDragOver={(e) => handleFolderDragOver(e, sel)}
        onDragLeave={handleFolderDragLeave}
        onDrop={(e) => handleFolderDrop(e, sel)}
        className={cn(
          'group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors',
          isActive
            ? 'bg-blue-600/20 text-white border border-blue-600/40'
            : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border border-transparent',
          isDropTarget && 'ring-2 ring-blue-400 bg-blue-500/20'
        )}
      >
        <div className="flex h-4 w-4 items-center justify-center shrink-0">
          {color ? (
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: color }}
            />
          ) : (
            icon
          )}
        </div>
        <span className="flex-1 truncate">{label}</span>
        <span className="text-xs text-zinc-500 tabular-nums shrink-0">{count}</span>
        {folder && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded hover:bg-zinc-800"
                aria-label="Ordneroptionen"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-zinc-950 border-zinc-800 text-zinc-100">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setRenameTarget(folder);
                  setRenameValue(folder.name);
                }}
                className="cursor-pointer focus:bg-zinc-800"
              >
                <Pencil className="h-4 w-4" /> Umbenennen
              </DropdownMenuItem>
              <Popover>
                <PopoverTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer focus:bg-zinc-800"
                  >
                    <Palette className="h-4 w-4" /> Farbe ändern
                  </DropdownMenuItem>
                </PopoverTrigger>
                <PopoverContent
                  side="right"
                  align="start"
                  className="w-auto bg-zinc-950 border-zinc-800 p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FolderColorPicker
                    value={folder.color}
                    onChange={(c) => handleRecolor(folder, c)}
                  />
                </PopoverContent>
              </Popover>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setFolderToDelete(folder);
                }}
                className="cursor-pointer text-red-400 focus:bg-red-900/30 focus:text-red-300"
              >
                <Trash2 className="h-4 w-4" /> Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  if (loading && assets.length === 0 && folders.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <UploadDropzone
      projectId={activeProjectId}
      folderId={folderForUpload}
      onUploadStart={handleUploadStart}
      onUploadComplete={handleUploadComplete}
      onUploadError={(msg) => {
        if (uploadToastIdRef.current != null) {
          gooeyToast.dismiss(uploadToastIdRef.current);
          uploadToastIdRef.current = null;
        }
        gooeyToast.error('Upload fehlgeschlagen', { description: msg });
      }}
      onDuplicate={({ filename, existing, retry }) => setDuplicateInfo({ filename, existing, retry })}
      className="h-full w-full flex flex-col bg-zinc-950"
    >
      <div className="h-full w-full flex min-h-0">
        {/* Left rail — folders */}
        <aside className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col min-h-0">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Ordner
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <FolderRow
              sel="all"
              label="Alle Assets"
              icon={<Layers className="h-4 w-4" />}
              count={totalAssetsCount}
            />
            <FolderRow
              sel="unsorted"
              label="Unsortiert"
              icon={<Inbox className="h-4 w-4" />}
              count={unsortedCount}
            />
            {folders.length > 0 && (
              <div className="pt-2 mt-2 border-t border-zinc-800/50">
                {folders.map((folder) => (
                  <FolderRow
                    key={folder.id}
                    sel={folder.id}
                    label={folder.name}
                    icon={<FolderIcon className="h-4 w-4" />}
                    color={folder.color}
                    count={folder._count?.assets ?? 0}
                    folder={folder}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="p-3 border-t border-zinc-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              disabled={!activeProjectId}
              className="w-full bg-transparent border-blue-700 text-blue-200 hover:bg-blue-900/30 hover:text-white"
            >
              <FolderPlus className="h-4 w-4 mr-2" /> Neuer Ordner
            </Button>
          </div>
        </aside>

        {/* Right column — asset grid */}
        <div className="flex-1 overflow-auto p-6 space-y-6 pb-20">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white mb-2">Asset Library</h2>
              <p className="text-gray-400">
                Verwalte deine Dateien und ordne sie in Ordnern. Klicke ein Asset, um Details zu bearbeiten.
              </p>
            </div>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 bg-blue-900/30 px-4 py-2 rounded-lg border border-blue-800">
                <span className="text-sm font-medium text-blue-100">
                  {selectedIds.length} ausgewählt
                </span>
                {folders.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="secondary" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100">
                        <FolderInput className="h-4 w-4 mr-2" />
                        In Ordner verschieben
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48 bg-zinc-950 border-zinc-800 text-zinc-100">
                      <DropdownMenuItem
                        onClick={() => handleBulkMove(null)}
                        className="cursor-pointer focus:bg-zinc-800"
                      >
                        <Inbox className="h-4 w-4" /> Unsortiert
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-zinc-800" />
                      {folders.map((f) => (
                        <DropdownMenuItem
                          key={f.id}
                          onClick={() => handleBulkMove(f.id)}
                          className="cursor-pointer focus:bg-zinc-800"
                        >
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                          {f.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setAssetsToDelete(selectedIds)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Auswahl löschen
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds([])}
                  className="text-blue-200 hover:text-white hover:bg-blue-800/50"
                >
                  Abbrechen
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end mb-2">
            {assets.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="text-zinc-400 hover:text-white"
              >
                {selectedIds.length === assets.length ? 'Auswahl aufheben' : 'Alle auswählen'}
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-20 text-gray-500 border-2 border-dashed border-zinc-800 rounded-xl">
              <FileIcon className="mx-auto h-16 w-16 opacity-20 mb-4" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">
                {selectedFolder === 'all'
                  ? 'Noch keine Assets'
                  : selectedFolder === 'unsorted'
                  ? 'Keine unsortierten Assets'
                  : 'Dieser Ordner ist leer'}
              </h3>
              <p>Dateien per Drag & Drop hochladen.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {assets.map((asset) => {
                const isSelected = selectedIds.includes(asset.id);
                const ext = asset.filename.split('.').pop()?.toLowerCase();
                const isModel = asset.type === 'model3d' || ext === 'glb' || ext === 'gltf';
                const isVideo = asset.type === 'video';
                return (
                  <Card
                    key={asset.id}
                    draggable
                    onDragStart={(e) => handleAssetDragStart(e, asset.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ assetId: asset.id, x: e.clientX, y: e.clientY });
                    }}
                    className={cn(
                      'bg-zinc-950 overflow-hidden group transition-all cursor-pointer relative',
                      isSelected
                        ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-900/10'
                        : 'border-zinc-800 hover:border-zinc-700'
                    )}
                    onClick={(e) => toggleSelect(asset.id, e)}
                  >
                    <div className="aspect-square relative flex items-center justify-center bg-black/40 p-2">
                      {isModel ? (
                        <ModelPreviewCard url={asset.path} />
                      ) : isVideo ? (
                        <div className="relative w-full h-full flex items-center justify-center">
                          {asset.thumbnailPath ? (
                            <img
                              src={asset.thumbnailPath}
                              alt={asset.filename}
                              className="max-h-full max-w-full object-contain"
                              draggable={false}
                            />
                          ) : (
                            <div className="w-full h-full bg-zinc-800" />
                          )}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-black/60 rounded-full p-2">
                              <Play className="h-6 w-6 text-white fill-white" />
                            </div>
                          </div>
                        </div>
                      ) : (asset.type || 'image') === 'image' ? (
                        <img
                          src={asset.path}
                          alt={asset.filename}
                          className={cn(
                            'max-h-full max-w-full object-contain transition-opacity',
                            isSelected ? 'opacity-90' : 'opacity-100'
                          )}
                          draggable={false}
                        />
                      ) : (
                        <FileIcon className="h-12 w-12 text-gray-600" />
                      )}

                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8 pointer-events-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAsset(asset);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="h-8 w-8 pointer-events-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssetsToDelete([asset.id]);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <CardFooter className="p-3 flex flex-col items-start gap-1">
                      <p
                        className="text-xs font-medium text-gray-200 truncate w-full"
                        title={asset.artwork?.title || asset.filename}
                      >
                        {asset.artwork?.title || asset.filename}
                      </p>
                      <div className="flex justify-between w-full text-[10px] text-gray-500">
                        <span>{formatBytes(asset.size)}</span>
                        {asset.type === 'video' && asset.duration ? (
                          <span>{formatDuration(asset.duration)}</span>
                        ) : asset.type === 'model3d' ? (
                          <span>.{asset.filename.split('.').pop()}</span>
                        ) : (
                          <span>
                            {asset.width}x{asset.height} px
                          </span>
                        )}
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Right-click context menu */}
          {contextMenu && (
            <>
              <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
              <div
                className="fixed z-50 min-w-[200px] rounded-md border border-zinc-800 bg-zinc-950 p-1 shadow-xl"
                style={{ left: contextMenu.x, top: contextMenu.y }}
              >
                <button
                  onClick={() => { setSelectedAsset(assets.find((a) => a.id === contextMenu.assetId) ?? null); setContextMenu(null); }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-zinc-100 hover:bg-zinc-800"
                >
                  <Edit className="h-4 w-4" /> Bearbeiten
                </button>
                <button
                  onClick={() => { setAssetsToDelete([contextMenu.assetId]); setContextMenu(null); }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-400 hover:bg-red-900/30"
                >
                  <Trash2 className="h-4 w-4" /> Löschen
                </button>
                {folders.length > 0 && (
                  <>
                    <div className="my-1 h-px bg-zinc-800" />
                    <div className="px-2 py-1 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                      Verschieben nach
                    </div>
                    <button
                      onClick={() => { handleSingleMove(contextMenu.assetId, null); setContextMenu(null); }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-zinc-100 hover:bg-zinc-800"
                    >
                      <Inbox className="h-4 w-4" /> Unsortiert
                    </button>
                    {folders.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => { handleSingleMove(contextMenu.assetId, f.id); setContextMenu(null); }}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-zinc-100 hover:bg-zinc-800"
                      >
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                        {f.name}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </>
          )}

          {/* Duplicate Warning Dialog */}
          <Dialog open={!!duplicateInfo} onOpenChange={(open) => !open && setDuplicateInfo(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Datei bereits vorhanden</DialogTitle>
                <DialogDescription>
                  <span className="font-medium text-zinc-900">„{duplicateInfo?.filename}"</span> wurde in diesem Projekt bereits hochgeladen. Möchtest du sie trotzdem erneut hochladen?
                </DialogDescription>
              </DialogHeader>
              {duplicateInfo?.existing && (() => {
                const ex = duplicateInfo.existing;
                const isVideo = ex.type === 'video';
                const src = (isVideo ? ex.thumbnailPath : ex.path) as string | undefined;
                return (
                  <div className="rounded-lg overflow-hidden bg-zinc-100 flex items-center justify-center h-48">
                    {src ? (
                      <img
                        src={src}
                        alt={ex.filename as string}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <FileIcon className="h-12 w-12 text-zinc-400" />
                    )}
                  </div>
                );
              })()}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDuplicateInfo(null)} disabled={retrying}>
                  Abbrechen
                </Button>
                <Button
                  onClick={async () => {
                    if (!duplicateInfo) return;
                    setRetrying(true);
                    try {
                      await duplicateInfo.retry();
                    } finally {
                      setRetrying(false);
                      setDuplicateInfo(null);
                    }
                  }}
                  disabled={retrying}
                >
                  {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Trotzdem hochladen'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <Dialog
            open={assetsToDelete.length > 0}
            onOpenChange={(open) => !open && setAssetsToDelete([])}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {assetsToDelete.length > 1 ? `${assetsToDelete.length} Assets löschen` : 'Asset löschen'}
                </DialogTitle>
                <DialogDescription>
                  {assetsToDelete.length > 1
                    ? 'Möchtest du diese Assets wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.'
                    : 'Möchtest du dieses Asset wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.'}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssetsToDelete([])}>
                  Abbrechen
                </Button>
                <Button variant="destructive" onClick={confirmDelete}>
                  Löschen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Metadata Edit Dialog */}
          {selectedAsset && (
            <MetadataDialog
              asset={selectedAsset}
              onSave={handleMetadataSaved}
              onCancel={() => setSelectedAsset(null)}
            />
          )}

          {/* Create Folder Dialog */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Neuer Ordner</DialogTitle>
                <DialogDescription>
                  Erstelle einen Ordner, um Assets in diesem Projekt zu organisieren.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="folder-name">Name</Label>
                  <Input
                    id="folder-name"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="z.B. Entwürfe"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateFolder();
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Farbe</Label>
                  <FolderColorPicker value={createColor} onChange={setCreateColor} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button onClick={handleCreateFolder} disabled={creating || !createName.trim()}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Erstellen'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Rename Folder Dialog */}
          <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ordner umbenennen</DialogTitle>
              </DialogHeader>
              <div className="py-2">
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleRename();
                    }
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRenameTarget(null)}>
                  Abbrechen
                </Button>
                <Button onClick={handleRename} disabled={renaming || !renameValue.trim()}>
                  {renaming ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Speichern'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Folder Confirmation */}
          <Dialog open={!!folderToDelete} onOpenChange={(open) => !open && setFolderToDelete(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ordner löschen</DialogTitle>
                <DialogDescription>
                  Möchtest du den Ordner „{folderToDelete?.name}" wirklich löschen? Die enthaltenen Assets
                  werden nach „Unsortiert" verschoben.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFolderToDelete(null)}>
                  Abbrechen
                </Button>
                <Button variant="destructive" onClick={handleDeleteFolder} disabled={deletingFolder}>
                  {deletingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Löschen'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </UploadDropzone>
  );
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
