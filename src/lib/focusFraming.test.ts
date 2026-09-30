import { describe, expect, it } from 'vitest';
import { boundsFocus, focusDistance } from './focusFraming';

const rad = (d: number) => (d * Math.PI) / 180;

describe('focusDistance', () => {
  it('fits a sphere into the vertical fov on a wide viewport', () => {
    const expected = (1 / Math.sin(rad(25))) * 1.25;
    expect(focusDistance(1, 50, 1.5)).toBeCloseTo(expected, 6);
  });

  it('uses the horizontal fov on a narrow viewport', () => {
    const hHalf = Math.atan(Math.tan(rad(25)) * 0.5);
    expect(focusDistance(1, 50, 0.5)).toBeCloseTo((1 / Math.sin(hHalf)) * 1.25, 6);
    expect(focusDistance(1, 50, 0.5)).toBeGreaterThan(focusDistance(1, 50, 1.5));
  });

  it('honours margin and clamps tiny objects to the minimum', () => {
    expect(focusDistance(1, 50, 1.5, 1)).toBeCloseTo(1 / Math.sin(rad(25)), 6);
    expect(focusDistance(0.01, 60, 1.5)).toBe(1.2);
    expect(focusDistance(0.01, 60, 1.5, 1.25, 2)).toBe(2);
  });

  it('falls back to the minimum on invalid input', () => {
    expect(focusDistance(NaN, 60, 1)).toBe(1.2);
    expect(focusDistance(1, 0, 1)).toBe(1.2);
    expect(focusDistance(1, 60, 0)).toBe(1.2);
  });
});

describe('boundsFocus', () => {
  it('returns centre and half diagonal', () => {
    const { center, radius } = boundsFocus({ min: [0, 0, 0], max: [2, 4, 4] });
    expect(center).toEqual([1, 2, 2]);
    expect(radius).toBeCloseTo(3, 6);
  });

  it('handles a degenerate point box', () => {
    expect(boundsFocus({ min: [1, 2, 3], max: [1, 2, 3] })).toEqual({ center: [1, 2, 3], radius: 0 });
  });

  it('handles an empty (inverted / infinite) box', () => {
    const r = boundsFocus({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    expect(r).toEqual({ center: [0, 0, 0], radius: 0 });
  });
});
