import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import type { TransformMode } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
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
} from 'lucide-react';

interface TransformData {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number }; // radians
    scale: { x: number; y: number; z: number };
}

interface PropertiesPanelProps {
    isOpen: boolean;
    onToggle: () => void;
}

export const PropertiesPanel = ({ isOpen, onToggle }: PropertiesPanelProps) => {
    const selectedId = useEditorStore((state) => state.selectedInstanceId);
    const transformMode = useEditorStore((state) => state.transformMode);
    const setTransformMode = useEditorStore((state) => state.setTransformMode);
    const selectInstance = useEditorStore((state) => state.selectInstance);
    const setFocusTarget = useEditorStore((state) => state.setFocusTarget);
    const liveTransform = useEditorStore((state) => state.liveTransform);
    const token = useAuthStore((state) => state.token);
    const activeVersionId = useEditorStore((state) => state.activeVersionId);
    const { toast } = useToast();

    const [transform, setTransform] = useState<TransformData>({
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
    });
    const [aspectLocked, setAspectLocked] = useState(true);
    // Asset metadata for cm conversion
    const [assetMeta, setAssetMeta] = useState<{ widthPx: number; heightPx: number; dpi: number } | null>(null);

    // Base cm dimensions from asset metadata
    const baseCm = assetMeta ? {
        x: (assetMeta.widthPx / assetMeta.dpi) * 2.54,
        y: (assetMeta.heightPx / assetMeta.dpi) * 2.54,
        z: 0.1, // thin depth for flat artwork
    } : { x: 1, y: 1, z: 1 };

    // Use live gizmo values during drag, otherwise use local state
    const displayTransform = liveTransform ?? transform;

    // Sync local state when drag ends (liveTransform goes null)
    const prevLive = useRef(liveTransform);
    useEffect(() => {
        if (prevLive.current && !liveTransform) {
            // Drag just ended — persist the last live values to local state
            setTransform(prevLive.current);
        }
        prevLive.current = liveTransform;
    }, [liveTransform]);

    // Fetch current transform when selection changes
    useEffect(() => {
        if (!selectedId || !token || !activeVersionId) return;

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
                    // Store asset metadata for cm conversion
                    if (inst.artwork?.asset) {
                        setAssetMeta({
                            widthPx: inst.artwork.asset.width,
                            heightPx: inst.artwork.asset.height,
                            dpi: inst.artwork.asset.dpi || 72,
                        });
                    }
                }
            } catch (err) {
                console.error('Failed to fetch instance data:', err);
            }
        };

        fetchInstance();
    }, [selectedId, token, activeVersionId]);

    // Save transform to local state
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

    // Handle numeric input change
    const handleInputChange = (
        group: 'position' | 'rotation',
        axis: 'x' | 'y' | 'z',
        rawValue: string
    ) => {
        const value = parseFloat(rawValue);
        if (isNaN(value)) return;

        // For rotation, convert degrees to radians for storage
        const storeValue = group === 'rotation' ? (value * Math.PI) / 180 : value;

        const newTransform = {
            ...transform,
            [group]: { ...transform[group], [axis]: storeValue },
        };
        setTransform(newTransform);
        saveTransform({ [group]: newTransform[group] });
    };

    const handleScaleChange = (axis: 'x' | 'y' | 'z', rawValue: string) => {
        const cmValue = parseFloat(rawValue);
        if (isNaN(cmValue) || cmValue <= 0) return;

        // Convert cm input back to scale factor
        const newScaleForAxis = cmValue / baseCm[axis];

        let newScale: { x: number; y: number; z: number };
        if (aspectLocked) {
            // Compute ratio from the axis that changed
            const ratio = newScaleForAxis / transform.scale[axis];
            newScale = {
                x: transform.scale.x * ratio,
                y: transform.scale.y * ratio,
                z: transform.scale.z * ratio,
            };
        } else {
            newScale = { ...transform.scale, [axis]: newScaleForAxis };
        }

        const newTransform = { ...transform, scale: newScale };
        setTransform(newTransform);
        saveTransform({ scale: newScale });
    };

    // Delete instance
    const handleDelete = () => {
        if (!selectedId) return;

        const store = useEditorStore.getState();
        const updatedInstances = store.localInstances.filter(inst => inst.id !== selectedId);

        store.commitLocalChange(updatedInstances);
        toast({ title: 'Deleted', description: 'Artwork removed from exhibition.', duration: 3000 });
        selectInstance(null);
    };

    // Focus camera
    const handleFocus = () => {
        console.log("Focusing on:", displayTransform.position);
        setFocusTarget({ 
            target: [displayTransform.position.x, displayTransform.position.y, displayTransform.position.z],
            isHoming: false
        });
    };

    // Helper to convert radians to degrees for display
    const toDeg = (rad: number) => ((rad * 180) / Math.PI).toFixed(1);
    const toFixed = (v: number, d = 3) => v.toFixed(d);

    const modeButtons: { mode: TransformMode; icon: typeof Move; label: string }[] = [
        { mode: 'translate', icon: Move, label: 'Move (T)' },
        { mode: 'rotate', icon: RotateCcw, label: 'Rotate (R)' },
        { mode: 'scale', icon: Maximize2, label: 'Scale (S)' },
    ];

    if (!selectedId) return null;

    return (
        <>
        <Card
            className={cn(
                "absolute right-4 top-6 bottom-8 w-72 bg-zinc-950/80 backdrop-blur-md border-zinc-800 shadow-xl flex flex-col z-20 rounded-xl overflow-hidden transition-transform duration-300 ease-in-out",
                !isOpen && "translate-x-[calc(100%+2rem)]"
            )}
        >
            <CardHeader className="p-4 border-b border-zinc-800 bg-blue-600 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-white">Properties</CardTitle>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-blue-100 hover:text-white hover:bg-blue-700"
                    onClick={onToggle}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </CardHeader>

            <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
                {/* Transform Mode Buttons */}
                <div className="flex gap-1">
                    {modeButtons.map(({ mode, icon: Icon, label }) => (
                        <Button
                            key={mode}
                            variant={transformMode === mode ? 'default' : 'secondary'}
                            size="sm"
                            onClick={() => setTransformMode(mode)}
                            className={cn(
                                "flex-1 h-9 text-xs gap-1.5",
                                transformMode === mode
                                    ? "bg-blue-600 hover:bg-blue-500"
                                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            )}
                            title={label}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </Button>
                    ))}
                </div>

                <Separator className="bg-zinc-800" />

                {/* Position */}
                <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider">Position</Label>
                    <div className="grid grid-cols-3 gap-2">
                        {(['x', 'y', 'z'] as const).map((axis) => (
                            <div key={axis} className="space-y-1">
                                <Label className="text-[10px] text-zinc-500 uppercase">{axis}</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={toFixed(displayTransform.position[axis])}
                                    onChange={(e) => handleInputChange('position', axis, e.target.value)}
                                    className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Rotation */}
                <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider">Rotation (°)</Label>
                    <div className="grid grid-cols-3 gap-2">
                        {(['x', 'y', 'z'] as const).map((axis) => (
                            <div key={axis} className="space-y-1">
                                <Label className="text-[10px] text-zinc-500 uppercase">{axis}</Label>
                                <Input
                                    type="number"
                                    step="1"
                                    value={toDeg(displayTransform.rotation[axis])}
                                    onChange={(e) => handleInputChange('rotation', axis, e.target.value)}
                                    className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <Separator className="bg-zinc-800" />

                {/* Size (cm) */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs text-zinc-400 uppercase tracking-wider">Size (cm)</Label>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-zinc-400 hover:text-white"
                            onClick={() => setAspectLocked(!aspectLocked)}
                            title={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                        >
                            {aspectLocked ? (
                                <Link className="h-3.5 w-3.5" />
                            ) : (
                                <Unlink className="h-3.5 w-3.5" />
                            )}
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {([['x', 'W'], ['y', 'H']] as const).map(([axis, label]) => (
                            <div key={axis} className="space-y-1">
                                <Label className="text-[10px] text-zinc-500 uppercase">{label}</Label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={toFixed(baseCm[axis] * displayTransform.scale[axis])}
                                    onChange={(e) => handleScaleChange(axis, e.target.value)}
                                    className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <Separator className="bg-zinc-800" />

                {/* Actions */}
                <div className="flex gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleFocus}
                        className="flex-1 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                    >
                        <Focus className="h-4 w-4 mr-2" />
                        Focus Camera
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                        className="flex-1"
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                    </Button>
                </div>
            </div>
        </Card>

            {/* Toggle Button (Visible when closed) */}
            <div 
                className={cn(
                    "absolute right-0 top-1/2 -translate-y-1/2 z-10 transition-transform duration-300 ease-in-out",
                    isOpen && "translate-x-full"
                )}
            >
                <Button
                    variant="secondary"
                    size="sm"
                    className="h-12 w-6 rounded-l-lg rounded-r-none bg-blue-600 border-y border-l border-blue-700 shadow-md p-0 flex items-center justify-center hover:bg-blue-500"
                    onClick={onToggle}
                >
                    <ChevronLeft className="h-4 w-4 text-white" />
                </Button>
            </div>
        </>
    );
};
