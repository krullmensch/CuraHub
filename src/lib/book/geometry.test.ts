import { describe, expect, it } from 'vitest';
import { autoThicknessCm, bookHitBox, bookSize, pedestalSize, PEDESTAL_HEIGHT } from './geometry';
import { artworkMinY, isFixedSizeMedium, isFloorAssetType } from '@/store/editorStore';

describe('autoThicknessCm', () => {
  it('counts 0.1 mm per sheet plus 4 mm of board', () => {
    expect(autoThicknessCm(200)).toBeCloseTo(1.4);
    expect(autoThicknessCm(201)).toBeCloseTo(1.41);
  });
  it('stays between 0.3 and 8 cm', () => {
    expect(autoThicknessCm(0)).toBeCloseTo(0.4);
    expect(autoThicknessCm(20000)).toBe(8);
  });
});

describe('bookSize', () => {
  it('uses the page size and the manual thickness', () => {
    expect(bookSize({ widthCm: 21, heightCm: 29.7, depthCm: 2, pageCount: 200 })).toEqual({ width: 0.21, length: 0.297, thickness: 0.02 });
  });
  it('falls back to the automatic thickness and to A4', () => {
    const size = bookSize({ widthCm: null, heightCm: undefined, depthCm: null, pageCount: 200 });
    expect(size.width).toBeCloseTo(0.21);
    expect(size.length).toBeCloseTo(0.297);
    expect(size.thickness).toBeCloseTo(0.014);
  });
});

describe('pedestalSize', () => {
  it('adds 10 cm per side, at least 40 × 40 cm, 1.20 m high', () => {
    expect(pedestalSize({ width: 0.21, length: 0.297, thickness: 0.014 })).toEqual({ width: 0.41, depth: 0.497, height: PEDESTAL_HEIGHT });
    expect(pedestalSize({ width: 0.1, length: 0.15, thickness: 0.01 })).toEqual({ width: 0.4, depth: 0.4, height: 1.2 });
  });
});

describe('bookHitBox', () => {
  it('is 1 cm larger than the book per side and at least 5 cm high', () => {
    expect(bookHitBox({ width: 0.2, length: 0.3, thickness: 0.014 })).toEqual({ min: [-0.11, 0, -0.16], max: [0.11, 0.05, 0.16] });
    expect(bookHitBox({ width: 0.2, length: 0.3, thickness: 0.08 }).max[1]).toBeCloseTo(0.08);
  });
});

describe('book medium', () => {
  it('stands on the floor and keeps its size', () => {
    expect(isFloorAssetType('book')).toBe(true);
    expect(isFixedSizeMedium('book')).toBe(true);
    expect(isFixedSizeMedium('monitor')).toBe(true);
    expect(isFixedSizeMedium('frame')).toBe(false);
    const inst = { medium: 'book' as const, scale_y: 1, artwork: { asset: { path: '', width: 1, height: 1, dpi: 72 } } };
    expect(artworkMinY(inst)).toBe(0);
  });
});
