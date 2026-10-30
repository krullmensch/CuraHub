import { describe, expect, it } from 'vitest';
import { ArRequests } from './arRequest';

describe('ArRequests', () => {
    it('builder ignores a superseded request', () => {
        const r = new ArRequests();
        const a = r.start();
        const b = r.start();
        expect(r.isCurrent(a)).toBe(false);
        expect(r.isCurrent(b)).toBe(true);
    });

    it('cancel makes the current request stale', () => {
        const r = new ArRequests();
        const a = r.start();
        r.cancel();
        expect(r.isCurrent(a)).toBe(false);
    });
});
