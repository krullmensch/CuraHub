import { describe, expect, it } from 'vitest';
import { FLIP_PAGE_HEIGHT, flipPageSize, isNearPage, pageRenderScale, needsRerender } from './flipPages';

describe('flipPageSize', () => {
  it('A4 portrait becomes 1273 x 1800', () => {
    expect(flipPageSize(595.28, 841.89)).toEqual({ width: 1273, height: 1800 });
    expect(flipPageSize(595.276, 841.89)).toEqual({ width: 1273, height: 1800 });
  });
  it('keeps the ratio of a landscape page', () => {
    expect(flipPageSize(842, 595)).toEqual({ width: 2547, height: FLIP_PAGE_HEIGHT });
  });
  it('a square page is 1800 x 1800', () => {
    expect(flipPageSize(500, 500)).toEqual({ width: 1800, height: 1800 });
  });
  it.each([[0, 100], [100, 0], [NaN, 100], [100, Infinity], [-5, 10], [0, 0]])(
    'falls back to the A4 ratio for %s x %s',
    (w, h) => {
      expect(flipPageSize(w, h)).toEqual({ width: 1273, height: 1800 });
    },
  );
});

describe('isNearPage', () => {
  it('is true within the radius, both directions', () => {
    expect(isNearPage(6, 0)).toBe(true);
    expect(isNearPage(0, 6)).toBe(true);
    expect(isNearPage(7, 0)).toBe(false);
    expect(isNearPage(3, 3)).toBe(true);
  });
});

describe('pageRenderScale', () => {
  const base = { baseWidth: 595, baseHeight: 842 };
  it('renders at the displayed size times dpr', () => {
    const s = pageRenderScale({ ...base, boxWidth: 400, boxHeight: 565.7, dpr: 1 });
    expect(s).toBeCloseTo(400 / 595, 3);
    const s2 = pageRenderScale({ ...base, boxWidth: 400, boxHeight: 565.7, dpr: 2 });
    expect(s2).toBeCloseTo(2 * 400 / 595, 3);
  });
  it('caps dpr at 2', () => {
    const a = pageRenderScale({ ...base, boxWidth: 300, boxHeight: 424, dpr: 3 });
    const b = pageRenderScale({ ...base, boxWidth: 300, boxHeight: 424, dpr: 2 });
    expect(a).toBeCloseTo(b, 6);
  });
  it('covers the box when the page ratio differs (object-fit: cover)', () => {
    const s = pageRenderScale({ baseWidth: 842, baseHeight: 595, boxWidth: 400, boxHeight: 565, dpr: 1 });
    expect(s).toBeCloseTo(565 / 595, 3);
  });
  it('never exceeds 2048 px on the long side', () => {
    const s = pageRenderScale({ ...base, boxWidth: 1273, boxHeight: 1800, dpr: 2 });
    expect(842 * s).toBeLessThanOrEqual(2048.0001);
    expect(842 * s).toBeGreaterThan(2000);
  });
  it('falls back to 1 for invalid input', () => {
    expect(pageRenderScale({ baseWidth: 0, baseHeight: 0, boxWidth: 10, boxHeight: 10, dpr: 1 })).toBe(1);
    expect(pageRenderScale({ ...base, boxWidth: 0, boxHeight: 0, dpr: NaN })).toBe(1);
  });
});

describe('needsRerender', () => {
  it('renders when nothing was rendered yet', () => {
    expect(needsRerender(null, 400)).toBe(true);
  });
  it('only re-renders when the page grew by more than 20 %', () => {
    expect(needsRerender(400, 470)).toBe(false);
    expect(needsRerender(400, 490)).toBe(true);
    expect(needsRerender(400, 200)).toBe(false);
  });
});
