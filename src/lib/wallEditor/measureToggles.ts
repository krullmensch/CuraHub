import { z } from 'zod';

/** Which wall measures are shown — in the 2D wall editor and on the walls in 3D. Persisted per browser. */
export interface MeasureToggles {
    showHangingLine: boolean;
    showFloorDistances: boolean;
    showGaps: boolean;
}

export type MeasureToggleKey = keyof MeasureToggles;

export const MEASURE_TOGGLES_KEY = 'curahub-wall-measures';

export const DEFAULT_MEASURE_TOGGLES: MeasureToggles = {
    showHangingLine: true,
    showFloorDistances: false,
    showGaps: false,
};

// Each field falls back on its own, so one bad value does not reset the others.
const measureTogglesSchema = z.object({
    showHangingLine: z.boolean().catch(DEFAULT_MEASURE_TOGGLES.showHangingLine),
    showFloorDistances: z.boolean().catch(DEFAULT_MEASURE_TOGGLES.showFloorDistances),
    showGaps: z.boolean().catch(DEFAULT_MEASURE_TOGGLES.showGaps),
});

export function readMeasureToggles(storage: Pick<Storage, 'getItem'> | null): MeasureToggles {
    if (!storage) return { ...DEFAULT_MEASURE_TOGGLES };
    try {
        const raw = storage.getItem(MEASURE_TOGGLES_KEY);
        if (!raw) return { ...DEFAULT_MEASURE_TOGGLES };
        const parsed = measureTogglesSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : { ...DEFAULT_MEASURE_TOGGLES };
    } catch {
        return { ...DEFAULT_MEASURE_TOGGLES };
    }
}

export function writeMeasureToggles(storage: Pick<Storage, 'setItem'> | null, toggles: MeasureToggles): void {
    if (!storage) return;
    try {
        storage.setItem(MEASURE_TOGGLES_KEY, JSON.stringify(toggles));
    } catch {
        // storage full or blocked — keep the toggles for this session only
    }
}

/** window.localStorage, or null where it is unavailable (tests, blocked site data). */
export function browserStorage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}
