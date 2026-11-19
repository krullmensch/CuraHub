import type { ArtworkLoadProgress } from '../artworkLoadProgress';

export interface SceneLoadingState {
  label: string;
  /** 0…1 for the bar. */
  fraction: number;
  /** „45 %" or „3 / 12". */
  detail: string;
}

/**
 * What the editor's bottom loading pill shows (null = hidden). Models and textures going
 * through three's LoadingManager come first; afterwards the artworks' first picture tiers.
 */
export function sceneLoadingState(s: {
  modelsActive: boolean;
  /** 0…100 */
  modelsPercent: number;
  artworks: ArtworkLoadProgress;
}): SceneLoadingState | null {
  if (s.modelsActive) {
    const percent = Math.min(100, Math.max(0, Math.round(s.modelsPercent)));
    return { label: 'Szene lädt', fraction: percent / 100, detail: `${percent} %` };
  }
  const { settled, total } = s.artworks;
  if (total > 0 && settled < total) {
    return { label: 'Bilder werden geladen', fraction: settled / total, detail: `${settled} / ${total}` };
  }
  return null;
}
