import { describe, expect, it } from 'vitest';
import type { RoomFace } from '@/lib/wallEditor/roomFaces';
import { insideRoom } from './insideRoom';

const face = (normal: [number, number], origin: [number, number], height = 3): RoomFace => ({
    id: `${normal}`, label: '', normal, origin, width: 4, height, triangles: [], outline: [], openings: [],
});

// A 4 × 6 m room from x −2…2, z −3…3, walls 3 m high.
const ROOM = [
    face([1, 0], [-2, 3]),
    face([-1, 0], [2, -3]),
    face([0, 1], [2, -3]),
    face([0, -1], [-2, 3]),
];

describe('insideRoom', () => {
    it('is true between the walls, floor and wall tops', () => {
        expect(insideRoom([0, 1.6, 0], ROOM)).toBe(true);
        expect(insideRoom([1.9, 2.9, -2.9], ROOM)).toBe(true);
    });

    it('is false beyond any wall', () => {
        expect(insideRoom([2.1, 1.6, 0], ROOM)).toBe(false);
        expect(insideRoom([0, 1.6, -3.5], ROOM)).toBe(false);
    });

    it('is false above the walls and below the floor', () => {
        expect(insideRoom([0, 3.5, 0], ROOM)).toBe(false);
        expect(insideRoom([0, -0.5, 0], ROOM)).toBe(false);
    });

    it('is false without room faces', () => {
        expect(insideRoom([0, 1.6, 0], [])).toBe(false);
    });
});
