import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { useEditorStore } from '@/store/editorStore';
import { getWallFrame, sideOfPoint, worldToWall, wallToWorld, type WallFrame, type WallPoint, type WallSide } from './geometry';
import { computeFootprint, footprintRect, type Footprint } from './footprint';
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
    wall: ModularWallData;
    side: WallSide;
    frame: WallFrame;
    /** The face itself: (0, bottom) … (width, top). */
    wallRect: Rect;
    items: WallArtwork[];
    /** Artworks hanging on the other face of the same wall. */
    otherSideCount: number;
}

const labelOf = (inst: ArtworkInstanceData) =>
    inst.artwork.title?.trim()
    || inst.artwork.asset.path.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '')
    || `Werk ${inst.id}`;

export function collectWallFace(wall: ModularWallData, side: WallSide, instances: ArtworkInstanceData[]): WallFace {
    const frame = getWallFrame(wall, side);
    const items: WallArtwork[] = [];
    let otherSideCount = 0;
    for (const inst of instances) {
        if (inst.wallId !== wall.id) continue;
        const p = { x: inst.position_x, y: inst.position_y, z: inst.position_z };
        if (sideOfPoint(wall, p) !== side) {
            otherSideCount++;
            continue;
        }
        const anchor = worldToWall(frame, p);
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
        wall,
        side,
        frame,
        wallRect: { x: 0, y: frame.bottom, w: wall.width, h: wall.height },
        items,
        otherSideCount,
    };
}

/** The open face, read straight from the store (for event handlers). */
export function getOpenWallFace(): WallFace | null {
    const state = useEditorStore.getState();
    const target = state.wallEditor;
    if (!target) return null;
    const wall = state.localWalls.find((w) => w.id === target.wallId);
    if (!wall) return null;
    return collectWallFace(wall, target.side, state.localInstances);
}

/**
 * Moves artworks by wall-space offsets and records one undo step.
 * Offsets are rounded to 0.1 mm so stored positions stay tidy.
 */
export function commitWallOffsets(face: WallFace, offsets: Map<number, Offset>): boolean {
    const store = useEditorStore.getState();
    let changed = false;
    const round = (v: number) => Math.round(v * 10000) / 10000;
    const next = store.localInstances.map((inst) => {
        const offset = offsets.get(inst.id);
        if (!offset || inst.wallId !== face.wall.id) return inst;
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
