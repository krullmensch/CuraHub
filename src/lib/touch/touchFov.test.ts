import { describe, expect, it } from 'vitest';
import { touchFov, TOUCH_MIN_HFOV, TOUCH_MAX_VFOV } from './touchFov';

const hfov = (vfov: number, aspect: number) => (2 * Math.atan(Math.tan((vfov * Math.PI) / 360) * aspect) * 180) / Math.PI;

describe('touchFov', () => {
    it('portrait phone: much wider than the desktop 60°, capped vertically', () => {
        const v = touchFov(390 / 844);
        expect(v).toBe(TOUCH_MAX_VFOV);
        expect(hfov(v, 390 / 844)).toBeGreaterThan(55);
    });

    it('landscape phone keeps the desktop field of view (already wide enough)', () => {
        expect(touchFov(844 / 390)).toBe(60);
    });

    it('square-ish tablet gets at least the minimum horizontal view', () => {
        const v = touchFov(1);
        expect(hfov(v, 1)).toBeCloseTo(TOUCH_MIN_HFOV, 3);
        expect(v).toBeGreaterThan(60);
        expect(v).toBeLessThan(TOUCH_MAX_VFOV);
    });
});
