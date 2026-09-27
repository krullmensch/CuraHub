import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rect } from './layout';
import {
    DEFAULT_HANGING_HEIGHT,
    clampGuideValue,
    dropWallKeys,
    flipGuide,
    guideToWall,
    hasGuideAt,
    newGuideValue,
    parseWallLayout,
    renameWallKeys,
    serializeGuides,
    sortGuides,
    wallToGuideValue,
    type StoredGuide,
} from './guides';

// A face whose floor sits 10 cm below the frame origin (like room walls).
const wall: Rect = { x: 0, y: -0.1, w: 4, h: 3 };

describe('guide ↔ wall coordinates', () => {
    it('measures horizontal guides from the floor and vertical ones from the left edge', () => {
        expect(guideToWall({ axis: 'h', value: 1.45 }, wall)).toBeCloseTo(1.35);
        expect(guideToWall({ axis: 'v', value: 2 }, wall)).toBeCloseTo(2);
    });

    it('converts wall positions back to guide values', () => {
        expect(wallToGuideValue('h', 1.35, wall)).toBeCloseTo(1.45);
        expect(wallToGuideValue('v', 2, wall)).toBeCloseTo(2);
    });

    it('clamps values to the face', () => {
        expect(clampGuideValue('h', 5, wall)).toBe(3);
        expect(clampGuideValue('v', -1, wall)).toBe(0);
        expect(clampGuideValue('v', 3.5, wall)).toBe(3.5);
    });
});

describe('sortGuides', () => {
    it('lists horizontal guides top to bottom, then vertical ones left to right', () => {
        const guides: StoredGuide[] = [
            { axis: 'v', value: 3 },
            { axis: 'h', value: 1 },
            { axis: 'v', value: 0.5 },
            { axis: 'h', value: 2.5 },
        ];
        expect(sortGuides(guides)).toEqual([
            { axis: 'h', value: 2.5 },
            { axis: 'h', value: 1 },
            { axis: 'v', value: 0.5 },
            { axis: 'v', value: 3 },
        ]);
    });

    it('does not change its input', () => {
        const guides: StoredGuide[] = [{ axis: 'v', value: 3 }, { axis: 'h', value: 1 }];
        sortGuides(guides);
        expect(guides[0].axis).toBe('v');
    });
});

describe('flipGuide', () => {
    it('keeps the value and the other fields', () => {
        expect(flipGuide({ id: 7, axis: 'h' as const, value: 2 }, wall)).toEqual({ id: 7, axis: 'v', value: 2 });
    });

    it('clamps to the face along the new direction', () => {
        expect(flipGuide({ axis: 'v' as const, value: 3.5 }, wall)).toEqual({ axis: 'h', value: 3 });
    });
});

describe('hasGuideAt', () => {
    it('finds a guide within half a millimetre on the same axis', () => {
        const guides: StoredGuide[] = [{ axis: 'v', value: 2 }];
        expect(hasGuideAt(guides, 'v', 2.0004)).toBe(true);
        expect(hasGuideAt(guides, 'v', 2.002)).toBe(false);
        expect(hasGuideAt(guides, 'h', 2)).toBe(false);
    });
});

describe('newGuideValue', () => {
    it('starts in the middle of the view, rounded to whole centimetres', () => {
        expect(newGuideValue('v', { u: 1.234, v: 0 }, wall)).toBeCloseTo(1.23);
        expect(newGuideValue('h', { u: 0, v: 1.4567 }, wall)).toBeCloseTo(1.56);
    });

    it('stays on the face when the view shows something else', () => {
        expect(newGuideValue('v', { u: 12, v: 0 }, wall)).toBe(4);
        expect(newGuideValue('h', { u: 0, v: -3 }, wall)).toBe(0);
    });
});

describe('serializeGuides', () => {
    it('drops ids and faces without guides', () => {
        const withId = { id: 3, axis: 'h' as const, value: 1.45 };
        expect(serializeGuides({ 'wall:1:front': [withId], 'wall:1:back': [] }))
            .toEqual({ 'wall:1:front': [{ axis: 'h', value: 1.45 }] });
    });
});

describe('renameWallKeys / dropWallKeys', () => {
    const byFace = { 'wall:-1:front': 1, 'wall:-12:back': 2, 'room:satellit:0': 3 };

    it('moves a temporary wall id to its database id', () => {
        expect(renameWallKeys(byFace, -1, 7)).toEqual({ 'wall:7:front': 1, 'wall:-12:back': 2, 'room:satellit:0': 3 });
    });

    it('returns the same object when nothing matches', () => {
        expect(renameWallKeys(byFace, 99, 7)).toBe(byFace);
        expect(dropWallKeys(byFace, 99)).toBe(byFace);
    });

    it('removes every face of a deleted wall', () => {
        expect(dropWallKeys({ ...byFace, 'wall:-1:left': 4 }, -1)).toEqual({ 'wall:-12:back': 2, 'room:satellit:0': 3 });
    });
});

describe('parseWallLayout', () => {
    afterEach(() => vi.restoreAllMocks());

    it('accepts a valid layout', () => {
        const layout = { hangingHeight: 1.5, guides: { 'wall:1:front': [{ axis: 'v', value: 2 }] } };
        expect(parseWallLayout(layout)).toEqual(layout);
    });

    it('keeps a valid hanging height when the guides are broken', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(parseWallLayout({ hangingHeight: 1.3, guides: { a: [{ axis: 'x', value: 1 }] } }))
            .toEqual({ hangingHeight: 1.3, guides: {} });
    });

    it('falls back to the defaults for garbage', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(parseWallLayout('nope')).toEqual({ hangingHeight: DEFAULT_HANGING_HEIGHT, guides: {} });
        expect(parseWallLayout({ hangingHeight: 42 })).toEqual({ hangingHeight: DEFAULT_HANGING_HEIGHT, guides: {} });
    });
});
