import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileIcon, Loader2, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { ModelPreviewCard } from './ModelPreviewCard';
import { gooeyToast } from 'goey-toast';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editorStore';
import { type Folder, listFolders, moveAssetToFolder } from '@/lib/folders';

interface AssetSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
}

interface Asset {
  id: number;
  filename: string;
  path: string;
  mimetype: string;
  type?: string;
  width: number;
  height: number;
  dpi?: number;
  thumbnailPath?: string | null;
  artwork?: {
    id: number;
    title: string;
    width?: number;
    height?: number;
  } | null;
}

type FolderFilter = 'all' | number;

export const AssetSidebar = ({ isOpen, onToggle }: AssetSidebarProps) => {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(false);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [activeFilter, setActiveFilter] = useState<FolderFilter>('all');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [dragOverFolderId, setDragOverFolderId] = useState<number | 'all' | null>(null);
    const setDragging = useEditorStore((state) => state.setDragging);
    const activeProjectId = useEditorStore((state) => state.activeProjectId);

    const fetchAssets = useCallback(async (filter: FolderFilter) => {
        if (!activeProjectId) {
            setAssets([]);
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const params = new URLSearchParams();
            params.set('projectId', String(activeProjectId));
            if (typeof filter === 'number') params.set('folderId', String(filter));
            const qs = params.toString();
            const res = await fetch(`/api/assets?${qs}`);
            if (!res.ok) throw new Error('Failed to fetch assets');
            const data = await res.json();
            setAssets(data);
        } catch (err) {
            console.error(err);
            gooeyToast.error("Fehler", {
                description: "Assets konnten nicht geladen werden.",
            });
        } finally {
            setLoading(false);
        }
    }, [activeProjectId]);

    // Fetch folders list
    useEffect(() => {
        if (!activeProjectId) { setFolders([]); return; }
        listFolders(activeProjectId)
            .then((data) => setFolders(data.folders))
            .catch(() => { /* silently ignore — folders are optional */ });
    }, [activeProjectId]);

    // Reset filter and selection when project changes
    useEffect(() => {
        setActiveFilter('all');
        setSelectedIds(new Set());
    }, [activeProjectId]);

    useEffect(() => {
        fetchAssets(activeFilter);
    }, [activeFilter, fetchAssets]);

    const handleAssetClick = (e: React.MouseEvent, assetId: number) => {
        if (e.ctrlKey || e.metaKey) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(assetId)) next.delete(assetId);
                else next.add(assetId);
                return next;
            });
        } else {
            setSelectedIds(prev => prev.size === 1 && prev.has(assetId) ? new Set() : new Set([assetId]));
        }
    };

    const handleDragStart = (e: React.DragEvent, asset: Asset) => {
        // If the dragged asset isn't selected, treat it as a solo drag
        const dragIds = selectedIds.has(asset.id) && selectedIds.size > 1
            ? Array.from(selectedIds)
            : [asset.id];

        // Store IDs for folder drop targets
        e.dataTransfer.setData('asset-ids', JSON.stringify(dragIds));

        // Replace browser drag ghost with an invisible image (canvas drop uses store state instead)
        const emptyImg = document.createElement('canvas');
        emptyImg.width = 1;
        emptyImg.height = 1;
        e.dataTransfer.setDragImage(emptyImg, 0, 0);

        e.dataTransfer.setData('asset-id', asset.id.toString());
        e.dataTransfer.setData('asset-data', JSON.stringify(asset));
        e.dataTransfer.effectAllowed = 'copyMove';

        const isArtwork = !!asset.artwork;
        const id = isArtwork ? asset.artwork!.id : asset.id;

        setDragging(true, {
            id,
            type: isArtwork ? 'artwork' : 'asset',
            assetType: (asset.type as 'image' | 'video' | 'model3d') || 'image',
            width: asset.width,
            height: asset.height,
            dpi: asset.dpi || 72,
            url: asset.type === 'video' && asset.thumbnailPath ? asset.thumbnailPath : asset.path,
            videoUrl: asset.type === 'video' ? asset.path : undefined,
            artworkWidth: asset.artwork?.width,
            artworkHeight: asset.artwork?.height,
        });
    };

    const handleDragEnd = () => {
        setDragging(false, null);
        setDragOverFolderId(null);
    };

    const handleFolderDragOver = (e: React.DragEvent, folderId: number | 'all') => {
        if (!e.dataTransfer.types.includes('asset-ids')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverFolderId(folderId);
    };

    const handleFolderDragLeave = (e: React.DragEvent) => {
        // Only clear if leaving to outside the pill element
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverFolderId(null);
        }
    };

    const handleFolderDrop = async (e: React.DragEvent, targetFolderId: number | null) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverFolderId(null);
        setDragging(false, null);

        const idsJson = e.dataTransfer.getData('asset-ids');
        if (!idsJson) return;
        const ids: number[] = JSON.parse(idsJson);

        try {
            await Promise.all(ids.map(id => moveAssetToFolder(id, targetFolderId)));
            const label = ids.length === 1 ? '1 Asset' : `${ids.length} Assets`;
            gooeyToast.success(`${label} verschoben`);
            setSelectedIds(new Set());
            fetchAssets(activeFilter);
        } catch {
            gooeyToast.error("Fehler", { description: "Assets konnten nicht verschoben werden." });
        }
    };

    return (
        <>
            <Card 
                className={cn(
                    "absolute left-4 top-6 bottom-8 w-64 bg-zinc-950/80 backdrop-blur-md border-zinc-800 shadow-xl flex flex-col z-20 rounded-xl overflow-hidden transition-transform duration-300 ease-in-out",
                    !isOpen && "-translate-x-[calc(100%+2rem)]" // Slide off screen
                )}
            >
                <CardHeader className="p-4 border-b border-zinc-800 bg-blue-600 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium text-white">Asset Library</CardTitle>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-blue-100 hover:text-white hover:bg-blue-700"
                        onClick={onToggle}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </CardHeader>
                {folders.length > 0 && (
                    <div data-asset-drop-zone className="flex gap-1.5 px-3 py-2 border-b border-zinc-800 overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => setActiveFilter('all')}
                            onDragOver={(e) => handleFolderDragOver(e, 'all')}
                            onDragLeave={handleFolderDragLeave}
                            onDrop={(e) => handleFolderDrop(e, null)}
                            className={cn(
                                'shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                                dragOverFolderId === 'all'
                                    ? 'bg-blue-400 text-white ring-2 ring-blue-300'
                                    : activeFilter === 'all'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                            )}
                        >
                            Alle
                        </button>
                        {folders.map((f) => (
                            <button
                                key={f.id}
                                onClick={() => setActiveFilter(f.id)}
                                onDragOver={(e) => handleFolderDragOver(e, f.id)}
                                onDragLeave={handleFolderDragLeave}
                                onDrop={(e) => handleFolderDrop(e, f.id)}
                                className={cn(
                                    'shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                                    dragOverFolderId === f.id
                                        ? 'text-white ring-2 ring-white/60'
                                        : activeFilter === f.id
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                                )}
                                style={dragOverFolderId === f.id ? { backgroundColor: f.color } : undefined}
                            >
                                <span
                                    className="h-2 w-2 rounded-full shrink-0"
                                    style={{ backgroundColor: f.color }}
                                />
                                <span className="truncate max-w-[6rem]">{f.name}</span>
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {loading ? (
                         <div className="flex h-full items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                         </div>
                    ) : assets.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500 text-xs">
                            {!activeProjectId
                                ? 'Kein Projekt ausgewählt.'
                                : 'Keine Assets gefunden. Lade welche in der Asset-Bibliothek hoch.'}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            {assets.map((asset) => (
                                <div
                                    key={asset.id}
                                    draggable
                                    onClick={(e) => handleAssetClick(e, asset.id)}
                                    onDragStart={(e) => handleDragStart(e, asset)}
                                    onDragEnd={handleDragEnd}
                                    className={cn(
                                        "group relative aspect-square bg-zinc-900 rounded-md overflow-hidden border cursor-grab active:cursor-grabbing transition-colors",
                                        selectedIds.has(asset.id)
                                            ? "border-blue-500 ring-2 ring-blue-500/50"
                                            : "border-zinc-800 hover:border-zinc-600"
                                    )}
                                    title={asset.artwork?.title || asset.filename}
                                >
                                    {(asset.type || 'image') === 'image' ? (
                                        <img
                                            src={asset.path}
                                            alt={asset.filename}
                                            className="w-full h-full object-cover"
                                            draggable={false}
                                        />
                                    ) : asset.type === 'video' ? (
                                        <div className="relative w-full h-full flex items-center justify-center bg-zinc-800">
                                            {asset.thumbnailPath ? (
                                                <img src={asset.thumbnailPath} alt={asset.filename} className="w-full h-full object-cover" draggable={false} />
                                            ) : null}
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <div className="bg-black/50 rounded-full p-1.5">
                                                    <Play className="h-4 w-4 text-white fill-white" />
                                                </div>
                                            </div>
                                        </div>
                                    ) : asset.type === 'model3d' ? (
                                        <div className="flex items-center justify-center h-full bg-zinc-800">
                                            <ModelPreviewCard url={asset.path} compact />
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-full">
                                            <FileIcon className="h-6 w-6 text-zinc-600" />
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 translate-y-full group-hover:translate-y-0 transition-transform">
                                        <p className="text-[10px] text-white truncate text-center">
                                            {asset.artwork?.title || asset.filename}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Card>

            {/* Toggle Button (Visible when closed) */}
            <div 
                className={cn(
                    "absolute left-0 top-[3.25rem] -translate-y-1/2 z-10 transition-transform duration-300 ease-in-out",
                    isOpen && "-translate-x-full" // Hide when open
                )}
            >
                <Button
                    variant="secondary"
                    size="sm"
                    className="h-12 w-6 rounded-r-lg rounded-l-none bg-blue-600 border-y border-r border-blue-700 shadow-md p-0 flex items-center justify-center hover:bg-blue-500"
                    onClick={onToggle}
                >
                    <ChevronRight className="h-4 w-4 text-white" />
                </Button>
            </div>
        </>
    );
};
