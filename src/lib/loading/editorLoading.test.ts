import { describe, expect, it } from 'vitest';
import { editorLoadingLabel } from './editorLoading';

const base = { rendererReady: true, versionContentStatus: 'loaded' as const, firstPersonPending: false };

describe('editorLoadingLabel', () => {
  it('is null once everything is ready', () => {
    expect(editorLoadingLabel(base)).toBeNull();
    expect(editorLoadingLabel({ ...base, versionContentStatus: 'idle' })).toBeNull();
    // A failed list is reported by a toast, not by an endless overlay.
    expect(editorLoadingLabel({ ...base, versionContentStatus: 'failed' })).toBeNull();
  });

  it('names the first thing still loading', () => {
    expect(editorLoadingLabel({ ...base, rendererReady: false, versionContentStatus: 'loading' })).toBe('3D-Ansicht wird vorbereitet …');
    expect(editorLoadingLabel({ ...base, versionContentStatus: 'loading', firstPersonPending: true })).toBe('Ausstellung wird geladen …');
    expect(editorLoadingLabel({ ...base, firstPersonPending: true })).toBe('Ego-Perspektive wird geladen …');
  });
});
