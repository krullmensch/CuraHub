import { describe, expect, it } from 'vitest';
import { buildSpreads, spreadIndexOfPage, spreadLabel } from './spread';

describe('buildSpreads', () => {
  it('starts with the cover alone on the right, then pairs', () => {
    expect(buildSpreads(5, false)).toEqual([
      { left: null, right: 1 }, { left: 2, right: 3 }, { left: 4, right: 5 },
    ]);
  });
  it('ends with a single left page for an even page count', () => {
    expect(buildSpreads(4, false)).toEqual([
      { left: null, right: 1 }, { left: 2, right: 3 }, { left: 4, right: null },
    ]);
  });
  it('shows one page per view on narrow screens', () => {
    expect(buildSpreads(3, true)).toEqual([{ left: null, right: 1 }, { left: null, right: 2 }, { left: null, right: 3 }]);
  });
  it('handles one-page PDFs and zero pages', () => {
    expect(buildSpreads(1, false)).toEqual([{ left: null, right: 1 }]);
    expect(buildSpreads(0, false)).toEqual([]);
  });
});

describe('spread helpers', () => {
  const spreads = buildSpreads(212, false);
  it('finds the spread of a page', () => {
    expect(spreadIndexOfPage(spreads, 1)).toBe(0);
    expect(spreadIndexOfPage(spreads, 13)).toBe(6);
    expect(spreadIndexOfPage(spreads, 999)).toBe(spreads.length - 1);
  });
  it('labels spreads', () => {
    expect(spreadLabel(spreads[6], 212)).toBe('12–13 / 212');
    expect(spreadLabel(spreads[0], 212)).toBe('1 / 212');
  });
});
