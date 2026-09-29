import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { useEditorStore } from '@/store/editorStore';
import { sideOfInstance, worldToWall, wallToWorld, WALL_SIDES, type WallFrame, type WallPoint, type WallSide } from './geometry';
import { artworkFrameLayout, baseArtworkSize, computeFootprint, footprintRect, type Footprint } from './footprint';
import { instanceOnFace, openFaceOf, type ResolvedFace } from './faces';
import type { RoomFace, RoomOpening } from './roomFaces';
import type { LayoutItem, Offset, Rect } from './layout';
import { cornerShift, type Corner } from './scale';

/** An artwork on the open wall face, in wall coordinates. */
export interface WallArtwork extends LayoutItem {
    inst: ArtworkInstanceData;
    /** Stored position in wall coordinates. */
    anchor: WallPoint;
    footprint: Footprint;
    label: string;
}

export interface WallFace {
    resolved: ResolvedFace;
    key: string;
    label: string;
    /** The modular wall and which of its faces is open (null for room walls). */
    wall: ModularWallData | null;
    side: WallSide | null;
    /** The room wall that is open (null for modular walls). */
    room: RoomFace | null;
    frame: WallFrame;
    /** The face itself: (0, bottom) … (width, top). */
    wallRect: Rect;
    items: WallArtwork[];
    /** Modular walls: number of artworks on each of the wall's faces. */
    sideCounts: Record<WallSide, number> | null;
    /** Room walls: windows and doors. */
    openings: RoomOpening[];
}

const labelOf = (inst: ArtworkInstanceData) =>
    inst.artwork.title?.trim()
    || inst.artwork.asset.path.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '')
    || `Werk ${inst.id}`;

export function collectWallFace(resolved: ResolvedFace, instances: ArtworkInstanceData[]): WallFace {
    const { frame, wall } = resolved;
    const items: WallArtwork[] = [];
    const sideCounts = wall ? Object.fromEntries(WALL_SIDES.map((s) => [s, 0])) as Record<WallSide, number> : null;
    for (const inst of instances) {
        if (wall && sideCounts && inst.wallId === wall.id) sideCounts[sideOfInstance(wall, inst)]++;
        if (!instanceOnFace(inst, resolved)) continue;
        const anchor = worldToWall(frame, { x: inst.position_x, y: inst.position_y, z: inst.position_z });
        const footprint = computeFootprint(inst, frame);
        items.push({
            id: inst.id,
            inst,
            anchor,
            footprint,
            rect: footprintRect(footprint, anchor.u, anchor.v),
            label: labelOf(inst),
        });
    }
    return {
        resolved,
        key: resolved.key,
        label: resolved.label,
        wall,
        side: resolved.side,
        room: resolved.room,
        frame,
        wallRect: { x: 0, y: frame.bottom, w: frame.width, h: frame.height },
        items,
        sideCounts,
        openings: resolved.room?.openings ?? [],
    };
}

/** The open face, read straight from the store (for event handlers). */
export function getOpenWallFace(): WallFace | null {
    const state = useEditorStore.getState();
    const resolved = openFaceOf(state);
    return resolved ? collectWallFace(resolved, state.localInstances) : null;
}

/**
 * Moves artworks by wall-space offsets and records one undo step.
 * Offsets are rounded to 0.1 mm so stored positions stay tidy.
 */
export function commitWallOffsets(face: WallFace, offsets: Map<number, Offset>): boolean {
    const store = useEditorStore.getState();
    let changed = false;
    const round = (v: number) => Math.round(v * 10000) / 10000;
    const onFace = new Set(face.items.map((i) => i.id));
    const next = store.localInstances.map((inst) => {
        const offset = offsets.get(inst.id);
        if (!offset || !onFace.has(inst.id)) return inst;
        if (Math.abs(offset.dx) < 1e-6 && Math.abs(offset.dy) < 1e-6) return inst;
        const anchor = worldToWall(face.frame, { x: inst.position_x, y: inst.position_y, z: inst.position_z });
        const p = wallToWorld(face.frame, round(anchor.u + offset.dx), round(anchor.v + offset.dy), anchor.d);
        changed = true;
        return { ...inst, position_x: p.x, position_y: p.y, position_z: p.z };
    });
    if (changed) store.commitLocalChange(next);
    return changed;
}

/** Removes artworks from the exhibition (one undo step). */
export function removeInstances(ids: number[]): void {
    if (ids.length === 0) return;
    const store = useEditorStore.getState();
    const remove = new Set(ids);
    store.commitLocalChange(store.localInstances.filter((i) => !remove.has(i.id)));
    store.setWallEditorSelection(store.wallEditorSelection.filter((id) => !remove.has(id)));
}

// ── Scaling ───────────────────────────────────────────────────────────────

const NO_SHIFT: Offset = { dx: 0, dy: 0 };

/** Pictures (images) get frames and passepartouts; videos don't. */
export function isPicture(inst: ArtworkInstanceData): boolean {
    return (inst.artwork.asset.type ?? 'image') === 'image';
}

/** The monitor model has a fixed size; everything else on a wall can be scaled. */
export function isScalable(inst: ArtworkInstanceData): boolean {
    return !(inst.artwork.asset.type === 'video' && inst.medium === 'monitor');
}

/** An artwork after a scale gesture (not yet in the store). */
export interface ScaledArtwork {
    /** Instance with its new scale; its position is still the old one. */
    inst: ArtworkInstanceData;
    /** Anchor shift on the wall: a fixed corner, or lifting the artwork back above the floor. */
    shift: Offset;
    /** New rectangle on the wall (frame included). */
    rect: Rect;
}

/** Footprint at `inst`'s scale: framed pictures are recomputed, everything else scales its measured footprint. */
function footprintAt(item: WallArtwork, inst: ArtworkInstanceData): Footprint {
    if (isPicture(inst)) {
        const { left, right, bottom, top } = artworkFrameLayout(inst);
        return { left, right, bottom, top, exact: true };
    }
    const fx = Math.abs(inst.scale_x / item.inst.scale_x) || 1;
    const fy = Math.abs(inst.scale_y / item.inst.scale_y) || 1;
    const fp = item.footprint;
    return { left: fp.left * fx, right: fp.right * fx, bottom: fp.bottom * fy, top: fp.top * fy, exact: fp.exact };
}

/** Places a rescaled artwork: moved by `shift`, lifted so its bottom stays on or above the floor. */
function placeScaled(face: WallFace, item: WallArtwork, inst: ArtworkInstanceData, shift: Offset): ScaledArtwork {
    const rect = footprintRect(footprintAt(item, inst), item.anchor.u + shift.dx, item.anchor.v + shift.dy);
    const lift = Math.max(0, face.wallRect.y - rect.y);
    return {
        inst,
        shift: { dx: shift.dx, dy: shift.dy + lift },
        rect: { ...rect, y: rect.y + lift },
    };
}

/**
 * Scales artworks of the face by `factor` (x, y and z, so the aspect ratio stays) about their
 * picture centres. With `fixedCorner` (a single artwork dragged at a corner with Alt) that corner
 * of its footprint (frame and passepartout included) is kept exactly where it was instead. Monitors
 * are skipped.
 */
export function scaleArtworks(face: WallFace, ids: number[], factor: number, fixedCorner?: Corner): Map<number, ScaledArtwork> {
    const wanted = new Set(ids);
    const out = new Map<number, ScaledArtwork>();
    for (const item of face.items) {
        if (!wanted.has(item.id) || !isScalable(item.inst)) continue;
        const inst = {
            ...item.inst,
            scale_x: item.inst.scale_x * factor,
            scale_y: item.inst.scale_y * factor,
            scale_z: item.inst.scale_z * factor,
        };
        const shift = fixedCorner
            ? cornerShift(item.rect, footprintRect(footprintAt(item, inst), item.anchor.u, item.anchor.v), fixedCorner)
            : NO_SHIFT;
        out.set(item.id, placeScaled(face, item, inst, shift));
    }
    return out;
}

/** Sets one artwork's picture size in metres; width and height may leave its aspect ratio. */
export function resizeArtwork(face: WallFace, id: number, size: { w: number; h: number }): Map<number, ScaledArtwork> {
    const item = face.items.find((i) => i.id === id);
    if (!item || !isScalable(item.inst)) return new Map();
    const base = baseArtworkSize(item.inst);
    if (base.w <= 0 || base.h <= 0) return new Map();
    const inst = {
        ...item.inst,
        scale_x: (Math.sign(item.inst.scale_x) || 1) * (size.w / base.w),
        scale_y: (Math.sign(item.inst.scale_y) || 1) * (size.h / base.h),
    };
    return new Map([[id, placeScaled(face, item, inst, NO_SHIFT)]]);
}

/** Writes scaled artworks to the store (one undo step). */
export function commitScaledArtworks(face: WallFace, scaled: Map<number, ScaledArtwork>): boolean {
    if (scaled.size === 0) return false;
    const store = useEditorStore.getState();
    const round = (v: number) => Math.round(v * 10000) / 10000;
    let changed = false;
    const next = store.localInstances.map((inst) => {
        const s = scaled.get(inst.id);
        if (!s) return inst;
        const moved = Math.abs(s.shift.dx) > 1e-6 || Math.abs(s.shift.dy) > 1e-6;
        const rescaled = s.inst.scale_x !== inst.scale_x || s.inst.scale_y !== inst.scale_y || s.inst.scale_z !== inst.scale_z;
        if (!moved && !rescaled) return inst;
        changed = true;
        const result = { ...inst, scale_x: s.inst.scale_x, scale_y: s.inst.scale_y, scale_z: s.inst.scale_z };
        if (!moved) return result;
        const anchor = worldToWall(face.frame, { x: inst.position_x, y: inst.position_y, z: inst.position_z });
        const p = wallToWorld(face.frame, round(anchor.u + s.shift.dx), round(anchor.v + s.shift.dy), anchor.d);
        return { ...result, position_x: p.x, position_y: p.y, position_z: p.z };
    });
    if (changed) store.commitLocalChange(next);
    return changed;
}
