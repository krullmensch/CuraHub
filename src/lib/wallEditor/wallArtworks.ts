import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { useEditorStore } from '@/store/editorStore';
import { sideOfInstance, worldToWall, wallToWorld, WALL_SIDES, type WallFrame, type WallPoint, type WallSide } from './geometry';
import { computeFootprint, footprintRect, type Footprint } from './footprint';
import { instanceOnFace, openFaceOf, type ResolvedFace } from './faces';
import type { RoomFace, RoomOpening } from './roomFaces';
import type { LayoutItem, Offset, Rect } from './layout';

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
