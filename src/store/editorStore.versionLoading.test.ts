import { describe, expect, it, vi } from 'vitest';

// The persist middleware writes to localStorage, which the node test environment lacks.
vi.hoisted(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  });
});
import { markListLoadFailed, useEditorStore } from './editorStore';

const status = () => useEditorStore.getState().versionContentStatus;

describe('versionContentStatus (editor loading overlay)', () => {
  it('is idle without a version', () => {
    expect(status()).toBe('idle');
  });

  it('loads from a version switch until instances, walls and figures are all set', () => {
    const s = useEditorStore.getState();
    s.setActiveVersion(7);
    expect(status()).toBe('loading');
    s.setLocalInstances([]);
    s.setLocalWalls([]);
    expect(status()).toBe('loading');
    s.setLocalScaleFigures([]);
    expect(status()).toBe('loaded');
  });

  it('fails when a list could not be fetched, and recovers when it loads after all', () => {
    const s = useEditorStore.getState();
    s.setActiveVersion(8);
    s.setLocalInstances([]);
    markListLoadFailed('walls', 8);
    expect(status()).toBe('failed');
    s.setLocalScaleFigures([]);
    s.setLocalWalls([]);
    expect(status()).toBe('loaded');
  });

  it('goes back to idle when the version is cleared', () => {
    useEditorStore.getState().setActiveVersion(null);
    expect(status()).toBe('idle');
  });
});
