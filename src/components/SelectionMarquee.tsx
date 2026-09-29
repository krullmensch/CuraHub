import { useEffect, useState, type RefObject } from 'react';
import { useEditorStore } from '../store/editorStore';
import { selectionBridge, suppressNextClick, type ClientRect } from '../lib/selectionBridge';

/** Pointer travel before a ⇧-press becomes a marquee instead of a ⇧-click. */
const DRAG_THRESHOLD_PX = 4;

interface SelectionMarqueeProps {
    containerRef: RefObject<HTMLDivElement | null>;
}

/**
 * ⇧ + left drag over the 3D view draws a selection rectangle and adds every visible artwork it
 * touches to the selection. While ⇧ is held the orbit controls are off (PlannerCameraSystem), so
 * the drag does not also move the camera.
 */
export const SelectionMarquee = ({ containerRef }: SelectionMarqueeProps) => {
    const setShiftHeld = useEditorStore((state) => state.setShiftHeld);
    /** The marquee in container pixels while dragging. */
    const [overlay, setOverlay] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

    // Track ⇧ for the camera controls.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => setShiftHeld(e.shiftKey);
        const onBlur = () => setShiftHeld(false);
        window.addEventListener('keydown', onKey);
        window.addEventListener('keyup', onKey);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('keyup', onKey);
            window.removeEventListener('blur', onBlur);
            setShiftHeld(false);
        };
    }, [setShiftHeld]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        let start: { x: number; y: number; pointerId: number } | null = null;
        let dragging = false;

        const rectFrom = (e: PointerEvent): ClientRect => ({
            left: Math.min(start!.x, e.clientX),
            top: Math.min(start!.y, e.clientY),
            right: Math.max(start!.x, e.clientX),
            bottom: Math.max(start!.y, e.clientY),
        });

        const onDown = (e: PointerEvent) => {
            if (e.button !== 0 || !e.shiftKey || !(e.target instanceof HTMLCanvasElement)) return;
            const store = useEditorStore.getState();
            if (store.plannerViewMode !== 'perspective' || store.wallEditor || store.isTransforming) return;
            start = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
            dragging = false;
        };

        const onMove = (e: PointerEvent) => {
            if (!start || e.pointerId !== start.pointerId) return;
            if (!dragging) {
                if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD_PX) return;
                // A ⇧-drag on the gizmo moves the selection instead.
                if (useEditorStore.getState().isTransforming) { start = null; return; }
                dragging = true;
            }
            const r = rectFrom(e);
            const box = container.getBoundingClientRect();
            setOverlay({ left: r.left - box.left, top: r.top - box.top, width: r.right - r.left, height: r.bottom - r.top });
        };

        const onUp = (e: PointerEvent) => {
            if (!start || e.pointerId !== start.pointerId) return;
            if (dragging) {
                const ids = selectionBridge.marqueeHits(rectFrom(e));
                const store = useEditorStore.getState();
                if (ids.length > 0) {
                    store.setInstanceSelection([...store.selectedInstanceIds, ...ids], ids[ids.length - 1]);
                }
                // The pointer-up may also end on an artwork — that click must not toggle it.
                suppressNextClick();
            }
            start = null;
            dragging = false;
            setOverlay(null);
        };

        container.addEventListener('pointerdown', onDown, true);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            container.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, [containerRef]);

    if (!overlay) return null;
    return <div className="absolute pointer-events-none border border-blue-400 bg-blue-400/10 z-20" style={overlay} />;
};
