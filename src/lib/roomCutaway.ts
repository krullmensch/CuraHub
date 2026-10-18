import * as THREE from 'three';
import { geometryTriangles, type RoomFace } from './wallEditor/roomFaces';

/**
 * Cutaway view of the room (orbit view, like a doll's house): the room walls between the camera
 * and the room's inside are hidden, the ones behind stay. Works on the room faces of
 * `extractRoomFaces` — modular walls are not involved.
 */

type Vec3 = [number, number, number];
type Tri = [Vec3, Vec3, Vec3];

/** The camera must be this far outside a face's plane before the face is hidden (no flicker at grazing angles). */
const CUTAWAY_MARGIN = 0.05;
/** Triangles scoring worse than this belong to no face (they always stay). */
const MAX_SCORE = 1.0;

/** Ids of the room faces the camera looks at from behind (it is outside the room on their side). */
export function cutawayFaceIds(faces: RoomFace[], camera: { x: number; z: number }): string[] {
    return faces
        .filter((f) => f.normal[0] * (camera.x - f.origin[0]) + f.normal[1] * (camera.z - f.origin[1]) < -CUTAWAY_MARGIN)
        .map((f) => f.id);
}

export const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * How well a point (with the normal of its surface, or null) belongs to a face's wall: distance
 * beyond the face's ends, plus how far it lies in front of the face (inside the room — heavily
 * penalised) or behind it (inside the wall body or on its outer side — cheap).
 */
function faceScore(face: RoomFace, c: Vec3, n: Vec3 | null): number {
    const [nx, nz] = face.normal;
    const dx = c[0] - face.origin[0];
    const dz = c[2] - face.origin[1];
    const u = nz * dx - nx * dz; // right = up × normal
    const d = nx * dx + nz * dz;
    const outside = Math.max(0, -u, u - face.width);
    let score = outside + 2 * Math.max(0, d) + 0.5 * Math.max(0, -d);
    // Vertical surfaces not parallel to the face (reveals, wall ends) — a corner goes to the wall it continues.
    if (n && Math.abs(n[1]) < 0.5 && Math.abs(n[0] * nx + n[2] * nz) < 0.9) score += 0.2;
    return score;
}

function triangleNormal(t: Tri): Vec3 | null {
    const ax = t[1][0] - t[0][0], ay = t[1][1] - t[0][1], az = t[1][2] - t[0][2];
    const bx = t[2][0] - t[0][0], by = t[2][1] - t[0][1], bz = t[2][2] - t[0][2];
    const n: Vec3 = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
    const len = Math.hypot(n[0], n[1], n[2]);
    return len < 1e-12 ? null : [n[0] / len, n[1] / len, n[2] / len];
}

/** For every triangle the index of the face whose wall it belongs to, or -1 (always visible). */
export function assignTrianglesToFaces(tris: Tri[], faces: RoomFace[]): number[] {
    return tris.map((t) => {
        const c: Vec3 = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3];
        const n = triangleNormal(t);
        let best = -1;
        let bestScore = MAX_SCORE;
        faces.forEach((face, i) => {
            const score = faceScore(face, c, n);
            if (score < bestScore) { best = i; bestScore = score; }
        });
        return best;
    });
}

export interface RoomPiece {
    /** Room face the piece belongs to; null = belongs to no face (always shown). */
    faceId: string | null;
    geometry: THREE.BufferGeometry;
}

/**
 * Splits a mesh of the room model into one geometry per room face (plus the rest).
 * @param matrix the mesh's transform into the space the faces are in
 */
export function splitByRoomFace(geometry: THREE.BufferGeometry, faces: RoomFace[], matrix?: THREE.Matrix4): RoomPiece[] {
    const owners = assignTrianglesToFaces(geometryTriangles(geometry, matrix), faces);
    const index = geometry.getIndex();
    const vertexAt = (i: number) => (index ? index.getX(i) : i);
    const buckets = new Map<number, number[]>();
    owners.forEach((owner, t) => {
        let bucket = buckets.get(owner);
        if (!bucket) { bucket = []; buckets.set(owner, bucket); }
        bucket.push(vertexAt(3 * t), vertexAt(3 * t + 1), vertexAt(3 * t + 2));
    });
    return [...buckets].map(([owner, indices]) => {
        // Own copy of the (small) attributes: three's WebGL backend frees a geometry's attribute
        // buffers on dispose, which would break pieces sharing them.
        const piece = new THREE.BufferGeometry();
        for (const [name, attribute] of Object.entries(geometry.attributes)) piece.setAttribute(name, attribute.clone());
        piece.setIndex(indices);
        piece.computeBoundingBox();
        piece.computeBoundingSphere();
        return { faceId: owner < 0 ? null : faces[owner].id, geometry: piece };
    });
}
