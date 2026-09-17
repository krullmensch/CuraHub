import * as THREE from 'three';
import type { ModularWallData } from '@/store/editorStore';

/**
 * Coordinate system of the 2D wall editor.
 *
 * A modular wall has four faces: front (local +Z), back (local −Z) and the two narrow ends
 * right (local +X) and left (local −X) — "left/right" as seen when looking at the front.
 * Room walls (roomFaces.ts) use the same frame type. A face is described in "wall coordinates"
 * as seen by someone standing in front of it:
 * - `u` — metres to the right, measured from the face's LEFT edge (0 … face width)
 * - `v` — metres above the floor (world Y, the floor is at Y = 0)
 * - `d` — metres in front of the face, along its outward normal
 *
 * For every face, right = up × normal.
 */
export type WallSide = 'front' | 'back' | 'left' | 'right';

export const WALL_SIDES: WallSide[] = ['front', 'back', 'left', 'right'];

export interface WallFrame {
    /** World position of the face's left edge at floor height (u = 0, v = 0, d = 0). */
    origin: THREE.Vector3;
    /** Unit vector pointing to the viewer's right. */
    right: THREE.Vector3;
    /** Unit vector pointing out of the face, towards the viewer. */
    normal: THREE.Vector3;
    width: number;
    height: number;
    /** World Y of the wall's bottom edge (normally the floor, 0). */
    bottom: number;
}

export interface WallPoint {
    u: number;
    v: number;
    d: number;
}

type WallGeometry = Pick<ModularWallData, 'position_x' | 'position_y' | 'position_z' | 'rotation_y' | 'width' | 'height' | 'thickness'>;

const isEndFace = (side: WallSide) => side === 'left' || side === 'right';

/** Outward normal (x, z) of a wall face. */
export function wallSideNormal(wall: Pick<ModularWallData, 'rotation_y'>, side: WallSide): [number, number] {
    const cos = Math.cos(wall.rotation_y);
    const sin = Math.sin(wall.rotation_y);
    // Local +X = (cos, −sin), local +Z = (sin, cos) for a rotation around world Y.
    switch (side) {
        case 'front': return [sin, cos];
        case 'back': return [-sin, -cos];
        case 'right': return [cos, -sin];
        case 'left': return [-cos, sin];
    }
}

export function getWallFrame(wall: WallGeometry, side: WallSide): WallFrame {
    const [nx, nz] = wallSideNormal(wall, side);
    const normal = new THREE.Vector3(nx, 0, nz);
    const right = new THREE.Vector3(nz, 0, -nx); // up × normal
    const width = isEndFace(side) ? wall.thickness : wall.width;
    const depth = isEndFace(side) ? wall.width : wall.thickness;
    const origin = new THREE.Vector3(wall.position_x, 0, wall.position_z)
        .addScaledVector(normal, depth / 2)
        .addScaledVector(right, -width / 2);
    return {
        origin,
        right,
        normal,
        width,
        height: wall.height,
        bottom: wall.position_y - wall.height / 2,
    };
}

/** Face whose outward normal is closest to the direction (x, z). */
export function sideFromDirection(wall: Pick<ModularWallData, 'rotation_y'>, x: number, z: number): WallSide {
    let best: WallSide = 'front';
    let bestDot = -Infinity;
    for (const side of WALL_SIDES) {
        const [nx, nz] = wallSideNormal(wall, side);
        const dot = nx * x + nz * z;
        if (dot > bestDot) { bestDot = dot; best = side; }
    }
    return best;
}

/** Which face a world point lies in front of (the face it is closest to leaving the wall through). */
export function sideOfPoint(wall: WallGeometry, p: { x: number; z: number }): WallSide {
    const dx = p.x - wall.position_x;
    const dz = p.z - wall.position_z;
    const cos = Math.cos(wall.rotation_y);
    const sin = Math.sin(wall.rotation_y);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    const outX = Math.abs(lx) - wall.width / 2;
    const outZ = Math.abs(lz) - wall.thickness / 2;
    if (outX > outZ) return lx >= 0 ? 'right' : 'left';
    return lz >= 0 ? 'front' : 'back';
}

const _euler = new THREE.Euler();
const _facing = new THREE.Vector3();

/** World direction an artwork faces (its local +Z). */
export function facingOf(rotation: { rotation_x: number; rotation_y: number; rotation_z: number }): THREE.Vector3 {
    return _facing.set(0, 0, 1).applyEuler(_euler.set(rotation.rotation_x, rotation.rotation_y, rotation.rotation_z));
}

/**
 * The face an artwork hangs on: the one it faces (placement always turns artworks to the face
 * normal), or — for odd rotations — the one its position is in front of.
 */
export function sideOfInstance(
    wall: WallGeometry,
    inst: { position_x: number; position_z: number; rotation_x: number; rotation_y: number; rotation_z: number },
): WallSide {
    const f = facingOf(inst);
    const len = Math.hypot(f.x, f.z);
    if (len > 0.7) {
        const side = sideFromDirection(wall, f.x / len, f.z / len);
        const [nx, nz] = wallSideNormal(wall, side);
        if ((nx * f.x + nz * f.z) / len > 0.9) return side;
    }
    return sideOfPoint(wall, { x: inst.position_x, z: inst.position_z });
}

/** The face of a wall that is best visible from a point (e.g. the camera). */
export function sideSeenFrom(wall: WallGeometry, p: { x: number; z: number }): WallSide {
    const dx = p.x - wall.position_x;
    const dz = p.z - wall.position_z;
    const len = Math.hypot(dx, dz) || 1;
    let best: WallSide = 'front';
    let bestScore = -Infinity;
    for (const side of WALL_SIDES) {
        const [nx, nz] = wallSideNormal(wall, side);
        const score = ((nx * dx + nz * dz) / len) * (isEndFace(side) ? wall.thickness : wall.width);
        if (score > bestScore) { bestScore = score; best = side; }
    }
    return best;
}

export const WALL_SIDE_LABELS: Record<WallSide, string> = {
    front: 'Vorderseite',
    back: 'Rückseite',
    left: 'Seite links',
    right: 'Seite rechts',
};

export function worldToWall(frame: WallFrame, p: { x: number; y: number; z: number }): WallPoint {
    const dx = p.x - frame.origin.x;
    const dz = p.z - frame.origin.z;
    return {
        u: dx * frame.right.x + dz * frame.right.z,
        v: p.y,
        d: dx * frame.normal.x + dz * frame.normal.z,
    };
}

export function wallToWorld(frame: WallFrame, u: number, v: number, d: number, target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(
        frame.origin.x + frame.right.x * u + frame.normal.x * d,
        v,
        frame.origin.z + frame.right.z * u + frame.normal.z * d,
    );
}

/** Matrix that maps world space into the face's (u, v, d) space. */
export function worldToWallMatrix(frame: WallFrame, target = new THREE.Matrix4()): THREE.Matrix4 {
    const { right, normal, origin } = frame;
    // Rows: u = right · (p − origin), v = y, d = normal · (p − origin)
    return target.set(
        right.x, 0, right.z, -(right.x * origin.x + right.z * origin.z),
        0, 1, 0, 0,
        normal.x, 0, normal.z, -(normal.x * origin.x + normal.z * origin.z),
        0, 0, 0, 1,
    );
}
