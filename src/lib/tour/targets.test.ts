import { describe, expect, it } from 'vitest';
import { TOUR_STEPS } from './steps';

const sources = Object.values(
  import.meta.glob<string>('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }),
);

describe('tour targets', () => {
  it('reads the component sources', () => {
    expect(sources.length).toBeGreaterThan(50);
  });
  it('every tour target exists as a data-tour attribute', () => {
    const source = sources.join('\n');
    const missing = TOUR_STEPS.filter((s) => s.target && !source.includes(`data-tour="${s.target}"`)).map((s) => s.target);
    expect(missing).toEqual([]);
  });
});
