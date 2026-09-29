import { describe, expect, test } from 'vitest';
import {
    DEFAULT_MEASURE_TOGGLES,
    MEASURE_TOGGLES_KEY,
    readMeasureToggles,
    writeMeasureToggles,
} from './measureToggles';

const fakeStorage = (initial: Record<string, string> = {}) => {
    const data: Record<string, string> = { ...initial };
    return {
        data,
        getItem: (key: string) => data[key] ?? null,
        setItem: (key: string, value: string) => { data[key] = value; },
    };
};

describe('readMeasureToggles', () => {
    test('defaults without storage', () => {
        expect(readMeasureToggles(null)).toEqual(DEFAULT_MEASURE_TOGGLES);
    });

    test('defaults when nothing is stored', () => {
        expect(readMeasureToggles(fakeStorage())).toEqual(DEFAULT_MEASURE_TOGGLES);
    });

    test('defaults for broken JSON', () => {
        expect(readMeasureToggles(fakeStorage({ [MEASURE_TOGGLES_KEY]: '{nope' }))).toEqual(DEFAULT_MEASURE_TOGGLES);
    });

    test('defaults for a non-object', () => {
        expect(readMeasureToggles(fakeStorage({ [MEASURE_TOGGLES_KEY]: '42' }))).toEqual(DEFAULT_MEASURE_TOGGLES);
    });

    test('keeps valid fields and defaults the rest', () => {
        const storage = fakeStorage({ [MEASURE_TOGGLES_KEY]: JSON.stringify({ showGaps: true, showFloorDistances: 'yes' }) });
        expect(readMeasureToggles(storage)).toEqual({ showHangingLine: true, showFloorDistances: false, showGaps: true });
    });

    test('defaults when getItem throws', () => {
        const storage = { getItem: () => { throw new Error('blocked'); } };
        expect(readMeasureToggles(storage)).toEqual(DEFAULT_MEASURE_TOGGLES);
    });
});

describe('writeMeasureToggles', () => {
    test('round trip', () => {
        const storage = fakeStorage();
        const toggles = { showHangingLine: false, showFloorDistances: true, showGaps: true };
        writeMeasureToggles(storage, toggles);
        expect(readMeasureToggles(storage)).toEqual(toggles);
    });

    test('ignores a throwing storage', () => {
        const storage = { setItem: () => { throw new Error('quota'); } };
        expect(() => writeMeasureToggles(storage, DEFAULT_MEASURE_TOGGLES)).not.toThrow();
    });

    test('ignores missing storage', () => {
        expect(() => writeMeasureToggles(null, DEFAULT_MEASURE_TOGGLES)).not.toThrow();
    });
});
