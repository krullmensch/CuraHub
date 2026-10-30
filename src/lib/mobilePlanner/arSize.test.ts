import { describe, expect, it } from 'vitest';
import { assetSizeCm, scaleForSizeCm, sizeForWidthCm, sizeForHeightCm } from './arSize';
import type { ArtworkInstanceData } from '@/store/editorStore';

// 1000 × 800 px at 72 dpi → 35.28 × 28.22 cm at scale 1
const noCm: ArtworkInstanceData = {
    id: 5, artwork: { width: null, height: null, asset: { path: '', width: 1000, height: 800, dpi: 72 } },
    position_x: 0, position_y: 0, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0, scale_x: 2, scale_y: 2, scale_z: 1,
};

describe('assetSizeCm', () => {
    it('uses the cm values when present', () => {
        expect(assetSizeCm({ width: 40, height: 50, asset: { width: 1, height: 1, dpi: 72 } })).toEqual({ w: 40, h: 50 });
    });
    it('falls back to pixels and dpi like the editor', () => {
        const s = assetSizeCm({ width: null, height: null, asset: { width: 1000, height: 800, dpi: 72 } });
        expect(s.w).toBeCloseTo(35.28, 1);
        expect(s.h).toBeCloseTo(28.22, 1);
    });
});

describe('scaleForSizeCm', () => {
    it('gives the instance scale for a target picture width (aspect kept)', () => {
        const s = scaleForSizeCm(noCm, { w: 70.56, h: 56.44 });
        expect(s.scale_x).toBeCloseTo(2, 2);
        expect(s.scale_y).toBeCloseTo(2, 2);
    });
});

describe('sizeForWidthCm / sizeForHeightCm', () => {
    it('keeps the aspect ratio', () => {
        expect(sizeForWidthCm({ w: 40, h: 50 }, 80)).toEqual({ w: 80, h: 100 });
        expect(sizeForHeightCm({ w: 40, h: 50 }, 25)).toEqual({ w: 20, h: 25 });
    });
    it('ignores non-positive input', () => {
        expect(sizeForWidthCm({ w: 40, h: 50 }, 0)).toEqual({ w: 40, h: 50 });
        expect(sizeForHeightCm({ w: 40, h: 50 }, -3)).toEqual({ w: 40, h: 50 });
    });
});
