import { describe, expect, it } from 'vitest';
import { applyLook, isTap, LOOK_RATE, PITCH_LIMIT_DEG, stickVector } from './stick';

const DEG = Math.PI / 180;

describe('stickVector', () => {
    it('centre is zero', () => {
        expect(stickVector(0, 0, 60)).toEqual({ x: 0, y: 0 });
    });

    it('inside the dead zone is zero', () => {
        expect(stickVector(5, 0, 60)).toEqual({ x: 0, y: 0 });
    });

    it('full deflection to the right', () => {
        const v = stickVector(60, 0, 60);
        expect(v.x).toBeCloseTo(1);
        expect(v.y).toBeCloseTo(0);
    });

    it('up on screen is forward', () => {
        const v = stickVector(0, -60, 60);
        expect(v.x).toBeCloseTo(0);
        expect(v.y).toBeCloseTo(1);
    });

    it('clamps to the unit circle', () => {
        expect(Math.hypot(stickVector(120, 0, 60).x, stickVector(120, 0, 60).y)).toBeCloseTo(1);
    });

    it('diagonal at full deflection has length 1', () => {
        const v = stickVector(42.43, -42.43, 60);
        expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 2);
        expect(v.x).toBeCloseTo(v.y, 3);
    });

    it('starts at zero just outside the dead zone', () => {
        const v = stickVector(60 * 0.13, 0, 60);
        expect(v.x).toBeGreaterThan(0);
        expect(v.x).toBeLessThan(0.05);
    });
});

describe('applyLook', () => {
    it('full right deflection turns right at LOOK_RATE', () => {
        const r = applyLook(0, 0, { x: 1, y: 0 }, 1);
        expect(r.yaw).toBeCloseTo(-LOOK_RATE * DEG);
        expect(r.pitch).toBe(0);
    });

    it('clamps pitch', () => {
        expect(applyLook(0, 0, { x: 0, y: 1 }, 10).pitch).toBeCloseTo(PITCH_LIMIT_DEG * DEG);
        expect(applyLook(0, 0, { x: 0, y: -1 }, 10).pitch).toBeCloseTo(-PITCH_LIMIT_DEG * DEG);
    });

    it('no deflection keeps the view', () => {
        expect(applyLook(0.3, 0.1, { x: 0, y: 0 }, 0.016)).toEqual({ yaw: 0.3, pitch: 0.1 });
    });
});

describe('isTap', () => {
    it('short and still is a tap', () => {
        expect(isTap({ x: 0, y: 0, t: 0 }, { x: 3, y: 4, t: 200 })).toBe(true);
    });

    it('moved more than 10 px is not a tap', () => {
        expect(isTap({ x: 0, y: 0, t: 0 }, { x: 11, y: 0, t: 100 })).toBe(false);
    });

    it('held longer than 300 ms is not a tap', () => {
        expect(isTap({ x: 0, y: 0, t: 0 }, { x: 0, y: 0, t: 301 })).toBe(false);
    });
});
