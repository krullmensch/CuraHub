export type VersionContentStatus = 'idle' | 'loading' | 'loaded' | 'failed';

/** The overlay's text for the editor's loading phases (pure; first match wins). */
export function editorLoadingLabel(s: {
  rendererReady: boolean;
  versionContentStatus: VersionContentStatus;
  firstPersonPending: boolean;
}): string | null {
  if (!s.rendererReady) return '3D-Ansicht wird vorbereitet …';
  if (s.versionContentStatus === 'loading') return 'Ausstellung wird geladen …';
  if (s.firstPersonPending) return 'Ego-Perspektive wird geladen …';
  return null;
}
