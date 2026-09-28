import { useEditorStore, type ArtworkInstanceData, type MediumType } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import { MAX_PASSEPARTOUT_WIDTH_CM, type FrameStyleId } from '@/lib/frameStyles';
import type { PassepartoutValue } from '@/lib/passepartout';
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
import { pictureSize } from './footprint';
import { clampScaleFactor, MIN_PICTURE_EDGE } from './scale';
import {
    commitScaledArtworks,
    commitWallOffsets,
    getOpenWallFace,
    isPicture,
    isScalable,
    resizeArtwork,
    scaleArtworks,
    type WallArtwork,
} from './wallArtworks';

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

// ── Size, frame and passepartout of the selection ───────────────────────

/** Scales the selection by `factor` about each picture centre (the −5 % / +5 % buttons). */
export function scaleSelection(factor: number): boolean {
    const ctx = selectionContext();
    if (!ctx) return false;
    const scalable = ctx.selected.filter((i) => isScalable(i.inst));
    if (scalable.length === 0) return false;
    const f = clampScaleFactor(factor, scalable.map((i) => pictureSize(i.inst)));
    return commitScaledArtworks(ctx.face, scaleArtworks(ctx.face, scalable.map((i) => i.id), f));
}

/**
 * Sets width or height (metres, without frame) of the one selected artwork. With `keepAspect`
 * (always for beamers) the other side follows.
 */
export function setSelectionPictureSize(axis: 'w' | 'h', metres: number, keepAspect: boolean): boolean {
    const ctx = selectionContext();
    if (!ctx || ctx.selected.length !== 1) return false;
    const item = ctx.selected[0];
    if (!isScalable(item.inst)) return false;
    const current = pictureSize(item.inst);
    const target = Math.max(MIN_PICTURE_EDGE, metres);
    if (keepAspect || item.inst.medium === 'beamer') {
        const factor = clampScaleFactor(target / current[axis], [current]);
        return commitScaledArtworks(ctx.face, scaleArtworks(ctx.face, [item.id], factor));
    }
    return commitScaledArtworks(ctx.face, resizeArtwork(ctx.face, item.id, { ...current, [axis]: target }));
}

/** Applies `change` to the given instances in one undo step. */
function commitInstanceChange(ids: Set<number>, change: (inst: ArtworkInstanceData) => ArtworkInstanceData): boolean {
    const store = useEditorStore.getState();
    let changed = false;
    const next = store.localInstances.map((inst) => {
        if (!ids.has(inst.id)) return inst;
        const updated = change(inst);
        if (updated !== inst) changed = true;
        return updated;
    });
    if (changed) store.commitLocalChange(next);
    return changed;
}

function selectedPictureIds(): Set<number> {
    const ctx = selectionContext();
    return new Set(ctx ? ctx.selected.filter((i) => isPicture(i.inst)).map((i) => i.id) : []);
}

/** Frame style for every picture of the selection; new drops follow it (like the 3D panel). */
export function setSelectionFrameStyle(frameStyle: FrameStyleId): boolean {
    const ids = selectedPictureIds();
    if (ids.size === 0) return false;
    if (frameStyle !== 'none') useEditorStore.getState().setDefaultFrameStyle(frameStyle);
    return commitInstanceChange(ids, (inst) => (inst.frameStyle === frameStyle ? inst : { ...inst, frameStyle }));
}

/** Passepartout for every picture of the selection; new drops follow it (like the 3D panel). */
export function setSelectionPassepartout(value: PassepartoutValue): boolean {
    const ids = selectedPictureIds();
    if (ids.size === 0) return false;
    const width = Math.min(Math.max(value.width, 0), MAX_PASSEPARTOUT_WIDTH_CM);
    const placement = value.placement;
    useEditorStore.getState().setDefaultPassepartout({ width, placement });
    return commitInstanceChange(ids, (inst) => (
        inst.passepartoutWidth === width && inst.passepartoutPlacement === placement
            ? inst
            : { ...inst, passepartoutWidth: width, passepartoutPlacement: placement }
    ));
}

/** Monitor or beamer for the one selected video. */
export function setSelectionMedium(medium: MediumType): boolean {
    const ctx = selectionContext();
    if (!ctx || ctx.selected.length !== 1) return false;
    const item = ctx.selected[0];
    if (item.inst.artwork.asset.type !== 'video') return false;
    return commitInstanceChange(new Set([item.id]), (inst) => (inst.medium === medium ? inst : { ...inst, medium }));
}
