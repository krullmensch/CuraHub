import { describe, expect, it } from 'vitest';
import { BOX_EDGES, visibleBoxEdges, type BoxCorner } from './boxOutline';

// Corner i: x = bit 0, y = bit 1, z = bit 2 (min 0, max 1 → unit box at the origin).
const unitBox = (): BoxCorner[] => Array.from({ length: 8 }, (_, i) => ({
    x: i & 1 ? 1 : 0, y: i & 2 ? 1 : 0, z: i & 4 ? 1 : 0,
}));

const transform = (corners: BoxCorner[], fn: (c: BoxCorner) => BoxCorner) => corners.map(fn);

const key = (edges: readonly (readonly [number, number])[]) =>
    edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`).sort();

/** Edges of the faces whose corner sets are given. */
const facesEdges = (...faces: number[][]) => {
    const set = new Set<string>();
    for (const face of faces) {
        for (const [a, b] of BOX_EDGES) if (face.includes(a) && face.includes(b)) set.add(`${a}-${b}`);
    }
    return [...set].sort();
};
const X_MAX = [1, 3, 5, 7];
const Y_MAX = [2, 3, 6, 7];
const Z_MAX = [4, 5, 6, 7];
const X_MIN = [0, 2, 4, 6];
const Z_MIN = [0, 1, 2, 3];

describe('visibleBoxEdges', () => {
    it('keeps the 9 edges of the 3 front faces from the (+x,+y,+z) diagonal', () => {
        const edges = visibleBoxEdges(unitBox(), { position: { x: 5, y: 5, z: 5 } });
        expect(edges).toHaveLength(9);
        expect(key(edges)).toEqual(facesEdges(X_MAX, Y_MAX, Z_MAX));
    });

    it('keeps only the 4 edges of the +Z face from straight +Z', () => {
        const edges = visibleBoxEdges(unitBox(), { position: { x: 0.5, y: 0.5, z: 5 } });
        expect(key(edges)).toEqual(facesEdges(Z_MAX));
        expect(edges).toHaveLength(4);
    });

    it('handles a box rotated 45° about Y', () => {
        const c = Math.SQRT1_2;
        // Rotate about the box centre (0.5, 0.5, 0.5).
        const rotated = transform(unitBox(), ({ x, y, z }) => {
            const dx = x - 0.5, dz = z - 0.5;
            return { x: 0.5 + c * dx + c * dz, y, z: 0.5 - c * dx + c * dz };
        });
        // Rotation maps the local +Z axis to (+c, 0, +c) and +X to (+c, 0, -c).
        // Camera far along world +Z: sees the faces whose outward normal has +z: local +Z and local -X.
        const edges = visibleBoxEdges(rotated, { position: { x: 0.5, y: 0.5, z: 50 } });
        expect(key(edges)).toEqual(facesEdges(Z_MAX, X_MIN));
        expect(edges).toHaveLength(7);
    });

    it('is independent of handedness (mirrored box)', () => {
        const mirrored = transform(unitBox(), ({ x, y, z }) => ({ x: -x, y, z }));
        // x is mirrored: local x-max lies at world x = -1. Camera at world -x sees local X_MAX.
        const edges = visibleBoxEdges(mirrored, { position: { x: -50, y: 0.5, z: 0.5 } });
        expect(key(edges)).toEqual(facesEdges(X_MAX));
    });

    it('supports an orthographic view direction', () => {
        // Camera looks along (-1,-1,-1): sees the +x, +y, +z faces.
        const edges = visibleBoxEdges(unitBox(), { direction: { x: -1, y: -1, z: -1 } });
        expect(key(edges)).toEqual(facesEdges(X_MAX, Y_MAX, Z_MAX));
        // Looking along +Z: the camera sits on the -Z side.
        const back = visibleBoxEdges(unitBox(), { direction: { x: 0, y: 0, z: 1 } });
        expect(key(back)).toEqual(facesEdges(Z_MIN));
    });

    it('returns all 12 edges with the camera inside the box', () => {
        const edges = visibleBoxEdges(unitBox(), { position: { x: 0.5, y: 0.5, z: 0.5 } });
        expect(edges).toHaveLength(12);
        expect(key(edges)).toEqual(key(BOX_EDGES));
    });

    it('writes into a reusable output array', () => {
        const out: [number, number][] = [[9, 9]];
        const edges = visibleBoxEdges(unitBox(), { position: { x: 0.5, y: 0.5, z: 5 } }, out);
        expect(edges).toBe(out);
        expect(out).toHaveLength(4);
    });
});
