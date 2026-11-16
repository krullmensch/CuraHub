import { afterEach, describe, expect, it, vi } from 'vitest';

describe('resolveRenderQuality on phones', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('auto resolves to low on an iPhone', async () => {
        vi.stubGlobal('navigator', {
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
            maxTouchPoints: 5,
            hardwareConcurrency: 6,
        });
        const gl = {
            MAX_TEXTURE_SIZE: 1,
            RENDERER: 2,
            getParameter: (p: number) => (p === 1 ? 16384 : 'Apple GPU'),
            getExtension: () => null,
        };
        vi.stubGlobal('document', { createElement: () => ({ getContext: () => gl }) });
        const { resolveRenderQuality } = await import('./renderQuality');
        expect(resolveRenderQuality('auto')).toBe('low');
    });
});

describe('ambient occlusion per preset', () => {
    it('is on in high only', async () => {
        // Medium was planned too, but AO costs ~4 ms per frame (2026-11-16, test stack), over the 2 ms limit.
        const { RENDER_QUALITY_SETTINGS } = await import('./renderQuality');
        expect(RENDER_QUALITY_SETTINGS.low.ambientOcclusion).toBe(false);
        expect(RENDER_QUALITY_SETTINGS.medium.ambientOcclusion).toBe(false);
        expect(RENDER_QUALITY_SETTINGS.high.ambientOcclusion).toBe(true);
    });
});
