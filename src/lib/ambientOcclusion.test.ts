import { describe, expect, it } from 'vitest';
import { AO_DEFAULTS, readAmbientOcclusionOverride, shouldRunAmbientOcclusion } from './ambientOcclusion';

const base = {
    qualityEnabled: true,
    webgpu: true,
    override: null,
    wallEditorOpen: false,
    exportMode: false,
    mobilePlanner: false,
};

describe('shouldRunAmbientOcclusion', () => {
    it('on for medium/high on WebGPU', () => {
        expect(shouldRunAmbientOcclusion(base)).toBe(true);
    });

    it('off for low', () => {
        expect(shouldRunAmbientOcclusion({ ...base, qualityEnabled: false })).toBe(false);
    });

    it('never on WebGL, even with ?ao=1', () => {
        expect(shouldRunAmbientOcclusion({ ...base, webgpu: false, override: true })).toBe(false);
    });

    it('override wins over the preset', () => {
        expect(shouldRunAmbientOcclusion({ ...base, qualityEnabled: false, override: true })).toBe(true);
        expect(shouldRunAmbientOcclusion({ ...base, qualityEnabled: true, override: false })).toBe(false);
    });

    it('off while the wall editor is open', () => {
        expect(shouldRunAmbientOcclusion({ ...base, override: true, wallEditorOpen: true })).toBe(false);
    });

    it('off on the AR export page', () => {
        expect(shouldRunAmbientOcclusion({ ...base, override: true, exportMode: true })).toBe(false);
    });

    it('off in the mobile planner', () => {
        expect(shouldRunAmbientOcclusion({ ...base, override: true, mobilePlanner: true })).toBe(false);
    });
});

describe('readAmbientOcclusionOverride', () => {
    it('reads the URL override', () => {
        expect(readAmbientOcclusionOverride('?ao=1&aoRadius=1.2')).toEqual({
            enabled: true,
            options: { ...AO_DEFAULTS, radius: 1.2 },
        });
        expect(readAmbientOcclusionOverride('?ao=0').enabled).toBe(false);
        expect(readAmbientOcclusionOverride('')).toEqual({ enabled: null, options: AO_DEFAULTS });
    });

    it('clamps scale and ignores invalid numbers', () => {
        const { options } = readAmbientOcclusionOverride('?aoScale=5&aoSamples=abc');
        expect(options.resolutionScale).toBe(1);
        expect(options.samples).toBe(16);
    });

    it('uses the values tuned on the test stack', () => {
        // Radius 0.6 (spec start value) left grainy halos on the ceiling around the trusses.
        expect(AO_DEFAULTS).toEqual({ radius: 0.3, strength: 1, resolutionScale: 0.5, samples: 16 });
    });
});
