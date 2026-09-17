import * as THREE from 'three';
import type { ModularWallData } from '@/store/editorStore';

/**
 * Coordinate system of the 2D wall editor.
 *
 * Every wall has two faces. A face is described in "wall coordinates" as seen by someone standing
 * in front of that face:
 * - `u` — metres to the right, measured from the wall's LEFT edge (0 … wall.width)
 * - `v` — metres above the floor (world Y, the floor is at Y = 0)
 * - `d` — metres in front of the face, along its outward normal
 *
 * Front = the wall's local +Z side, back = its local −Z side. Seen from the back, the wall's
 * local +X points to the viewer's left, so `u` runs along local −X there.
 */
export type WallSide = 'front' | 'back';

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

export function getWallFrame(wall: WallGeometry, side: WallSide): WallFrame {
    const sign = side === 'front' ? 1 : -1;
    const cos = Math.cos(wall.rotation_y);
    const sin = Math.sin(wall.rotation_y);
    // Local +X and +Z of a group rotated by rotation_y around world Y.
    const localX = new THREE.Vector3(cos, 0, -sin);
    const localZ = new THREE.Vector3(sin, 0, cos);
    const right = localX.clone().multiplyScalar(sign);
    const normal = localZ.clone().multiplyScalar(sign);
    const center = new THREE.Vector3(wall.position_x, 0, wall.position_z);
    const origin = center
        .add(normal.clone().multiplyScalar(wall.thickness / 2))
        .add(right.clone().multiplyScalar(-wall.width / 2));
    return {
        origin,
        right,
        normal,
        width: wall.width,
        height: wall.height,
        bottom: wall.position_y - wall.height / 2,
    };
}

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

/** Which face of the wall a world point lies in front of. */
export function sideOfPoint(wall: WallGeometry, p: { x: number; z: number }): WallSide {
    const dx = p.x - wall.position_x;
    const dz = p.z - wall.position_z;
    const localZ = dx * Math.sin(wall.rotation_y) + dz * Math.cos(wall.rotation_y);
    return localZ >= 0 ? 'front' : 'back';
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
