import { useRef } from 'react';
import { useEditorStore, type ArtworkInstanceData } from '@/store/editorStore';
import { Label } from '@/components/ui/label';

const withOpacity = (instances: ArtworkInstanceData[], id: number, opacity: number) =>
    instances.map(inst => (inst.id === id ? { ...inst, opacity } : inst));

/**
 * Opacity of a beamer projection. Dragging previews in the scene without history entries; letting
 * go commits once, so a whole drag is one undo step.
 */
export const BeamerOpacityControl = ({ instanceId }: { instanceId: number }) => {
    const opacity = useEditorStore((state) => state.localInstances.find(i => i.id === instanceId)?.opacity ?? 1);
    // Instances before the drag started — what undo returns to.
    const dragStart = useRef<ArtworkInstanceData[] | null>(null);

    const preview = (value: number) => {
        const store = useEditorStore.getState();
        dragStart.current ??= store.localInstances;
        useEditorStore.setState({ localInstances: withOpacity(store.localInstances, instanceId, value) });
    };

    const commit = () => {
        const before = dragStart.current;
        dragStart.current = null;
        if (!before) return;
        const final = useEditorStore.getState().localInstances.find(i => i.id === instanceId)?.opacity ?? 1;
        if ((before.find(i => i.id === instanceId)?.opacity ?? 1) === final) return;
        // Put the pre-drag list back so commitLocalChange records it as the undo step.
        useEditorStore.setState({ localInstances: before });
        useEditorStore.getState().commitLocalChange(withOpacity(before, instanceId, final));
    };

    const percent = Math.round(opacity * 100);
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label htmlFor="beamer-opacity" className="text-xs text-zinc-400 uppercase tracking-wider">Deckkraft</Label>
                <span className="text-xs tabular-nums text-zinc-300">{percent} %</span>
            </div>
            <input
                id="beamer-opacity"
                type="range"
                min={0}
                max={100}
                step={5}
                value={percent}
                onChange={(e) => preview(Number(e.target.value) / 100)}
                onPointerUp={commit}
                onKeyUp={commit}
                onBlur={commit}
                className="w-full accent-blue-600"
                aria-label="Deckkraft der Projektion"
            />
        </div>
    );
};
