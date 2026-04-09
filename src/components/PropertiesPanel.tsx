import { useState, useEffect, useCallback, useRef, type InputHTMLAttributes } from 'react';
import { useEditorStore, videoRefMap } from '../store/editorStore';
import type { TransformMode, MediumType } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { useToast } from '@/hooks/use-toast';
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
} from 'lucide-react';
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
    const focused = useRef(false);

    // Sync from outside only when not focused
    useEffect(() => {
        if (!focused.current) setLocal(String(value));
    }, [value]);

    return (
        <Input
            {...props}
            type="number"
            value={local}
            className={className}
            onFocus={() => { focused.current = true; }}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={() => {
                focused.current = false;
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
    const { toast } = useToast();

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
    const [assetMeta, setAssetMeta] = useState<{ widthPx: number; heightPx: number; dpi: number; type?: string } | null>(null);
    const [instanceMedium, setInstanceMedium] = useState<MediumType>('frame');

    const baseCm = assetMeta ? {
        x: (assetMeta.widthPx / assetMeta.dpi) * 2.54,
        y: (assetMeta.heightPx / assetMeta.dpi) * 2.54,
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

    useEffect(() => {
        if (!selectedId) return;

        // First, read from local store (works for temp IDs and already-loaded instances)
        const localInst = useEditorStore.getState().localInstances.find(i => i.id === selectedId);
        if (localInst) {
            setTransform({
                position: { x: localInst.position_x, y: localInst.position_y, z: localInst.position_z },
                rotation: { x: localInst.rotation_x, y: localInst.rotation_y, z: localInst.rotation_z },
                scale: { x: localInst.scale_x, y: localInst.scale_y, z: localInst.scale_z },
            });
            setInstanceMedium(localInst.medium || 'frame');
            if (localInst.artwork?.asset) {
                setAssetMeta({
                    widthPx: localInst.artwork.asset.width,
                    heightPx: localInst.artwork.asset.height,
                    dpi: localInst.artwork.asset.dpi || 72,
                    type: localInst.artwork.asset.type,
                });
            }
        }

        // Also fetch from API for authoritative data (enriches with server-side fields)
        if (!token || !activeVersionId) return;
        const fetchInstance = async () => {
            try {
                const res = await fetch(`/api/instances?versionId=${activeVersionId}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!res.ok) return;
                const instances = await res.json();
                const inst = instances.find((i: { id: number }) => i.id === selectedId);
                if (inst) {
                    setTransform({
                        position: { x: inst.position_x, y: inst.position_y, z: inst.position_z },
                        rotation: { x: inst.rotation_x, y: inst.rotation_y, z: inst.rotation_z },
                        scale: { x: inst.scale_x, y: inst.scale_y, z: inst.scale_z },
                    });
                    setInstanceMedium(inst.medium || 'frame');
                    if (inst.artwork?.asset) {
                        setAssetMeta({
                            widthPx: inst.artwork.asset.width,
                            heightPx: inst.artwork.asset.height,
                            dpi: inst.artwork.asset.dpi || 72,
                            type: inst.artwork.asset.type,
                        });
                    }
                }
            } catch (err) {
                console.error('Failed to fetch instance data:', err);
            }
        };

        fetchInstance();
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
        // 3D models must not go below floor level
        if (group === 'position' && axis === 'y' && instanceMedium === 'model3d') {
            value = Math.max(0, value);
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
        toast({ title: 'Deleted', description: 'Artwork removed from exhibition.' });
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

    // Auto-promote legacy video media (display/projector/frame/wallpaper) to 'monitor' so the
    // restricted Monitor/Beamer dropdown stays in sync with the underlying instance value.
    useEffect(() => {
        if (assetMeta?.type !== 'video') return;
        if (instanceMedium === 'monitor' || instanceMedium === 'beamer') return;
        handleMediumChange('monitor');
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
            <Card className={cn(
                "absolute right-4 top-6 bottom-8 w-72 bg-zinc-950/80 backdrop-blur-md border-zinc-800 shadow-xl flex flex-col z-20 rounded-xl overflow-hidden transition-transform duration-300 ease-in-out",
                !isOpen && "translate-x-[calc(100%+2rem)]"
            )}>
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
                            selectedInstanceId={selectedId}
                        />
                    ) : (
                        <div className="flex-1 flex items-center justify-center p-4">
                            <p className="text-zinc-500 text-xs text-center italic">Select an artwork or wall to view its properties.</p>
                        </div>
                    )
                )}
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
    selectedInstanceId: number | null;
}

const MEDIUM_OPTIONS: { value: MediumType; label: string }[] = [
    { value: 'frame', label: 'Frame' },
    { value: 'display', label: 'Display' },
    { value: 'projector', label: 'Projector' },
    { value: 'wallpaper', label: 'Wallpaper' },
    { value: 'model3d', label: '3D Model' },
];

const VIDEO_MEDIUM_OPTIONS: { value: MediumType; label: string }[] = [
    { value: 'monitor', label: 'Monitor' },
    { value: 'beamer',  label: 'Beamer'  },
];

const ArtworkPropertiesContent = ({
    transform, transformMode, setTransformMode, modeButtons,
    toDeg, toFixed, baseCm, aspectLocked, setAspectLocked,
    handleInputChange, handleScaleChange, handleFocus, handleDelete,
    medium, assetType, onMediumChange, selectedInstanceId,
}: ArtworkPropertiesContentProps) => {
    const isModel = assetType === 'model3d';
    const isVideo = assetType === 'video';
    const sizeLocked  = isVideo && medium === 'monitor';
    const sizeIsBeamer = isVideo && medium === 'beamer';
    const hideAspectToggle = sizeLocked || sizeIsBeamer;

    // Poll video element state for play/pause and mute UI
    const [videoPaused, setVideoPaused] = useState(true);
    const [videoMuted, setVideoMuted] = useState(true);

    useEffect(() => {
        if (!isVideo || !selectedInstanceId) return;
        const poll = setInterval(() => {
            const el = videoRefMap.get(selectedInstanceId);
            if (el) {
                setVideoPaused(el.paused);
                setVideoMuted(el.muted);
            }
        }, 250);
        // Immediate read
        const el = videoRefMap.get(selectedInstanceId);
        if (el) {
            setVideoPaused(el.paused);
            setVideoMuted(el.muted);
        }
        return () => clearInterval(poll);
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
                {modeButtons.map(({ mode, icon: Icon, label }) => (
                    <Button key={mode} variant={transformMode === mode ? 'default' : 'secondary'} size="sm" onClick={() => setTransformMode(mode)} className={cn("flex-1 h-9 text-xs gap-1.5", transformMode === mode ? "bg-blue-600 hover:bg-blue-500" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700")} title={label}>
                        <Icon className="h-3.5 w-3.5" />
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </Button>
                ))}
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
            <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Medium</Label>
                {isModel ? (
                    <div className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2">3D Model</div>
                ) : isVideo ? (
                    <select
                        value={medium === 'monitor' || medium === 'beamer' ? medium : 'monitor'}
                        onChange={(e) => onMediumChange(e.target.value as MediumType)}
                        className="w-full h-8 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        {VIDEO_MEDIUM_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                ) : (
                    <select
                        value={medium}
                        onChange={(e) => onMediumChange(e.target.value as MediumType)}
                        className="w-full h-8 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        {MEDIUM_OPTIONS.filter(o => o.value !== 'model3d' && o.value !== 'monitor' && o.value !== 'beamer').map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                )}
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider">Size (cm)</Label>
                    {!hideAspectToggle && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => setAspectLocked(!aspectLocked)} title={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}>
                            {aspectLocked ? <Link className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
                        </Button>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {([['x', 'W'], ['y', 'H']] as const).map(([axis, label]) => (
                        <div key={axis} className="space-y-1">
                            <Label className="text-[10px] text-zinc-500 uppercase">{label}</Label>
                            <NumericInput step="0.1" min="0.1" value={toFixed(baseCm[axis] * transform.scale[axis])} onChange={(raw) => handleScaleChange(axis, raw)} className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100" disabled={sizeLocked} />
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

const WallPropertiesContent = () => {
    const selectedWallId = useEditorStore((state) => state.selectedWallId);
    const localWalls = useEditorStore((state) => state.localWalls);
    const localInstances = useEditorStore((state) => state.localInstances);
    const updateWall = useEditorStore((state) => state.updateWall);
    const toggleWallLock = useEditorStore((state) => state.toggleWallLock);
    const { toast } = useToast();
    const wall = localWalls.find(w => w.id === selectedWallId);
    if (!wall) return null;
    const artworksOnWall = localInstances.filter(i => i.wallId === wall.id);
    const hasArtworks = artworksOnWall.length > 0;
    const toDeg = (rad: number) => ((rad * 180) / Math.PI).toFixed(1);
    const toFixed = (v: number, d = 3) => v.toFixed(d);
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
            <div className="text-xs text-zinc-500 italic">{wall.label || 'Modular Wall'} — {wall.width}m × {wall.height}m</div>
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
                        toast({
                            variant: "destructive",
                            title: "Cannot unlock",
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

