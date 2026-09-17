import { measureViewportInsets, useWallEditorView } from '@/store/wallEditorViewStore';
import type { Rect } from './layout';

/** Fits the open wall (or a rect of it) into the free part of the canvas. */
export function fitWallEditorView(rect: Rect, padding = 0.08) {
    const root = document.querySelector<HTMLElement>('[data-wall-editor-root]');
    if (!root) return;
    const pad = Math.max(rect.w, rect.h) * padding;
    useWallEditorView.getState().fitRect(
        { x: rect.x - pad, y: rect.y - pad, w: rect.w + 2 * pad, h: rect.h + 2 * pad },
        measureViewportInsets(root),
        { w: root.clientWidth, h: root.clientHeight },
    );
}
