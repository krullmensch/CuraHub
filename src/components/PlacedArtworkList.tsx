import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Box, ChevronDown, ChevronRight, Play, Sparkles } from 'lucide-react';
import { useEditorStore, type ArtworkInstanceData } from '../store/editorStore';
import { useWallEditorView } from '../store/wallEditorViewStore';
import { cn } from '@/lib/utils';
import { displayArtworkTitle } from '@/lib/artworkTitle';
import { groupPlacedArtworks, rangeSelection } from '@/lib/placedArtworkGroups';
import { HolderBadge } from './live/PresenceAvatars';
import { useHeldByOthers } from '../hooks/use-held-claims';

const Thumbnail = ({ inst }: { inst: ArtworkInstanceData }) => {
    const asset = inst.artwork.asset;
    const type = asset.type ?? 'image';
    if (type === 'image') {
        return <img src={asset.thumbnailPath ?? asset.path} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded object-cover bg-zinc-800" />;
    }
    const Icon = type === 'video' ? Play : type === 'splat' ? Sparkles : Box;
    return (
        <span className="h-8 w-8 shrink-0 rounded bg-zinc-800 flex items-center justify-center text-zinc-500">
            <Icon className="h-4 w-4" />
        </span>
    );
};

/**
 * The artworks of the version, by the wall they hang on. Selection works like in a file list:
 * click = only this one, ⌘/Ctrl-click = add/remove, ⇧-click = range from the primary artwork.
 */
export const PlacedArtworkList = () => {
    const localInstances = useEditorStore((state) => state.localInstances);
    const localWalls = useEditorStore((state) => state.localWalls);
    const roomFaces = useWallEditorView((state) => state.roomFaces);
    const selectedIds = useEditorStore(useShallow((state) => state.selectedInstanceIds));
    const primaryId = useEditorStore((state) => state.selectedInstanceId);
    const selectInstance = useEditorStore((state) => state.selectInstance);
    const setInstanceSelection = useEditorStore((state) => state.setInstanceSelection);
    const toggleInstanceInSelection = useEditorStore((state) => state.toggleInstanceInSelection);
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const rowRefs = useRef(new Map<number, HTMLButtonElement>());
    const held = useHeldByOthers();

    const groups = useMemo(() => groupPlacedArtworks(localInstances, localWalls, roomFaces), [localInstances, localWalls, roomFaces]);
    const byId = useMemo(() => new Map(localInstances.map((inst) => [inst.id, inst])), [localInstances]);
    const order = useMemo(() => groups.flatMap((group) => group.ids), [groups]);

    // Keep the primary artwork in view when it is picked in the 3D view.
    useEffect(() => {
        if (primaryId !== null) rowRefs.current.get(primaryId)?.scrollIntoView({ block: 'nearest' });
    }, [primaryId]);

    const pick = (id: number, e: React.MouseEvent) => {
        if (e.metaKey || e.ctrlKey) toggleInstanceInSelection(id);
        else if (e.shiftKey) setInstanceSelection(rangeSelection(order, primaryId, id), id);
        else selectInstance(id);
    };

    const toggleGroup = (key: string) => setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
    });

    if (groups.length === 0) {
        return <p className="p-4 text-xs text-zinc-500 italic text-center">Noch keine Werke im Raum.</p>;
    }

    return (
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {groups.map((group) => {
                const open = !collapsed.has(group.key);
                return (
                    <div key={group.key} className="mb-2">
                        <div className="flex items-center gap-1 px-1 py-1">
                            <button
                                type="button"
                                onClick={() => toggleGroup(group.key)}
                                className="text-zinc-500 hover:text-zinc-200"
                                aria-label={open ? 'Einklappen' : 'Ausklappen'}
                            >
                                {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setInstanceSelection(group.ids)}
                                className="flex-1 truncate text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-100"
                                title="Alle Werke dieser Fläche auswählen"
                            >
                                {group.label}
                            </button>
                            <span className="text-[10px] tabular-nums text-zinc-500">{group.ids.length}</span>
                        </div>
                        {open && group.ids.map((id) => {
                            const inst = byId.get(id);
                            if (!inst) return null;
                            const selected = selectedIds.includes(id);
                            const holder = held.get(`instance:${id}`);
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    ref={(el) => {
                                        if (el) rowRefs.current.set(id, el);
                                        else rowRefs.current.delete(id);
                                    }}
                                    onClick={(e) => pick(id, e)}
                                    className={cn(
                                        'w-full flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors',
                                        selected ? 'bg-blue-600/30 hover:bg-blue-600/40' : 'hover:bg-zinc-800',
                                        holder && 'opacity-60',
                                    )}
                                >
                                    <Thumbnail inst={inst} />
                                    <span className={cn(
                                        'flex-1 truncate text-xs',
                                        id === primaryId ? 'font-semibold text-white' : selected ? 'text-zinc-100' : 'text-zinc-300',
                                    )}>
                                        {displayArtworkTitle(inst.artwork?.title || '') || 'Ohne Titel'}
                                    </span>
                                    {holder && <HolderBadge holder={holder} />}
                                </button>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
};
