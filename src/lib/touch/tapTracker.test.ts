import { describe, expect, it } from 'vitest';
import { TapTracker } from './tapTracker';

describe('TapTracker', () => {
    it('short still touch is a tap', () => {
        const t = new TapTracker();
        t.down(1, { x: 50, y: 50, t: 0 });
        expect(t.up(1, { x: 53, y: 52, t: 150 })).toEqual({ x: 53, y: 52 });
    });

    it('drag is not a tap', () => {
        const t = new TapTracker();
        t.down(1, { x: 50, y: 50, t: 0 });
        expect(t.up(1, { x: 70, y: 50, t: 150 })).toBeNull();
    });

    it('long press is not a tap', () => {
        const t = new TapTracker();
        t.down(1, { x: 50, y: 50, t: 0 });
        expect(t.up(1, { x: 50, y: 50, t: 400 })).toBeNull();
    });

    it('isTap ignores a pointer that started on a stick', () => {
        const t = new TapTracker();
        t.down(1, { x: 50, y: 50, t: 0 }, true);
        expect(t.up(1, { x: 50, y: 50, t: 100 })).toBeNull();
    });

    it('two simultaneous canvas pointers give no tap', () => {
        const t = new TapTracker();
        t.down(1, { x: 50, y: 50, t: 0 });
        t.down(2, { x: 200, y: 50, t: 20 });
        expect(t.up(1, { x: 50, y: 50, t: 100 })).toBeNull();
        expect(t.up(2, { x: 200, y: 50, t: 120 })).toBeNull();
    });

    it('cancel forgets the pointer', () => {
        const t = new TapTracker();
        t.down(1, { x: 50, y: 50, t: 0 });
        t.cancel(1);
        expect(t.up(1, { x: 50, y: 50, t: 100 })).toBeNull();
    });
});
