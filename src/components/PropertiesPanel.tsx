import { useState, useEffect, useCallback, useRef, type InputHTMLAttributes } from 'react';
import { useEditorStore, videoRefMap, modelBBoxMap, isFloorAssetType } from '../store/editorStore';
import type { TransformMode, MediumType } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { gooeyToast } from 'goey-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
    Move,
    RotateCcw,
    Maximize2,
    Link,
    Unlink,
    Trash2,
    ChevronRight,
    ChevronLeft,
    Focus,
    Lock,
    Unlock,
    Play,
    Pause,
    Volume2,
    VolumeX,
    PanelsTopLeft,
} from 'lucide-react';
import { WallEditorPanel } from './wall-editor/WallEditorPanel';
import { sideOfInstance, WALL_SIDES, WALL_SIDE_LABELS, type WallSide } from '@/lib/wallEditor/geometry';
import { targetForInstance, type WallEditorTarget } from '@/lib/wallEditor/faces';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import { useFaceDirectory } from '@/hooks/use-face-directory';
import {
    DEFAULT_FRAME_STYLE,
    DEFAULT_PASSEPARTOUT_WIDTH_CM,
    FRAME_FINISHES,
    FRAME_LINES,
    FRAME_MANUFACTURER_LABELS,
    FRAME_PROFILES,
    MAX_PASSEPARTOUT_WIDTH_CM,
    PASSEPARTOUT_PLACEMENTS,
    PROFILE_FINISHES,
    frameLineOf,
    frameStyle as frameStyleSpec,
    frameStyleOf,
    framedArtworkLayout,
    isPassepartoutPlacement,
    profileFitsFormat,
    styleForProfile,
    styleIdOf,
    type FrameFinishId,
    type FrameProfileId,
    type FrameStyleId,
    type PassepartoutPlacement,
} from '@/lib/frameStyles';
import type { LucideIcon } from 'lucide-react';

// Numeric input that holds local string state while focused, only committing on blur/Enter.
// This prevents React from snapping the value back mid-edit (e.g. after typing "-" or "1.").
interface NumericInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
    value: string | number;
    onChange: (raw: string) => void;
    className?: string;
}

const NumericInput = ({ value, onChange, className, ...props }: NumericInputProps) => {
    const [local, setLocal] = useState(String(value));
    const [focused, setFocused] = useState(false);
    const [syncedValue, setSyncedValue] = useState(value);

    // Sync from outside only when not focused (state adjusted during render instead of in an effect)
    if (!focused && !Object.is(value, syncedValue)) {
        setSyncedValue(value);
        setLocal(String(value));
    }

    return (
        <Input
            {...props}
            type="number"
            value={local}
            className={className}
            onFocus={() => setFocused(true)}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={() => {
                setFocused(false);
                onChange(local);
                // Reset to external value if input is invalid
                const n = parseFloat(local);
                if (isNaN(n)) setLocal(String(value));
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                }
            }}
        />
    );
};

interface TransformData {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number }; // radians
    scale: { x: number; y: number; z: number };
}

interface PropertiesPanelProps {
    isOpen: boolean;
    onToggle: () => void;
}

type RightTab = 'controls' | 'properties';

export const PropertiesPanel = ({ isOpen, onToggle }: PropertiesPanelProps) => {
    const [activeTab, setActiveTab] = useState<RightTab>('controls');
    const selectedId = useEditorStore((state) => state.selectedInstanceId);
    const selectedWallId = useEditorStore((state) => state.selectedWallId);
    const transformMode = useEditorStore((state) => state.transformMode);
    const setTransformMode = useEditorStore((state) => state.setTransformMode);
    const selectInstance = useEditorStore((state) => state.selectInstance);
    const setFocusTarget = useEditorStore((state) => state.setFocusTarget);
    const liveTransform = useEditorStore((state) => state.liveTransform);
    const token = useAuthStore((state) => state.token);
    const activeVersionId = useEditorStore((state) => state.activeVersionId);
    const wallEditorOpen = useEditorStore((state) => !!state.wallEditor);

    // Sync active tab to properties when something is selected
    useEffect(() => {
        if (selectedId || selectedWallId) {
            // Use setTimeout to avoid synchronous setState warning in some linters/react versions
            const timer = setTimeout(() => {
                setActiveTab('properties');
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [selectedId, selectedWallId]);

    const [transform, setTransform] = useState<TransformData>({
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
    });
    const [aspectLocked, setAspectLocked] = useState(true);
    const [assetMeta, setAssetMeta] = useState<{ widthPx: number; heightPx: number; dpi: number; type?: string; physicalWidth?: number | null; physicalHeight?: number | null } | null>(null);
    const [instanceMedium, setInstanceMedium] = useState<MediumType>('frame');
    const [instanceFrameStyle, setInstanceFrameStyle] = useState<FrameStyleId>(DEFAULT_FRAME_STYLE);
    const [instancePassepartout, setInstancePassepartout] = useState<PassepartoutValue>(NO_PASSEPARTOUT);
    const setDefaultFrameStyle = useEditorStore((state) => state.setDefaultFrameStyle);
    const setDefaultPassepartout = useEditorStore((state) => state.setDefaultPassepartout);
    // Remember what to go back to when the curator switches framing / the passepartout back on.
    const lastFramedStyle = useRef<FrameStyleId>(DEFAULT_FRAME_STYLE);
    const lastPassepartoutWidth = useRef(DEFAULT_PASSEPARTOUT_WIDTH_CM);

    // For 3D models: use the natural bounding box size (in meters) from the scene as the base.
    // Falls back to { 1, 1, 1 } until the model renders and populates modelBBoxMap.
    const modelNaturalSize = (isFloorAssetType(assetMeta?.type) && selectedId != null)
        ? (modelBBoxMap.get(selectedId) ?? null)
        : null;

    const baseCm = modelNaturalSize
        ? { x: modelNaturalSize.x, y: modelNaturalSize.y, z: modelNaturalSize.z }
        : isFloorAssetType(assetMeta?.type) ? { x: 1, y: 1, z: 1 }
        : assetMeta ? {
            x: (assetMeta.physicalWidth != null && assetMeta.physicalHeight != null) ? assetMeta.physicalWidth : (assetMeta.widthPx / assetMeta.dpi) * 2.54,
            y: (assetMeta.physicalWidth != null && assetMeta.physicalHeight != null) ? assetMeta.physicalHeight : (assetMeta.heightPx / assetMeta.dpi) * 2.54,
            z: 0.1,
        } : { x: 1, y: 1, z: 1 };

    const displayTransform = liveTransform ?? transform;

    const prevLive = useRef(liveTransform);
    useEffect(() => {
        if (prevLive.current && !liveTransform) {
            setTransform(prevLive.current);
        }
        prevLive.current = liveTransform;
    }, [liveTransform]);

    // First, read from local store whenever the selection changes (works for temp IDs and
    // already-loaded instances). Done during render so the panel never shows the previous
    // selection's values for a frame.
    const [loadedForId, setLoadedForId] = useState<number | null>(null);
    if (selectedId !== loadedForId) {
        setLoadedForId(selectedId);
        const localInst = selectedId
            ? useEditorStore.getState().localInstances.find(i => i.id === selectedId)
            : undefined;
        if (localInst) {
            setTransform({
                position: { x: localInst.position_x, y: localInst.position_y, z: localInst.position_z },
                rotation: { x: localInst.rotation_x, y: localInst.rotation_y, z: localInst.rotation_z },
                scale: { x: localInst.scale_x, y: localInst.scale_y, z: localInst.scale_z },
            });
            setInstanceMedium(localInst.medium || 'frame');
            const style = frameStyleOf(localInst.frameStyle);
            setInstanceFrameStyle(style);
            if (style !== 'none') lastFramedStyle.current = style;
            const passepartout = passepartoutOf(localInst);
            setInstancePassepartout(passepartout);
            if (passepartout.width > 0) lastPassepartoutWidth.current = passepartout.width;
            if (localInst.artwork?.asset) {
                setAssetMeta({
                    widthPx: localInst.artwork.asset.width,
                    heightPx: localInst.artwork.asset.height,
                    dpi: localInst.artwork.asset.dpi || 72,
                    type: localInst.artwork.asset.type,
                    physicalWidth: localInst.artwork.width,
                    physicalHeight: localInst.artwork.height,
                });
            }
        }
    }

    // Also fetch from API for authoritative data (enriches with server-side fields)
    useEffect(() => {
        if (!selectedId || !token || !activeVersionId) return;
        // Ignore responses that arrive after the selection changed
        let stale = false;
        const fetchInstance = async () => {
            const res = await fetch(`/api/instances?versionId=${activeVersionId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) return null;
            const instances = await res.json();
            return instances.find((i: { id: number }) => i.id === selectedId) ?? null;
        };

        fetchInstance()
            .then((inst) => {
                if (stale || !inst) return;
                setTransform({
                    position: { x: inst.position_x, y: inst.position_y, z: inst.position_z },
                    rotation: { x: inst.rotation_x, y: inst.rotation_y, z: inst.rotation_z },
                    scale: { x: inst.scale_x, y: inst.scale_y, z: inst.scale_z },
                });
                setInstanceMedium(inst.medium || 'frame');
                const style = frameStyleOf(inst.frameStyle);
                setInstanceFrameStyle(style);
                if (style !== 'none') lastFramedStyle.current = style;
                const passepartout = passepartoutOf(inst);
                setInstancePassepartout(passepartout);
                if (passepartout.width > 0) lastPassepartoutWidth.current = passepartout.width;
                if (inst.artwork?.asset) {
                    setAssetMeta({
                        widthPx: inst.artwork.asset.width,
                        heightPx: inst.artwork.asset.height,
                        dpi: inst.artwork.asset.dpi || 72,
                        type: inst.artwork.asset.type,
                        physicalWidth: inst.artwork.width,
                        physicalHeight: inst.artwork.height,
                    });
                }
            })
            .catch((err) => {
                console.error('Failed to fetch instance data:', err);
            });

        return () => { stale = true; };
    }, [selectedId, token, activeVersionId]);

    const saveTransform = useCallback((data: Partial<TransformData>) => {
        if (!selectedId) return;
        const store = useEditorStore.getState();
        const updatedInstances = store.localInstances.map(inst => {
            if (inst.id === selectedId) {
                return {
                    ...inst,
                    position_x: data.position ? data.position.x : inst.position_x,
                    position_y: data.position ? data.position.y : inst.position_y,
                    position_z: data.position ? data.position.z : inst.position_z,
                    rotation_x: data.rotation ? data.rotation.x : inst.rotation_x,
                    rotation_y: data.rotation ? data.rotation.y : inst.rotation_y,
                    rotation_z: data.rotation ? data.rotation.z : inst.rotation_z,
                    scale_x: data.scale ? data.scale.x : inst.scale_x,
                    scale_y: data.scale ? data.scale.y : inst.scale_y,
                    scale_z: data.scale ? data.scale.z : inst.scale_z,
                };
            }
            return inst;
        });
        store.commitLocalChange(updatedInstances);
    }, [selectedId]);

    const handleInputChange = (group: 'position' | 'rotation', axis: 'x' | 'y' | 'z', rawValue: string) => {
        let value = parseFloat(rawValue);
        if (isNaN(value)) return;
        // Keep artwork above floor: bottom edge must not go below Y=0
        if (group === 'position' && axis === 'y') {
            if (isFloorAssetType(instanceMedium)) {
                value = Math.max(0, value);
            } else {
                // Center is at position_y; the lowest edge is the frame (and passepartout) below
                // a picture, the picture's own edge for everything else.
                const pictureW = baseCm.x / 100 * Math.abs(transform.scale.x);
                const pictureH = baseCm.y / 100 * Math.abs(transform.scale.y);
                const isPicture = !assetMeta?.type || assetMeta.type === 'image';
                const below = isPicture
                    ? -framedArtworkLayout({
                        width: pictureW,
                        height: pictureH,
                        frameStyle: instanceFrameStyle,
                        passepartoutWidth: instancePassepartout.width,
                        passepartoutPlacement: instancePassepartout.placement,
                    }).bottom
                    : pictureH / 2;
                value = Math.max(below, value);
            }
        }
        const storeValue = group === 'rotation' ? (value * Math.PI) / 180 : value;
        const newTransform = { ...transform, [group]: { ...transform[group], [axis]: storeValue } };
        setTransform(newTransform);
        saveTransform({ [group]: newTransform[group] });
    };

    const handleScaleChange = (axis: 'x' | 'y' | 'z', rawValue: string) => {
        // Monitor uses a fixed-size GLB — never let the user resize it.
        if (instanceMedium === 'monitor') return;
        const cmValue = parseFloat(rawValue);
        if (isNaN(cmValue) || cmValue <= 0) return;
        const newScaleForAxis = cmValue / baseCm[axis];
        // Beamer must always preserve the video aspect ratio.
        const effectiveAspectLocked = aspectLocked || instanceMedium === 'beamer';
        let newScale: { x: number; y: number; z: number };
        if (effectiveAspectLocked) {
            const ratio = newScaleForAxis / transform.scale[axis];
            newScale = { x: transform.scale.x * ratio, y: transform.scale.y * ratio, z: transform.scale.z * ratio };
        } else {
            newScale = { ...transform.scale, [axis]: newScaleForAxis };
        }
        const newTransform = { ...transform, scale: newScale };
        setTransform(newTransform);
        saveTransform({ scale: newScale });
    };

    const handleDelete = () => {
        if (!selectedId) return;
        const store = useEditorStore.getState();
        const updatedInstances = store.localInstances.filter(inst => inst.id !== selectedId);
        store.commitLocalChange(updatedInstances);
        gooeyToast.success('Deleted', { description: 'Artwork removed from exhibition.' });
        selectInstance(null);
    };

    const handleMediumChange = useCallback((medium: MediumType) => {
        if (!selectedId) return;
        setInstanceMedium(medium);
        const store = useEditorStore.getState();
        const updatedInstances = store.localInstances.map(inst =>
            inst.id === selectedId ? { ...inst, medium } : inst
        );
        store.commitLocalChange(updatedInstances);
    }, [selectedId]);

    const handleFrameStyleChange = useCallback((frameStyle: FrameStyleId) => {
        if (!selectedId) return;
        setInstanceFrameStyle(frameStyle);
        if (frameStyle !== 'none') {
            lastFramedStyle.current = frameStyle;
            // New drops follow the style last picked here.
            setDefaultFrameStyle(frameStyle);
        }
        const store = useEditorStore.getState();
        store.commitLocalChange(store.localInstances.map(inst =>
            inst.id === selectedId ? { ...inst, frameStyle } : inst
        ));
    }, [selectedId, setDefaultFrameStyle]);

    // Restoring the previous style lives in the handler so the panel body never reads a ref
    // while rendering.
    const handleFrameToggle = useCallback((framed: boolean) => {
        const previous = lastFramedStyle.current;
        handleFrameStyleChange(!framed ? 'none' : previous === 'none' ? DEFAULT_FRAME_STYLE : previous);
    }, [handleFrameStyleChange]);

    const handlePassepartoutChange = useCallback((next: PassepartoutValue) => {
        if (!selectedId) return;
        const width = Math.min(Math.max(next.width, 0), MAX_PASSEPARTOUT_WIDTH_CM);
        const value = { width, placement: next.placement };
        setInstancePassepartout(value);
        if (width > 0) lastPassepartoutWidth.current = width;
        // New drops follow the passepartout last set here.
        setDefaultPassepartout(value);
        const store = useEditorStore.getState();
        store.commitLocalChange(store.localInstances.map(inst =>
            inst.id === selectedId ? { ...inst, passepartoutWidth: width, passepartoutPlacement: value.placement } : inst
        ));
    }, [selectedId, setDefaultPassepartout]);

    const handlePassepartoutToggle = useCallback((on: boolean) => {
        handlePassepartoutChange({ width: on ? lastPassepartoutWidth.current : 0, placement: instancePassepartout.placement });
    }, [handlePassepartoutChange, instancePassepartout.placement]);

    // Auto-promote legacy video media (display/projector/frame/wallpaper) to 'monitor' so the
    // restricted Monitor/Beamer dropdown stays in sync with the underlying instance value.
    useEffect(() => {
        if (assetMeta?.type !== 'video') return;
        if (instanceMedium === 'monitor' || instanceMedium === 'beamer') return;
        // Deferred like the tab sync above: this updates local state and the store
        const timer = setTimeout(() => handleMediumChange('monitor'), 0);
        return () => clearTimeout(timer);
    }, [assetMeta?.type, instanceMedium, handleMediumChange]);

    const handleFocus = () => {
        setFocusTarget({ 
            target: [displayTransform.position.x, displayTransform.position.y, displayTransform.position.z],
            isHoming: false
        });
    };

    const toDeg = (rad: number) => ((rad * 180) / Math.PI).toFixed(1);
    const toFixed = (v: number, d = 3) => v.toFixed(d);

    const modeButtons: { mode: TransformMode; icon: typeof Move; label: string }[] = [
        { mode: 'translate', icon: Move, label: 'Move (T)' },
        { mode: 'rotate', icon: RotateCcw, label: 'Rotate (R)' },
        { mode: 'scale', icon: Maximize2, label: 'Scale (S)' },
    ];

    const hasPropertiesContent = selectedId || selectedWallId;
    const headerAccent = 'bg-blue-600';

    return (
        <>
            <Card data-wall-editor-inset="right" className={cn(
                "absolute right-4 top-6 bottom-8 w-72 bg-zinc-950/80 backdrop-blur-md border-zinc-800 shadow-xl flex flex-col z-20 rounded-xl overflow-hidden transition-transform duration-300 ease-in-out",
                !isOpen && "translate-x-[calc(100%+2rem)]"
            )}>
                {wallEditorOpen ? <WallEditorPanel onToggle={onToggle} /> : <>
                <div className={cn("flex items-center border-b border-zinc-800", headerAccent)}>
                    <button onClick={() => setActiveTab('controls')} className={cn(
                        "flex-1 py-2.5 text-xs font-medium transition-colors",
                        activeTab === 'controls' ? "text-white bg-white/15" : "text-white/60 hover:text-white hover:bg-white/5"
                    )}>Controls</button>
                    <button onClick={() => setActiveTab('properties')} className={cn(
                        "flex-1 py-2.5 text-xs font-medium transition-colors",
                        activeTab === 'properties' ? "text-white bg-white/15" : "text-white/60 hover:text-white hover:bg-white/5"
                    )}>Properties</button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 mr-1" onClick={onToggle}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                {activeTab === 'controls' && <ControlsTabContent />}

                {activeTab === 'properties' && (
                    hasPropertiesContent ? (
                        selectedWallId ? <WallPropertiesContent /> :
                        <ArtworkPropertiesContent
                            transform={displayTransform}
                            transformMode={transformMode}
                            setTransformMode={setTransformMode}
                            modeButtons={modeButtons}
                            toDeg={toDeg}
                            toFixed={toFixed}
                            baseCm={baseCm}
                            aspectLocked={aspectLocked}
                            setAspectLocked={setAspectLocked}
                            handleInputChange={handleInputChange}
                            handleScaleChange={handleScaleChange}
                            handleFocus={handleFocus}
                            handleDelete={handleDelete}
                            medium={instanceMedium}
                            assetType={assetMeta?.type}
                            onMediumChange={handleMediumChange}
                            frameStyle={instanceFrameStyle}
                            onFrameToggle={handleFrameToggle}
                            onFrameStyleChange={handleFrameStyleChange}
                            passepartout={instancePassepartout}
                            onPassepartoutToggle={handlePassepartoutToggle}
                            onPassepartoutChange={handlePassepartoutChange}
                            selectedInstanceId={selectedId}
                        />
                    ) : (
                        <div className="flex-1 flex items-center justify-center p-4">
                            <p className="text-zinc-500 text-xs text-center italic">Select an artwork or wall to view its properties.</p>
                        </div>
                    )
                )}
                </>}
            </Card>

            <div className={cn("absolute right-0 top-[2.625rem] -translate-y-1/2 z-10 transition-transform duration-300 ease-in-out", isOpen && "translate-x-full")}>
                <Button variant="secondary" size="sm" className="h-12 w-6 rounded-l-lg rounded-r-none bg-blue-600 border-y border-l border-blue-700 shadow-md p-0 flex items-center justify-center hover:bg-blue-500" onClick={onToggle}>
                    <ChevronLeft className="h-4 w-4 text-white" />
                </Button>
            </div>
        </>
    );
};

// ── Sub-components for Tab Content ──

const ControlsTabContent = () => {
    const showTraverses = useEditorStore((state) => state.showTraverses);
    const toggleTraverses = useEditorStore((state) => state.toggleTraverses);
    const openWallEditor = useEditorStore((state) => state.openWallEditor);
    const faces = useFaceDirectory();

    return (
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-zinc-300 text-sm">Traverses</span>
                    <Button
                        variant={showTraverses ? "default" : "secondary"}
                        size="sm"
                        onClick={toggleTraverses}
                        className={cn("h-8 text-xs", showTraverses ? "bg-blue-600 hover:bg-blue-500" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700")}
                    >
                        {showTraverses ? "Visible" : "Hidden"}
                    </Button>
                </div>
                {faces.length > 0 && (
                    <>
                        <Separator className="bg-zinc-800" />
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400 uppercase tracking-wider">2D-Wandeditor</Label>
                            <p className="text-[11px] text-zinc-500">Wand frontal öffnen – auch per Doppelklick auf eine Wand.</p>
                            {faces.map((face) => (
                                <button
                                    key={face.key}
                                    type="button"
                                    onClick={() => openWallEditor(face.target)}
                                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800 transition-colors"
                                    title={`${face.label} im 2D-Wandeditor öffnen`}
                                >
                                    <PanelsTopLeft className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                                    <span className="flex-1 truncate">{face.label}</span>
                                    <span className="text-[10px] text-zinc-500">{face.group === 'room' ? 'Raum' : 'Stellwand'}</span>
                                    <span className="w-4 text-right text-[10px] tabular-nums text-zinc-400">{face.count}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

interface ArtworkPropertiesContentProps {
    transform: TransformData;
    transformMode: TransformMode;
    setTransformMode: (mode: TransformMode) => void;
    modeButtons: { mode: TransformMode; icon: LucideIcon; label: string }[];
    toDeg: (rad: number) => string;
    toFixed: (v: number, d?: number) => string;
    baseCm: { x: number; y: number; z: number };
    aspectLocked: boolean;
    setAspectLocked: (v: boolean) => void;
    handleInputChange: (type: 'position' | 'rotation', axis: 'x' | 'y' | 'z', raw: string) => void;
    handleScaleChange: (axis: 'x' | 'y' | 'z', raw: string) => void;
    handleFocus: () => void;
    handleDelete: () => void;
    medium: MediumType;
    assetType?: string;
    onMediumChange: (medium: MediumType) => void;
    frameStyle: FrameStyleId;
    onFrameToggle: (framed: boolean) => void;
    onFrameStyleChange: (frameStyle: FrameStyleId) => void;
    passepartout: PassepartoutValue;
    onPassepartoutToggle: (on: boolean) => void;
    onPassepartoutChange: (passepartout: PassepartoutValue) => void;
    selectedInstanceId: number | null;
}

const VIDEO_MEDIUM_OPTIONS: { value: MediumType; label: string }[] = [
    { value: 'monitor', label: 'Monitor' },
    { value: 'beamer',  label: 'Beamer'  },
];

const ArtworkPropertiesContent = ({
    transform, transformMode, setTransformMode, modeButtons,
    toDeg, toFixed, baseCm, aspectLocked, setAspectLocked,
    handleInputChange, handleScaleChange, handleFocus, handleDelete,
    medium, assetType, onMediumChange, frameStyle, onFrameToggle, onFrameStyleChange,
    passepartout, onPassepartoutToggle, onPassepartoutChange, selectedInstanceId,
}: ArtworkPropertiesContentProps) => {
    // Splats get the same floor-object controls as 3D models.
    const isModel = isFloorAssetType(assetType);
    const isVideo = assetType === 'video';
    const sizeLocked  = isVideo && medium === 'monitor';
    const sizeIsBeamer = isVideo && medium === 'beamer';
    const hideAspectToggle = sizeLocked || sizeIsBeamer;

    // Poll video element state for play/pause and mute UI
    const [videoPaused, setVideoPaused] = useState(true);
    const [videoMuted, setVideoMuted] = useState(true);

    useEffect(() => {
        if (!isVideo || !selectedInstanceId) return;
        const readVideoState = () => {
            const el = videoRefMap.get(selectedInstanceId);
            if (el) {
                setVideoPaused(el.paused);
                setVideoMuted(el.muted);
            }
        };
        const poll = setInterval(readVideoState, 250);
        // Immediate read (next tick)
        const initialRead = setTimeout(readVideoState, 0);
        return () => {
            clearInterval(poll);
            clearTimeout(initialRead);
        };
    }, [isVideo, selectedInstanceId]);

    const togglePlayPause = () => {
        if (!selectedInstanceId) return;
        const el = videoRefMap.get(selectedInstanceId);
        if (!el) return;
        if (el.paused) { el.play(); } else { el.pause(); }
        setVideoPaused(el.paused);
    };

    const toggleMute = () => {
        if (!selectedInstanceId) return;
        const el = videoRefMap.get(selectedInstanceId);
        if (!el) return;
        el.muted = !el.muted;
        setVideoMuted(el.muted);
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
            <div className="flex gap-1">
                {modeButtons.map(({ mode, icon: Icon, label }) => {
                    const isScaleDisabled = mode === 'scale' && sizeLocked;
                    return (
                        <Button key={mode} variant={transformMode === mode ? 'default' : 'secondary'} size="sm" onClick={() => setTransformMode(mode)} className={cn("flex-1 h-9 text-xs gap-1.5", transformMode === mode ? "bg-blue-600 hover:bg-blue-500" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700", isScaleDisabled && "opacity-40 cursor-not-allowed")} title={label} disabled={isScaleDisabled}>
                            <Icon className="h-3.5 w-3.5" />
                            {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </Button>
                    );
                })}
            </div>
            <Separator className="bg-zinc-800" />
            <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Position</Label>
                <div className="grid grid-cols-3 gap-2">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                        <div key={axis} className="space-y-1">
                            <Label className="text-[10px] text-zinc-500 uppercase">{axis}</Label>
                            <NumericInput step="0.01" value={toFixed(transform.position[axis])} onChange={(raw) => handleInputChange('position', axis, raw)} className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100" />
                        </div>
                    ))}
                </div>
            </div>
            <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Rotation (°)</Label>
                <div className="grid grid-cols-3 gap-2">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                        <div key={axis} className="space-y-1">
                            <Label className="text-[10px] text-zinc-500 uppercase">{axis}</Label>
                            <NumericInput step="1" value={toDeg(transform.rotation[axis])} onChange={(raw) => handleInputChange('rotation', axis, raw)} className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100" />
                        </div>
                    ))}
                </div>
            </div>
            <Separator className="bg-zinc-800" />
            {isVideo && (
                <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider">Wiedergabe</Label>
                    <select
                        value={medium === 'monitor' || medium === 'beamer' ? medium : 'monitor'}
                        onChange={(e) => onMediumChange(e.target.value as MediumType)}
                        className="w-full h-8 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        {VIDEO_MEDIUM_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
            )}
            {!isModel && !isVideo && (
                <FrameControls
                    frameStyle={frameStyle}
                    onFrameToggle={onFrameToggle}
                    onFrameStyleChange={onFrameStyleChange}
                    passepartout={passepartout}
                    onPassepartoutToggle={onPassepartoutToggle}
                    onPassepartoutChange={onPassepartoutChange}
                    pictureCm={{ w: baseCm.x * Math.abs(transform.scale.x), h: baseCm.y * Math.abs(transform.scale.y) }}
                />
            )}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider">{isModel ? 'Größe (m)' : 'Size (cm)'}</Label>
                    {!hideAspectToggle && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => setAspectLocked(!aspectLocked)} title={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}>
                            {aspectLocked ? <Link className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
                        </Button>
                    )}
                </div>
                <div className={cn("grid gap-2", isModel ? "grid-cols-3" : "grid-cols-2")}>
                    {(isModel
                        ? [['x', 'W'], ['y', 'H'], ['z', 'T']] as [string, string][]
                        : [['x', 'W'], ['y', 'H']] as [string, string][]
                    ).map(([axis, label]) => (
                        <div key={axis} className="space-y-1">
                            <Label className="text-[10px] text-zinc-500 uppercase">{label}</Label>
                            <NumericInput step={isModel ? "0.01" : "0.1"} min="0.001" value={toFixed(baseCm[axis as 'x' | 'y' | 'z'] * transform.scale[axis as 'x' | 'y' | 'z'], isModel ? 3 : 1)} onChange={(raw) => handleScaleChange(axis as 'x' | 'y' | 'z', raw)} className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100" disabled={sizeLocked} />
                        </div>
                    ))}
                </div>
                {sizeLocked && (
                    <p className="text-[10px] text-zinc-500 italic">Größe durch Modell vorgegeben</p>
                )}
            </div>
            {isVideo && (
                <>
                    <Separator className="bg-zinc-800" />
                    <div className="space-y-2">
                        <Label className="text-xs text-zinc-400 uppercase tracking-wider">Playback</Label>
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={togglePlayPause}
                                className={cn("flex-1 h-9 text-xs gap-1.5", !videoPaused ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700")}
                            >
                                {videoPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                                {videoPaused ? 'Play' : 'Pause'}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={toggleMute}
                                className={cn("flex-1 h-9 text-xs gap-1.5", !videoMuted ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700")}
                            >
                                {videoMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                                {videoMuted ? 'Unmute' : 'Mute'}
                            </Button>
                        </div>
                    </div>
                </>
            )}
            <OpenArtworkWallButton instanceId={selectedInstanceId} />
            <Separator className="bg-zinc-800" />
            <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={handleFocus} className="flex-1 bg-zinc-800 text-zinc-100 hover:bg-zinc-700">
                    <Focus className="h-4 w-4 mr-2" />
                    Focus
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDelete} className="flex-1">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                </Button>
            </div>
        </div>
    );
};

interface PassepartoutValue {
    /** Width at the sides in cm, 0 = none. */
    width: number;
    placement: PassepartoutPlacement;
}

const NO_PASSEPARTOUT: PassepartoutValue = { width: 0, placement: 'center' };

function passepartoutOf(inst: { passepartoutWidth?: number | null; passepartoutPlacement?: unknown }): PassepartoutValue {
    return {
        width: Math.max(0, inst.passepartoutWidth ?? 0),
        placement: isPassepartoutPlacement(inst.passepartoutPlacement) ? inst.passepartoutPlacement : 'center',
    };
}

const formatCm = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const formatMm = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/** CSS swatch of a finish: the grain's light-to-dark range for wood, a sheen on metal, flat lacquer. */
function finishSwatch(id: FrameFinishId): string {
    const surface = FRAME_FINISHES[id].surface;
    if (surface.kind === 'wood') {
        return `repeating-linear-gradient(100deg, ${surface.light} 0 3px, ${surface.dark} 3px 4px, ${surface.light} 4px 6px)`;
    }
    if (surface.kind === 'lacquer') return surface.color;
    return `linear-gradient(135deg, #ffffff66 0%, transparent 45%), ${surface.color}`;
}

interface FrameControlsProps {
    frameStyle: FrameStyleId;
    onFrameToggle: (framed: boolean) => void;
    onFrameStyleChange: (frameStyle: FrameStyleId) => void;
    passepartout: PassepartoutValue;
    onPassepartoutToggle: (on: boolean) => void;
    onPassepartoutChange: (passepartout: PassepartoutValue) => void;
    /** Current picture size in cm (the frame opening without passepartout). */
    pictureCm: { w: number; h: number };
}

const selectClass = "w-full h-8 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-blue-500";
const toggleClass = (active: boolean) => cn("flex-1 h-8 text-xs", active ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700");

/** Frame profile and colour (the HALBE and Max Aab ranges) plus the passepartout of a picture. */
const FrameControls = ({
    frameStyle, onFrameToggle, onFrameStyleChange, passepartout, onPassepartoutToggle, onPassepartoutChange, pictureCm,
}: FrameControlsProps) => {
    const style = frameStyleSpec(frameStyle);
    const hasPassepartout = !!style && passepartout.width > 0;
    // Last colour picked per maker and material (see frameLineOf), so switching
    // Alu → Holz → Alu comes back to it.
    const lastFinish = useRef<Partial<Record<string, FrameFinishId>>>({});
    const pickStyle = (id: FrameStyleId) => {
        const next = frameStyleSpec(id);
        if (next) lastFinish.current[frameLineOf(next.finish)] = next.finish.id;
        onFrameStyleChange(id);
    };
    const pickProfile = (profile: FrameProfileId) => {
        const spec = FRAME_PROFILES[profile];
        const line = frameLineOf(spec);
        if (style) lastFinish.current[frameLineOf(style.finish)] = style.finish.id;
        // Same maker and material: keep the colour where it exists. Other material: the colour
        // last used there. Other maker: the closest-looking colour (see styleForProfile).
        const otherMaker = !!style && style.profile.manufacturer !== spec.manufacturer;
        const preferred = style && frameLineOf(style.finish) === line
            ? style.finish.id
            : lastFinish.current[line] ?? (otherMaker ? style.finish.id : null);
        pickStyle(styleForProfile(profile, preferred));
    };
    const layout = framedArtworkLayout({
        width: pictureCm.w / 100,
        height: pictureCm.h / 100,
        frameStyle,
        passepartoutWidth: passepartout.width,
        passepartoutPlacement: passepartout.placement,
    });
    const outerW = (layout.right - layout.left) * 100;
    const outerH = (layout.top - layout.bottom) * 100;
    const openingW = layout.openingWidth * 100;
    const openingH = layout.openingHeight * 100;
    const formats = style?.profile.formats;
    const outsideFormats = !!style && !!formats && !profileFitsFormat(style.profile, openingW, openingH);

    return (
        <>
            <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Rahmen</Label>
                <div className="flex gap-1">
                    <Button variant="secondary" size="sm" onClick={() => onFrameToggle(true)} className={toggleClass(!!style)}>Gerahmt</Button>
                    <Button variant="secondary" size="sm" onClick={() => onFrameToggle(false)} className={toggleClass(!style)}>Ohne Rahmen</Button>
                </div>
                {style ? (
                    <>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-zinc-500 uppercase">Profil</Label>
                            <select
                                value={style.profile.id}
                                onChange={(e) => pickProfile(e.target.value as FrameProfileId)}
                                className={selectClass}
                            >
                                {FRAME_LINES.map((line) => (
                                    <optgroup key={line.key} label={line.label}>
                                        {line.profiles.map((profile) => (
                                            <option key={profile.id} value={profile.id}>
                                                {profile.label} · {formatMm(profile.width)} × {formatMm(profile.depth)} mm
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-baseline justify-between">
                                <Label className="text-[10px] text-zinc-500 uppercase">Farbe</Label>
                                <span className="text-[11px] text-zinc-300">{style.finish.label}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {PROFILE_FINISHES[style.profile.id].map((finish) => (
                                    <button
                                        key={finish}
                                        type="button"
                                        title={FRAME_FINISHES[finish].label}
                                        aria-label={FRAME_FINISHES[finish].label}
                                        aria-pressed={finish === style.finish.id}
                                        onClick={() => pickStyle(styleIdOf(style.profile.id, finish))}
                                        className={cn(
                                            "h-6 w-6 rounded-full border border-zinc-600 transition-shadow",
                                            finish === style.finish.id ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-950" : "hover:ring-1 hover:ring-zinc-400",
                                        )}
                                        style={{ background: finishSwatch(finish) }}
                                    />
                                ))}
                            </div>
                        </div>
                        <p className="text-[10px] text-zinc-500">
                            Aufsichtsmaß {formatMm(style.profile.width)} mm, Profiltiefe {formatMm(style.profile.depth)} mm
                            {style.profile.objectDepth
                                ? `, ${formatMm(style.profile.objectDepth)} mm Raum zwischen Glas und Rückwand mit weißer Innenleiste`
                                : ''}
                        </p>
                        {outsideFormats && formats && (
                            <p className="text-[10px] text-amber-400">
                                {FRAME_MANUFACTURER_LABELS[style.profile.manufacturer]} fertigt {style.profile.label} für Bildmaße
                                von {formatCm(formats.min[0])} × {formatCm(formats.min[1])} bis {formatCm(formats.max[0])} × {formatCm(formats.max[1])} cm
                                {' '}— hier sind es {formatCm(openingW)} × {formatCm(openingH)} cm.
                            </p>
                        )}
                    </>
                ) : (
                    <p className="text-[10px] text-zinc-500 italic">Werk hängt ungerahmt an der Wand.</p>
                )}
            </div>
            {style && (
                <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider">Passepartout</Label>
                    <div className="flex gap-1">
                        <Button variant="secondary" size="sm" onClick={() => onPassepartoutToggle(false)} className={toggleClass(!hasPassepartout)}>Ohne</Button>
                        <Button variant="secondary" size="sm" onClick={() => onPassepartoutToggle(true)} className={toggleClass(hasPassepartout)}>Mit Passepartout</Button>
                    </div>
                    {hasPassepartout && (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-zinc-500 uppercase">Breite (cm)</Label>
                                    <NumericInput
                                        step="0.5"
                                        min="0.5"
                                        max={String(MAX_PASSEPARTOUT_WIDTH_CM)}
                                        value={passepartout.width}
                                        onChange={(raw) => {
                                            const width = parseFloat(raw.replace(',', '.'));
                                            if (!isNaN(width) && width > 0) onPassepartoutChange({ ...passepartout, width });
                                        }}
                                        className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-zinc-500 uppercase">Platzierung</Label>
                                    <select
                                        value={passepartout.placement}
                                        onChange={(e) => onPassepartoutChange({ ...passepartout, placement: e.target.value as PassepartoutPlacement })}
                                        className={selectClass}
                                    >
                                        {PASSEPARTOUT_PLACEMENTS.map((placement) => (
                                            <option key={placement.id} value={placement.id}>{placement.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <p className="text-[10px] text-zinc-500">
                                Weiß, 1,5 mm Museumskarton mit Schrägschnitt. Ränder oben {formatCm((layout.passepartout?.top ?? 0) * 100)} cm, unten {formatCm((layout.passepartout?.bottom ?? 0) * 100)} cm.
                            </p>
                        </>
                    )}
                    <p className="text-[11px] text-zinc-300">
                        Außenmaß {formatCm(outerW)} × {formatCm(outerH)} cm
                    </p>
                </div>
            )}
        </>
    );
};

/** Opens the wall (modular or room wall) an artwork hangs on in the 2D wall editor. */
const OpenArtworkWallButton = ({ instanceId }: { instanceId: number | null }) => {
    const roomFaces = useWallEditorView((state) => state.roomFaces);
    // Selector returns a string key so the component only re-renders when the target changes.
    const key = useEditorStore((state) => {
        const inst = instanceId !== null ? state.localInstances.find(i => i.id === instanceId) : undefined;
        const target = inst ? targetForInstance(inst, state.localWalls, roomFaces) : null;
        return target ? JSON.stringify(target) : null;
    });
    const openWallEditor = useEditorStore((state) => state.openWallEditor);
    if (!key || instanceId === null) return null;
    const target = JSON.parse(key) as WallEditorTarget;
    return (
        <Button
            size="sm"
            onClick={() => openWallEditor(target, [instanceId])}
            className="w-full h-9 text-xs gap-1.5 bg-blue-600 hover:bg-blue-500 text-white"
            title="Die Wand dieses Werks frontal bearbeiten (E)"
        >
            <PanelsTopLeft className="h-3.5 w-3.5" />
            Wand im 2D-Editor öffnen
        </Button>
    );
};

const WallPropertiesContent = () => {
    const selectedWallId = useEditorStore((state) => state.selectedWallId);
    const localWalls = useEditorStore((state) => state.localWalls);
    const localInstances = useEditorStore((state) => state.localInstances);
    const updateWall = useEditorStore((state) => state.updateWall);
    const toggleWallLock = useEditorStore((state) => state.toggleWallLock);
    const openWallEditor = useEditorStore((state) => state.openWallEditor);
    const wall = localWalls.find(w => w.id === selectedWallId);
    if (!wall) return null;
    const artworksOnWall = localInstances.filter(i => i.wallId === wall.id);
    const hasArtworks = artworksOnWall.length > 0;
    const toDeg = (rad: number) => ((rad * 180) / Math.PI).toFixed(1);
    const toFixed = (v: number, d = 3) => v.toFixed(d);
    const countOn = (side: WallSide) => artworksOnWall.filter(i => sideOfInstance(wall, i) === side).length;
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
            <div className="text-xs text-zinc-500 italic">{wall.label || 'Modular Wall'} — {wall.width}m × {wall.height}m</div>
            <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">2D-Wandeditor</Label>
                <div className="grid grid-cols-2 gap-2">
                    {WALL_SIDES.map((side) => (
                        <Button
                            key={side}
                            size="sm"
                            onClick={() => openWallEditor({ kind: 'wall', wallId: wall.id, side })}
                            className={cn(
                                "h-9 text-xs gap-1.5 text-white",
                                side === 'front' || side === 'back' ? "bg-blue-600 hover:bg-blue-500" : "bg-blue-600/60 hover:bg-blue-500",
                            )}
                            title={`${WALL_SIDE_LABELS[side]} frontal bearbeiten (E / Doppelklick auf die Wand)`}
                        >
                            <PanelsTopLeft className="h-3.5 w-3.5" />
                            {WALL_SIDE_LABELS[side]}
                            <span className="text-white/60 tabular-nums">{countOn(side)}</span>
                        </Button>
                    ))}
                </div>
            </div>
            <Separator className="bg-zinc-800" />
            <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Position</Label>
                <div className="grid grid-cols-2 gap-2">
                    {(['x', 'z'] as const).map((axis) => (
                        <div key={axis} className="space-y-1">
                            <Label className="text-[10px] text-zinc-500 uppercase">{axis}</Label>
                            <NumericInput step="0.01" value={toFixed(wall[`position_${axis}`])} onChange={(raw) => {
                                const v = parseFloat(raw);
                                if (!isNaN(v)) updateWall(wall.id, { [`position_${axis}`]: v });
                            }} className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100" disabled={wall.isLocked} />
                        </div>
                    ))}
                </div>
            </div>
            <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Rotation (°)</Label>
                <NumericInput step="1" value={toDeg(wall.rotation_y)} onChange={(raw) => {
                    const deg = parseFloat(raw);
                    if (!isNaN(deg)) updateWall(wall.id, { rotation_y: (deg * Math.PI) / 180 });
                }} className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100 w-1/3" disabled={wall.isLocked} />
            </div>
            <Separator className="bg-zinc-800" />
            <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                    // Prevent unlocking if artworks are attached
                    if (wall.isLocked && hasArtworks) {
                        gooeyToast.error("Cannot unlock", {
                            description: `Remove all ${artworksOnWall.length} artwork(s) from this wall first.`,
                        });
                        return;
                    }
                    toggleWallLock(wall.id);
                }}
                className={cn("w-full text-xs", wall.isLocked ? "bg-amber-600/20 text-amber-400" : "bg-zinc-800 text-zinc-100")}
            >
                {wall.isLocked
                    ? <><Lock className="h-4 w-4 mr-2" /> Locked{hasArtworks ? ` (${artworksOnWall.length} artwork${artworksOnWall.length > 1 ? 's' : ''})` : ''}</>
                    : <><Unlock className="h-4 w-4 mr-2" /> Unlocked</>
                }
            </Button>
        </div>
    );
};

