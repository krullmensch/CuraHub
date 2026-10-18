import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assignTrianglesToFaces, cutawayFaceIds, sameIds, splitByRoomFace } from './roomCutaway';
import { extractRoomFaces, geometryTriangles, type RoomFace } from './wallEditor/roomFaces';

/** Box at a centre, as a non-indexed geometry with position only (mergeable). */
function box(w: number, h: number, d: number, x: number, y: number, z: number) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g.translate(x, y, z);
    return g;
}

/** Room 10 × 6 m inside, 3 m high, walls 0.4 m thick; the long walls run over the corners. */
function room() {
    const walls = {
        back: box(10.8, 3, 0.4, 0, 1.5, -3.2),
        front: box(10.8, 3, 0.4, 0, 1.5, 3.2),
        left: box(0.4, 3, 6, -5.2, 1.5, 0),
        right: box(0.4, 3, 6, 5.2, 1.5, 0),
    };
    const floor = box(10, 0.2, 6, 0, -0.1, 0);
    const wallGeometry = mergeGeometries(Object.values(walls))!;
    const faces = extractRoomFaces(geometryTriangles(wallGeometry), geometryTriangles(floor));
    return { walls, floor, wallGeometry, faces };
}

const faceFacing = (faces: RoomFace[], nx: number, nz: number) =>
    faces.find((f) => Math.abs(f.normal[0] - nx) < 1e-6 && Math.abs(f.normal[1] - nz) < 1e-6)!;

describe('cutawayFaceIds', () => {
    const { faces } = room();
    const back = faceFacing(faces, 0, 1);
    const front = faceFacing(faces, 0, -1);
    const left = faceFacing(faces, 1, 0);
    const right = faceFacing(faces, -1, 0);

    it('finds the four inner faces', () => {
        expect(faces).toHaveLength(4);
        expect([back, front, left, right].every(Boolean)).toBe(true);
    });

    it('hides the wall on the camera side only', () => {
        expect(cutawayFaceIds(faces, { x: 0, z: 20 })).toEqual([front.id]);
        expect(cutawayFaceIds(faces, { x: -20, z: 0 })).toEqual([left.id]);
    });

    it('hides both walls of the corner the camera looks over', () => {
        expect(new Set(cutawayFaceIds(faces, { x: 20, z: -20 }))).toEqual(new Set([right.id, back.id]));
    });

    it('hides nothing from above the room', () => {
        expect(cutawayFaceIds(faces, { x: 1, z: -1 })).toEqual([]);
    });

    it('keeps a wall the camera only just passed (margin)', () => {
        expect(cutawayFaceIds(faces, { x: 0, z: 3.02 })).toEqual([]);
    });
});

describe('assignTrianglesToFaces', () => {
    const { walls, floor, faces } = room();

    it('gives the inner and outer side of every wall to its face', () => {
        const cases: [THREE.BufferGeometry, RoomFace][] = [
            [walls.back, faceFacing(faces, 0, 1)],
            [walls.front, faceFacing(faces, 0, -1)],
            [walls.left, faceFacing(faces, 1, 0)],
            [walls.right, faceFacing(faces, -1, 0)],
        ];
        for (const [wall, face] of cases) {
            const tris = geometryTriangles(wall);
            const owners = assignTrianglesToFaces(tris, faces);
            tris.forEach((t, i) => {
                const n = new THREE.Triangle(new THREE.Vector3(...t[0]), new THREE.Vector3(...t[1]), new THREE.Vector3(...t[2]))
                    .getNormal(new THREE.Vector3());
                // Faces parallel to the wall (inside, outside) and its top
                const parallel = Math.abs(n.x * face.normal[0] + n.z * face.normal[1]) > 0.9 || n.y > 0.9;
                if (parallel) expect(faces[owners[i]]?.id).toBe(face.id);
            });
        }
    });

    it('leaves the floor alone', () => {
        // Top and bottom of the floor slab (its edges are flush with the walls' inner faces)
        const tris = geometryTriangles(floor).filter((t) => t.every((v) => Math.abs(v[1] - t[0][1]) < 1e-9));
        expect(tris.length).toBeGreaterThan(0);
        expect(assignTrianglesToFaces(tris, faces).every((o) => o === -1)).toBe(true);
    });
});

describe('splitByRoomFace', () => {
    it('keeps every triangle exactly once', () => {
        const { wallGeometry, faces } = room();
        const pieces = splitByRoomFace(wallGeometry, faces);
        const total = pieces.reduce((sum, p) => sum + p.geometry.getIndex()!.count, 0);
        expect(total).toBe(wallGeometry.getAttribute('position').count);
        expect(new Set(pieces.map((p) => p.faceId))).toEqual(new Set(faces.map((f) => f.id)));
    });

    it('places pieces through the mesh transform', () => {
        const { faces } = room();
        // A door leaf modelled at the origin, placed in the left wall
        const leaf = new THREE.BoxGeometry(0.04, 2, 1);
        const matrix = new THREE.Matrix4().makeTranslation(-5.38, 1, 0);
        const pieces = splitByRoomFace(leaf, faces, matrix);
        expect(pieces.map((p) => p.faceId)).toEqual([faceFacing(faces, 1, 0).id]);
    });
});

describe('sameIds', () => {
    it('compares in order', () => {
        expect(sameIds(['a', 'b'], ['a', 'b'])).toBe(true);
        expect(sameIds(['a'], ['a', 'b'])).toBe(false);
        expect(sameIds(['b', 'a'], ['a', 'b'])).toBe(false);
    });
});
