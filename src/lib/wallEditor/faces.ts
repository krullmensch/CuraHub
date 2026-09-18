import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { isFloorAssetType } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import {
    facingOf,
    getWallFrame,
    sideOfInstance,
    worldToWall,
    WALL_SIDE_LABELS,
    type WallFrame,
    type WallSide,
} from './geometry';
import { roomFaceFrame, type RoomFace } from './roomFaces';

/** What the 2D wall editor has open: one face of a modular wall, or a wall of the room. */
export type WallEditorTarget =
    | { kind: 'wall'; wallId: number; side: WallSide }
    | { kind: 'room'; faceId: string };

export interface ResolvedFace {
    /** Unique per face: `wall:<id>:<side>` or the room face id. */
    key: string;
    target: WallEditorTarget;
    frame: WallFrame;
    label: string;
    wall: ModularWallData | null;
    side: WallSide | null;
    room: RoomFace | null;
}

export const targetKey = (t: WallEditorTarget) => (t.kind === 'wall' ? `wall:${t.wallId}:${t.side}` : t.faceId);

export function resolveFace(target: WallEditorTarget, walls: ModularWallData[], roomFaces: RoomFace[]): ResolvedFace | null {
    if (target.kind === 'wall') {
        const wall = walls.find((w) => w.id === target.wallId);
        if (!wall) return null;
        return {
            key: targetKey(target),
            target,
            frame: getWallFrame(wall, target.side),
            label: `${wall.label || 'Wand'} · ${WALL_SIDE_LABELS[target.side]}`,
            wall,
            side: target.side,
            room: null,
        };
    }
    const room = roomFaces.find((f) => f.id === target.faceId);
    if (!room) return null;
    return { key: room.id, target, frame: roomFaceFrame(room), label: room.label, wall: null, side: null, room };
}

/** Tolerances for artworks on room walls (they carry no wall id). */
const ROOM_MAX_DISTANCE = 0.25;
const ROOM_MARGIN = 0.5;

function onRoomFace(inst: ArtworkInstanceData, room: RoomFace, frame: WallFrame): boolean {
    if (inst.wallId != null) return false;
    if (isFloorAssetType(inst.medium) || isFloorAssetType(inst.artwork?.asset?.type)) return false;
    const p = worldToWall(frame, { x: inst.position_x, y: inst.position_y, z: inst.position_z });
    if (p.d < -0.05 || p.d > ROOM_MAX_DISTANCE) return false;
    if (p.u < -ROOM_MARGIN || p.u > room.width + ROOM_MARGIN || p.v < -ROOM_MARGIN || p.v > room.height + ROOM_MARGIN) return false;
    const f = facingOf(inst);
    return f.x * frame.normal.x + f.z * frame.normal.z > 0.7;
}

/** Whether an artwork hangs on the given face. */
export function instanceOnFace(inst: ArtworkInstanceData, face: ResolvedFace): boolean {
    if (face.wall) return inst.wallId === face.wall.id && sideOfInstance(face.wall, inst) === face.side;
    if (face.room) return onRoomFace(inst, face.room, face.frame);
    return false;
}

/** The face an artwork hangs on (modular wall face or room wall), if any. */
export function targetForInstance(inst: ArtworkInstanceData, walls: ModularWallData[], roomFaces: RoomFace[]): WallEditorTarget | null {
    if (inst.wallId != null) {
        const wall = walls.find((w) => w.id === inst.wallId);
        return wall ? { kind: 'wall', wallId: wall.id, side: sideOfInstance(wall, inst) } : null;
    }
    for (const room of roomFaces) {
        if (onRoomFace(inst, room, roomFaceFrame(room))) return { kind: 'room', faceId: room.id };
    }
    return null;
}

/** The room face a world point (with its surface normal) lies on. */
export function roomFaceAt(point: { x: number; y: number; z: number }, normal: { x: number; z: number }, roomFaces: RoomFace[]): RoomFace | null {
    for (const room of roomFaces) {
        const frame = roomFaceFrame(room);
        if (normal.x * frame.normal.x + normal.z * frame.normal.z < 0.9) continue;
        const p = worldToWall(frame, point);
        if (Math.abs(p.d) < 0.05 && p.u > -0.05 && p.u < room.width + 0.05 && p.v > -0.05 && p.v < room.height + 0.05) return room;
    }
    return null;
}

let cache: { target: WallEditorTarget | null; walls: ModularWallData[] | null; rooms: RoomFace[] | null; face: ResolvedFace | null } = {
    target: null, walls: null, rooms: null, face: null,
};

/** Resolved open face for an editor state snapshot (memoised — safe to call from store selectors). */
export function openFaceOf(state: { wallEditor: WallEditorTarget | null; localWalls: ModularWallData[] }): ResolvedFace | null {
    const target = state.wallEditor;
    if (!target) return null;
    const rooms = useWallEditorView.getState().roomFaces;
    if (cache.target !== target || cache.walls !== state.localWalls || cache.rooms !== rooms) {
        cache = { target, walls: state.localWalls, rooms, face: resolveFace(target, state.localWalls, rooms) };
    }
    return cache.face;
}
