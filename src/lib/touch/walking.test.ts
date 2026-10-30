import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWalking, setTouchWalking, subscribeWalking } from './walking';

describe('walking state', () => {
    afterEach(() => setTouchWalking(false));

    it('touch walking switches the state and notifies', () => {
        const fn = vi.fn();
        const off = subscribeWalking(fn);
        setTouchWalking(true);
        expect(isWalking()).toBe(true);
        expect(fn).toHaveBeenCalledTimes(1);
        setTouchWalking(false);
        expect(isWalking()).toBe(false);
        expect(fn).toHaveBeenCalledTimes(2);
        off();
    });

    it('setting the same value does not notify', () => {
        const fn = vi.fn();
        const off = subscribeWalking(fn);
        setTouchWalking(false);
        expect(fn).not.toHaveBeenCalled();
        off();
    });
});
