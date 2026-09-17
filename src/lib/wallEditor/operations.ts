import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import {
    alignOffsets,
    centerGroupOffsets,
    centerHeightOffsets,
    distributeOffsets,
    spacingOffsets,
    unionRect,
    type AlignMode,
    type Axis,
    type Offset,
} from './layout';
import { commitWallOffsets, getOpenWallFace, type WallArtwork } from './wallArtworks';

/** Layout commands of the 2D wall editor, applied to the current selection (one undo step each). */

function selectionContext() {
    const face = getOpenWallFace();
    if (!face) return null;
    const ids = new Set(useEditorStore.getState().wallEditorSelection);
    const selected: WallArtwork[] = face.items.filter((i) => ids.has(i.id));
    return { face, selected };
}

export type AlignTarget = 'selection' | 'wall';

export function alignSelection(mode: AlignMode, target: AlignTarget): boolean {
    const ctx = selectionContext();
    if (!ctx || ctx.selected.length === 0) return false;
    // A single artwork always aligns to the wall (like a single layer to its frame in Figma).
    const useWall = target === 'wall' || ctx.selected.length === 1;
    const reference = useWall ? ctx.face.wallRect : unionRect(ctx.selected.map((i) => i.rect))!;
    if (useWall && ctx.selected.length > 1) {
        // Move the group as a whole so its arrangement stays intact.
        const bounds = unionRect(ctx.selected.map((i) => i.rect))!;
        const offset = alignOffsets([{ id: 0, rect: bounds }], mode, reference).get(0)!;
        return commitWallOffsets(ctx.face, new Map(ctx.selected.map((i) => [i.id, offset])));
    }
    return commitWallOffsets(ctx.face, alignOffsets(ctx.selected, mode, reference));
}

export function distributeSelection(axis: Axis): boolean {
    const ctx = selectionContext();
    if (!ctx || ctx.selected.length < 3) return false;
    return commitWallOffsets(ctx.face, distributeOffsets(ctx.selected, axis));
}

export function setSelectionGap(axis: Axis, gap: number): boolean {
    const ctx = selectionContext();
    if (!ctx || ctx.selected.length < 2) return false;
    return commitWallOffsets(ctx.face, spacingOffsets(ctx.selected, axis, Math.max(0, gap)));
}

export function centerSelectionOnWall(axis: Axis): boolean {
    const ctx = selectionContext();
    if (!ctx || ctx.selected.length === 0) return false;
    return commitWallOffsets(ctx.face, centerGroupOffsets(ctx.selected, axis, ctx.face.wallRect));
}

export type EdgeKey = 'left' | 'hcenter' | 'right' | 'bottom' | 'vcenter' | 'top';

/**
 * Moves the selection so one edge/centre of its bounding box sits at `value` (metres):
 * horizontal values are measured from the wall's left edge, vertical ones from the floor.
 */
export function setSelectionEdge(edge: EdgeKey, value: number): boolean {
    const ctx = selectionContext();
    if (!ctx || ctx.selected.length === 0) return false;
    const b = unionRect(ctx.selected.map((i) => i.rect))!;
    const floor = ctx.face.wallRect.y;
    let offset: Offset = { dx: 0, dy: 0 };
    switch (edge) {
        case 'left': offset = { dx: value - b.x, dy: 0 }; break;
        case 'hcenter': offset = { dx: value - (b.x + b.w / 2), dy: 0 }; break;
        case 'right': offset = { dx: ctx.face.wallRect.w - value - (b.x + b.w), dy: 0 }; break;
        case 'bottom': offset = { dx: 0, dy: floor + value - b.y }; break;
        case 'vcenter': offset = { dx: 0, dy: floor + value - (b.y + b.h / 2) }; break;
        case 'top': offset = { dx: 0, dy: floor + value - (b.y + b.h) }; break;
    }
    if (offset.dy < 0 && b.y + offset.dy < floor) offset.dy = floor - b.y; // never below the floor
    return commitWallOffsets(ctx.face, new Map(ctx.selected.map((i) => [i.id, offset])));
}

/**
 * Hangs the selection at the hanging height: 'each' puts every picture's centre on the line,
 * 'group' centres the whole group on it (salon hanging).
 */
export function hangSelection(mode: 'each' | 'group'): boolean {
    const ctx = selectionContext();
    if (!ctx || ctx.selected.length === 0) return false;
    const height = ctx.face.wallRect.y + useWallEditorView.getState().hangingHeight;
    const floor = ctx.face.wallRect.y;
    if (mode === 'each') {
        const offsets = centerHeightOffsets(ctx.selected, height);
        for (const item of ctx.selected) {
            const o = offsets.get(item.id)!;
            o.dy = Math.max(o.dy, floor - item.rect.y); // never below the floor
        }
        return commitWallOffsets(ctx.face, offsets);
    }
    const b = unionRect(ctx.selected.map((i) => i.rect))!;
    const dy = Math.max(height - (b.y + b.h / 2), floor - b.y);
    return commitWallOffsets(ctx.face, new Map(ctx.selected.map((i) => [i.id, { dx: 0, dy }])));
}

export function selectAllOnFace(): void {
    const face = getOpenWallFace();
    if (face) useEditorStore.getState().setWallEditorSelection(face.items.map((i) => i.id));
}
