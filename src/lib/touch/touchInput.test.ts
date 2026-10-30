import { afterEach, describe, expect, it, vi } from 'vitest';
import { installTouchInputGuards, syncLock, touchInput } from './touchInput';

describe('touchInput', () => {
    afterEach(() => {
        touchInput.reset();
        vi.unstubAllGlobals();
    });

    it('reset zeroes move and look', () => {
        touchInput.setMove({ x: 0.5, y: 1 });
        touchInput.setLook({ x: -1, y: 0 });
        touchInput.reset();
        expect(touchInput.move).toEqual({ x: 0, y: 0 });
        expect(touchInput.look).toEqual({ x: 0, y: 0 });
    });

    it('locked controls reset touch input', () => {
        touchInput.setMove({ x: 0, y: 1 });
        syncLock(true);
        expect(touchInput.move).toEqual({ x: 0, y: 0 });
        touchInput.setMove({ x: 0, y: 1 });
        syncLock(false);
        expect(touchInput.move).toEqual({ x: 0, y: 1 });
    });

    it('visibility hidden resets touch input', () => {
        const listeners = new Map<string, () => void>();
        const fakeDocument = {
            visibilityState: 'visible',
            addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
            removeEventListener: (type: string) => listeners.delete(type),
        };
        vi.stubGlobal('document', fakeDocument);
        vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
        const off = installTouchInputGuards();
        touchInput.setMove({ x: 0, y: 1 });
        fakeDocument.visibilityState = 'hidden';
        listeners.get('visibilitychange')?.();
        expect(touchInput.move).toEqual({ x: 0, y: 0 });
        off();
        expect(listeners.has('visibilitychange')).toBe(false);
    });
});
