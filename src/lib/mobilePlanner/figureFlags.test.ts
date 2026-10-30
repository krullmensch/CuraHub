import { describe, expect, it } from 'vitest';
import { scaleFigureFlags } from './figureFlags';

describe('scaleFigureFlags', () => {
    it('mobile planner still loads the figures (auto-sync waits for every list) but cannot edit them', () => {
        expect(scaleFigureFlags(true, false, true)).toEqual({ load: true, interactive: false });
    });
    it('desktop editor loads and edits', () => {
        expect(scaleFigureFlags(true, false, false)).toEqual({ load: true, interactive: true });
    });
    it('viewer gets its figures passed in', () => {
        expect(scaleFigureFlags(false, true, false)).toEqual({ load: false, interactive: false });
    });
});
