import { describe, expect, test } from 'vitest';
import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { collectMeasuredFaces, faceAnnotations, floorLeaders, HANGING_DASH, HANGING_GAP } from './annotations';
import { rowGaps, type Rect } from './layout';
import type { MeasureToggles } from './measureToggles';

const ALL_ON: MeasureToggles = { showHangingLine: true, showFloorDistances: true, showGaps: true };
const ALL_OFF: MeasureToggles = { showHangingLine: false, showFloorDistances: false, showGaps: false };

// 4 m × 3 m wall at the origin, not rotated: front faces +Z, its left edge is at x = -2.
const wall: ModularWallData = {
    id: 1, position_x: 0, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
    width: 4, height: 3, thickness: 0.2, color: '#ffffff', isLocked: true,
};

const picture = (id: number, x: number, y: number, z: number, rotationY: number, wallId: number | null = 1): ArtworkInstanceData => ({
    id, wallId, frameStyle: 'none',
    artwork: { width: 50, height: 40, asset: { path: `/uploads/${id}.webp`, width: 1000, height: 800, dpi: 72, type: 'image' } },
    position_x: x, position_y: y, position_z: z,
    rotation_x: 0, rotation_y: rotationY, rotation_z: 0,
    scale_x: 1, scale_y: 1, scale_z: 1,
});

describe('collectMeasuredFaces', () => {
    test('groups artworks by wall face and drops empty faces', () => {
        const instances = [
            picture(1, 0, 1.5, 0.11, 0),
            picture(2, 1, 1.5, 0.11, 0),
            picture(3, 0, 1.5, -0.11, Math.PI),
        ];
        const faces = collectMeasuredFaces(instances, [wall], []);
        expect(faces.map((f) => f.key)).toEqual(['wall:1:front', 'wall:1:back']);
        expect(faces[0].items.map((i) => i.id)).toEqual([1, 2]);
        expect(faces[1].items.map((i) => i.id)).toEqual([3]);
    });

    test('skips artworks without a known face', () => {
        const instances = [picture(1, 0, 1.5, 0.11, 0, 99), picture(2, 0, 1.5, 0.11, 0, null)];
        expect(collectMeasuredFaces(instances, [wall], [])).toEqual([]);
    });

    test('artwork rect is centred on its anchor in wall coordinates', () => {
        const [face] = collectMeasuredFaces([picture(1, 0, 1.5, 0.11, 0)], [wall], []);
        const r = face.items[0].rect;
        expect(r.x + r.w / 2).toBeCloseTo(2);
        expect(r.y + r.h / 2).toBeCloseTo(1.5);
    });
});

const face = (rects: Rect[], wallRect: Rect = { x: 0, y: 0, w: 4, h: 3 }) => ({
    wallRect,
    items: rects.map((rect, i) => ({ id: i + 1, rect })),
});

describe('floorLeaders', () => {
    test('from the bottom edge down to the floor, labelled with the centre height', () => {
        const [leader] = floorLeaders([{ id: 7, rect: { x: 1, y: 1.3, w: 0.5, h: 0.4 } }], 0);
        expect(leader.id).toBe(7);
        expect(leader.u).toBeCloseTo(1.25);
        expect(leader.top).toBeCloseTo(1.3);
        expect(leader.bottom).toBe(0);
        expect(leader.value).toBeCloseTo(1.5);
        expect(leader.labelV).toBeCloseTo(0.65);
    });

    test('measures from the face bottom, not world zero', () => {
        const [leader] = floorLeaders([{ id: 1, rect: { x: 0, y: 1.2, w: 1, h: 0.4 } }], 0.2);
        expect(leader.bottom).toBeCloseTo(0.2);
        expect(leader.value).toBeCloseTo(1.2);
    });

    test('no leader for artworks touching or below the floor', () => {
        expect(floorLeaders([{ id: 1, rect: { x: 0, y: 0, w: 1, h: 1 } }, { id: 2, rect: { x: 2, y: -0.1, w: 1, h: 1 } }], 0)).toEqual([]);
    });
});

describe('faceAnnotations', () => {
    test('nothing when every toggle is off', () => {
        expect(faceAnnotations(face([{ x: 1, y: 1.3, w: 0.5, h: 0.4 }]), ALL_OFF, 1.5)).toEqual({ segments: [], labels: [] });
    });

    test('hanging line: dashes across the face at bottom + hanging height', () => {
        const { segments, labels } = faceAnnotations(face([]), { ...ALL_OFF, showHangingLine: true }, 1.5);
        const dashes = segments.filter((s) => s.kind === 'hanging');
        expect(dashes.length).toBe(Math.ceil(4 / (HANGING_DASH + HANGING_GAP)));
        for (const s of dashes) {
            expect(s.v1).toBeCloseTo(1.5);
            expect(s.v2).toBeCloseTo(1.5);
            expect(s.u2).toBeLessThanOrEqual(4 + 1e-9);
        }
        expect(dashes[0].u1).toBe(0);
        expect(labels).toEqual([{ kind: 'hanging', u: 0.05, v: 1.55, text: 'Hängehöhe 150 cm', align: 'start' }]);
    });

    test('hanging line follows a raised face bottom', () => {
        const { segments } = faceAnnotations(face([], { x: 0, y: 0.5, w: 2, h: 3 }), { ...ALL_OFF, showHangingLine: true }, 1.5);
        expect(segments[0].v1).toBeCloseTo(2);
    });

    test('no hanging line when it would lie above the face', () => {
        expect(faceAnnotations(face([], { x: 0, y: 0, w: 4, h: 2.5 }), { ...ALL_OFF, showHangingLine: true }, 3)).toEqual({ segments: [], labels: [] });
    });

    test('floor distances: leader with end caps and a centred label', () => {
        const { segments, labels } = faceAnnotations(face([{ x: 1, y: 1.3, w: 0.5, h: 0.4 }]), { ...ALL_OFF, showFloorDistances: true }, 1.5);
        expect(segments.filter((s) => s.kind === 'floor')).toHaveLength(3);
        expect(segments).toContainEqual({ kind: 'floor', u1: 1.25, v1: 1.3, u2: 1.25, v2: 0 });
        expect(labels).toEqual([{ kind: 'floor', u: 1.25, v: 0.65, text: 'Mitte 150 cm', align: 'center' }]);
    });

    test('gaps: one line with end caps per rowGaps measurement', () => {
        const rects = [{ x: 0.5, y: 1.3, w: 0.5, h: 0.4 }, { x: 1.3, y: 1.3, w: 0.5, h: 0.4 }];
        const { segments, labels } = faceAnnotations(face(rects), { ...ALL_OFF, showGaps: true }, 1.5);
        const gaps = rowGaps(rects);
        expect(gaps).toHaveLength(1);
        expect(segments.filter((s) => s.kind === 'gap')).toHaveLength(3);
        expect(segments).toContainEqual({ kind: 'gap', u1: gaps[0].x1, v1: gaps[0].y1, u2: gaps[0].x2, v2: gaps[0].y2 });
        expect(labels).toEqual([{ kind: 'gap', u: 1.15, v: 1.5, text: '30 cm', align: 'center' }]);
    });

    test('all toggles together', () => {
        const rects = [{ x: 0.5, y: 1.3, w: 0.5, h: 0.4 }, { x: 1.3, y: 1.3, w: 0.5, h: 0.4 }];
        const { labels } = faceAnnotations(face(rects), ALL_ON, 1.5);
        expect(labels.map((l) => l.kind).sort()).toEqual(['floor', 'floor', 'gap', 'hanging']);
    });
});
