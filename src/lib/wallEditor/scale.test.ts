import { describe, expect, it } from 'vitest';
import {
    OPPOSITE_CORNER,
    clampScaleFactor,
    cornerPoint,
    cornerShift,
    fineFactor,
    handleScaleFactor,
    modalScaleFactor,
    snapFactorToCm,
} from './scale';

describe('cornerPoint', () => {
    const r = { x: 1, y: 2, w: 3, h: 4 };

    it('uses y up: north is the top edge', () => {
        expect(cornerPoint(r, 'nw')).toEqual({ x: 1, y: 6 });
        expect(cornerPoint(r, 'ne')).toEqual({ x: 4, y: 6 });
        expect(cornerPoint(r, 'sw')).toEqual({ x: 1, y: 2 });
        expect(cornerPoint(r, 'se')).toEqual({ x: 4, y: 2 });
    });

    it('pairs opposite corners', () => {
        expect(OPPOSITE_CORNER.nw).toBe('se');
        expect(OPPOSITE_CORNER.sw).toBe('ne');
    });
});

describe('cornerShift', () => {
    const before = { x: 1, y: 2, w: 3, h: 4 };
    const after = { x: 0.5, y: 1.5, w: 4, h: 5 };

    it('puts the fixed corner back where it was', () => {
        expect(cornerShift(before, after, 'sw')).toEqual({ dx: 0.5, dy: 0.5 });
        expect(cornerShift(before, after, 'ne')).toEqual({ dx: -0.5, dy: -0.5 });
    });
});

describe('modalScaleFactor', () => {
    it('is the distance to the pivot relative to the start', () => {
        expect(modalScaleFactor({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 2 })).toBeCloseTo(2);
        expect(modalScaleFactor({ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 1 })).toBeCloseTo(0.5);
    });

    it('stays at 1 when the gesture starts on the pivot', () => {
        expect(modalScaleFactor({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 5, y: 5 })).toBe(1);
    });
});

describe('handleScaleFactor', () => {
    it('follows the pointer along the diagonal', () => {
        expect(handleScaleFactor({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeCloseTo(2);
        expect(handleScaleFactor({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.5 })).toBeCloseTo(0.5);
    });

    it('ignores movement across the diagonal', () => {
        expect(handleScaleFactor({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1.5, y: 0.5 })).toBeCloseTo(1);
    });
});

describe('fineFactor', () => {
    it('keeps a tenth of the change', () => {
        expect(fineFactor(2)).toBeCloseTo(1.1);
        expect(fineFactor(0.5)).toBeCloseTo(0.95);
    });
});

describe('snapFactorToCm', () => {
    it('rounds the picture width to whole centimetres', () => {
        expect(0.6 * snapFactorToCm(1.1234, 0.6)).toBeCloseTo(0.67);
    });

    it('never goes below 1 cm', () => {
        expect(0.6 * snapFactorToCm(0.001, 0.6)).toBeCloseTo(0.01);
    });
});

describe('clampScaleFactor', () => {
    it('keeps the smallest picture edge at 1 cm', () => {
        expect(clampScaleFactor(0.001, [{ w: 0.5, h: 0.2 }])).toBeCloseTo(0.05);
        expect(clampScaleFactor(0.001, [{ w: 0.5, h: 0.2 }, { w: 0.1, h: 0.1 }])).toBeCloseTo(0.1);
    });

    it('leaves larger factors alone', () => {
        expect(clampScaleFactor(1.5, [{ w: 0.5, h: 0.2 }])).toBe(1.5);
    });

    it('never returns zero or less', () => {
        expect(clampScaleFactor(-2, [])).toBeGreaterThan(0);
    });
});
