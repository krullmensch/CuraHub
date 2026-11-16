import { describe, expect, it } from 'vitest';
import {
    LEGACY_ROOM_LIGHT_RIG,
    WALL_NORMALS,
    roomLightRig,
    wallIrradiance,
    type RoomLightRig,
} from './roomLighting';

const values = (rig: RoomLightRig) => WALL_NORMALS.map((n) => wallIrradiance(rig, n));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('roomLighting', () => {
    it('legacy rig matches Scene/Satellit today', () => {
        expect(LEGACY_ROOM_LIGHT_RIG.rect).toEqual({
            ambient: 0.4,
            hemisphere: null,
            directional: [{ position: [-6, 6, -4], intensity: 0.3, color: '#f8f8ff' }],
            rectDown: 3.5,
            rectUp: 1.2,
        });
        expect(LEGACY_ROOM_LIGHT_RIG.noRect).toEqual({
            ambient: 0.4,
            hemisphere: { sky: '#fff5e0', ground: '#f4efe8', intensity: 1.7 },
            directional: [
                { position: [-6, 6, -4], intensity: 0.3, color: '#f8f8ff' },
                { position: [0, -10, 0], intensity: 1.2, color: '#fff5e0' },
            ],
            rectDown: 0,
            rectUp: 0,
        });
    });

    for (const rect of [true, false]) {
        const legacy = rect ? LEGACY_ROOM_LIGHT_RIG.rect : LEGACY_ROOM_LIGHT_RIG.noRect;
        describe(rect ? 'with area lights' : 'without area lights', () => {
            // Bounds in the rough estimate's terms. The values were tuned on screenshots (test stack,
            // 2026-11-15): the estimate over-weights the area lights, so on screen the room keeps
            // today's brightness although the estimate says +13 % (with area lights) / −11 % (without).
            it('mean wall irradiance stays within 15 % of today', () => {
                const ratio = mean(values(roomLightRig(rect))) / mean(values(legacy));
                expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(0.15);
            });

            it('wall directions spread 15–35 %', () => {
                const v = values(roomLightRig(rect));
                const m = mean(v);
                const spread = Math.max(...v.map((x) => Math.abs(x / m - 1)));
                expect(spread).toBeGreaterThanOrEqual(0.15);
                expect(spread).toBeLessThanOrEqual(0.35);
            });

            it('four wall directions are distinct', () => {
                const v = values(roomLightRig(rect));
                const m = mean(v);
                for (let i = 0; i < v.length; i++) {
                    for (let j = i + 1; j < v.length; j++) {
                        expect(Math.abs(v[i] - v[j])).toBeGreaterThanOrEqual(0.03 * m);
                    }
                }
            });

            it('key light comes from the window side', () => {
                // The strongest light that reaches the walls (the ceiling light from straight below doesn't).
                const key = roomLightRig(rect).directional
                    .filter((l) => l.position[0] !== 0 || l.position[2] !== 0)
                    .sort((a, b) => b.intensity - a.intensity)[0];
                expect(key.position[2]).toBeLessThan(0);
            });
        });
    }

    it('downward area light keeps frame calibration', () => {
        expect(roomLightRig(true).rectDown).toBe(3.5);
    });
});
