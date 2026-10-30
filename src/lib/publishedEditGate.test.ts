import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishedEditGate as gate } from './publishedEditGate';

beforeEach(() => gate.reset());

describe('publishedEditGate', () => {
  it('request opens once and keeps the first undoDepth', () => {
    gate.request(3);
    gate.request(5);
    expect(gate.getState()).toEqual({ phase: 'asking', undoDepth: 3 });
  });

  it('subscribers are notified once per phase change', () => {
    const fn = vi.fn();
    const off = gate.subscribe(fn);
    gate.request(1);
    gate.request(2);
    expect(fn).toHaveBeenCalledTimes(1);
    gate.beginResolve();
    expect(fn).toHaveBeenCalledTimes(2);
    gate.finish();
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    gate.request(1);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('request during resolving is a no-op', () => {
    gate.request(1);
    gate.beginResolve();
    gate.request(9);
    expect(gate.getState()).toEqual({ phase: 'resolving', undoDepth: 1 });
  });

  it('finish and reset return to idle; a later request opens again', () => {
    gate.request(1);
    gate.finish();
    expect(gate.getState().phase).toBe('idle');
    gate.request(2);
    expect(gate.getState()).toEqual({ phase: 'asking', undoDepth: 2 });
    gate.reset();
    expect(gate.getState().phase).toBe('idle');
    gate.request(4);
    expect(gate.getState().undoDepth).toBe(4);
  });

  it('cancelResolve goes resolving -> asking, keeps undoDepth and notifies once', () => {
    gate.request(3);
    gate.beginResolve();
    const fn = vi.fn();
    gate.subscribe(fn);
    gate.cancelResolve();
    expect(gate.getState()).toEqual({ phase: 'asking', undoDepth: 3 });
    expect(fn).toHaveBeenCalledTimes(1);
    gate.cancelResolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
