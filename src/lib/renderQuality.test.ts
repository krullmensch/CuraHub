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
