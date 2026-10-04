import { describe, expect, it } from 'vitest';
import { ChangeSequence } from './changeSequence';

describe('ChangeSequence', () => {
  it('applies changes in order and skips ones seen already', () => {
    const seq = new ChangeSequence();
    expect(seq.enter(5, 3)).toBe('entered');
    expect(seq.accept(5, 4)).toBe('apply');
    expect(seq.accept(5, 4)).toBe('seen');
    expect(seq.accept(5, 2)).toBe('seen');
    expect(seq.accept(5, 5)).toBe('apply');
  });

  it('notices missed changes', () => {
    const seq = new ChangeSequence();
    seq.enter(5, 0);
    expect(seq.accept(5, 2)).toBe('missed');
    expect(seq.accept(5, 3)).toBe('apply');
  });

  it('tells a quiet reconnect from one that missed something', () => {
    const seq = new ChangeSequence();
    seq.enter(5, 4);
    expect(seq.enter(5, 4)).toBe('resumed');
    expect(seq.enter(5, 6)).toBe('missed');
    expect(seq.enter(6, 6)).toBe('entered');
  });

  it('starts counting at the first change of a version it was not told about', () => {
    const seq = new ChangeSequence();
    expect(seq.accept(7, 10)).toBe('apply');
    expect(seq.accept(7, 11)).toBe('apply');
  });
});
