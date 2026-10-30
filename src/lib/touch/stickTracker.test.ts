import { describe, expect, it } from 'vitest';
import { StickTracker } from './stickTracker';

const CENTRE = { x: 100, y: 100 };

describe('StickTracker', () => {
    it('down + move gives the stick value', () => {
        const t = new StickTracker(60);
        expect(t.pointerDown(1, 100, 100, CENTRE)).toBe(true);
        t.pointerMove(1, 160, 100);
        expect(t.value().x).toBeCloseTo(1);
        expect(t.value().y).toBeCloseTo(0);
    });

    it('a second pointer on the same stick is ignored', () => {
        const t = new StickTracker(60);
        t.pointerDown(1, 100, 100, CENTRE);
        expect(t.pointerDown(2, 100, 40, CENTRE)).toBe(false);
        t.pointerMove(2, 100, 40);
        expect(t.value()).toEqual({ x: 0, y: 0 });
    });

    it('up resets to zero and frees the stick', () => {
        const t = new StickTracker(60);
        t.pointerDown(1, 100, 100, CENTRE);
        t.pointerMove(1, 100, 40);
        t.pointerUp(1);
        expect(t.value()).toEqual({ x: 0, y: 0 });
        expect(t.pointerDown(2, 100, 100, CENTRE)).toBe(true);
    });

    it('move of an unknown pointer is ignored', () => {
        const t = new StickTracker(60);
        t.pointerDown(1, 100, 100, CENTRE);
        t.pointerMove(9, 160, 100);
        expect(t.value()).toEqual({ x: 0, y: 0 });
    });

    it('up of another pointer keeps the stick', () => {
        const t = new StickTracker(60);
        t.pointerDown(1, 100, 100, CENTRE);
        t.pointerMove(1, 160, 100);
        t.pointerUp(9);
        expect(t.value().x).toBeCloseTo(1);
    });

    it('keeps steering when the finger leaves the stick', () => {
        const t = new StickTracker(60);
        t.pointerDown(1, 100, 100, CENTRE);
        t.pointerMove(1, 400, 100);
        expect(t.value().x).toBeCloseTo(1);
    });
});
