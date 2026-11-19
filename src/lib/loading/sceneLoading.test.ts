import { describe, expect, it } from 'vitest';
import { sceneLoadingState } from './sceneLoading';

const done = { settled: 4, total: 4 };

describe('sceneLoadingState', () => {
  it('is hidden when nothing loads', () => {
    expect(sceneLoadingState({ modelsActive: false, modelsPercent: 100, artworks: done })).toBeNull();
    expect(sceneLoadingState({ modelsActive: false, modelsPercent: 0, artworks: { settled: 0, total: 0 } })).toBeNull();
  });

  it('shows models first', () => {
    expect(sceneLoadingState({ modelsActive: true, modelsPercent: 45, artworks: { settled: 0, total: 4 } }))
      .toEqual({ label: 'Szene lädt', fraction: 0.45, detail: '45 %' });
  });

  it('then counts artworks', () => {
    expect(sceneLoadingState({ modelsActive: false, modelsPercent: 100, artworks: { settled: 1, total: 4 } }))
      .toEqual({ label: 'Bilder werden geladen', fraction: 0.25, detail: '1 / 4' });
  });
});
