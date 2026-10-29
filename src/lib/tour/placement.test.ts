import { describe, expect, it } from 'vitest';
import { isOnScreen, popoverPosition, spotlightRect } from './placement';

const viewport = { width: 1280, height: 800 };
const popover = { width: 320, height: 160 };

describe('spotlightRect', () => {
  it('grows the target by the padding on every side', () => {
    expect(spotlightRect({ x: 100, y: 100, width: 50, height: 20 })).toEqual({ x: 92, y: 92, width: 66, height: 36 });
  });
});

describe('popoverPosition', () => {
  const header = { x: 600, y: 100, width: 80, height: 30 };

  it('uses the preferred side when it fits, centred on the target', () => {
    expect(popoverPosition(header, popover, viewport, 'bottom')).toEqual({ mode: 'anchored', side: 'bottom', x: 480, y: 142 });
  });
  it('flips to the opposite side when the preferred one has no room', () => {
    expect(popoverPosition(header, popover, viewport, 'top')).toMatchObject({ mode: 'anchored', side: 'bottom' });
  });
  it('clamps along the cross axis into the viewport margin', () => {
    expect(popoverPosition({ x: 20, y: 300, width: 40, height: 40 }, popover, viewport, 'bottom'))
      .toMatchObject({ mode: 'anchored', side: 'bottom', x: 16 });
  });
  it('flips from right to left at the right edge', () => {
    expect(popoverPosition({ x: 1200, y: 300, width: 60, height: 200 }, popover, viewport, 'right'))
      .toMatchObject({ mode: 'anchored', side: 'left', x: 1200 - 12 - 320 });
  });
  it('centres when no side fits, as a position so only the transform changes between steps', () => {
    expect(popoverPosition({ x: 0, y: 0, width: 1280, height: 800 }, popover, viewport, 'bottom')).toEqual({ mode: 'centered', x: 480, y: 320 });
  });
  it('centres without a target', () => {
    expect(popoverPosition(null, popover, viewport, 'bottom')).toEqual({ mode: 'centered', x: 480, y: 320 });
  });
  it('uses a bottom sheet below 640 px, with or without a target', () => {
    const narrow = { width: 639, height: 800 };
    expect(popoverPosition(header, popover, narrow, 'bottom')).toEqual({ mode: 'sheet' });
    expect(popoverPosition(null, popover, narrow, 'bottom')).toEqual({ mode: 'sheet' });
  });
});

describe('isOnScreen', () => {
  it('accepts a target that overlaps the viewport', () => {
    expect(isOnScreen({ x: -100, y: 10, width: 150, height: 20 }, viewport)).toBe(true);
  });
  it('rejects a target pushed out of the viewport (collapsed sidebar)', () => {
    expect(isOnScreen({ x: -272, y: 24, width: 256, height: 700 }, viewport)).toBe(false);
    expect(isOnScreen({ x: 1290, y: 24, width: 288, height: 700 }, viewport)).toBe(false);
  });
});
