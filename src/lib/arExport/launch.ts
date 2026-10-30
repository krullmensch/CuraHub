export type ArPlatform = 'ios' | 'android' | 'desktop';

/** iPadOS reports a Macintosh UA; touch points tell it from a real Mac. */
export function detectArPlatform(ua: string, maxTouchPoints: number): ArPlatform {
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** Google Scene Viewer intent; without ARCore it falls back to a plain 3D view. */
export function sceneViewerIntent(glbAbsUrl: string, title: string, fallbackUrl: string): string {
  return (
    `intent://arvr.google.com/scene-viewer/1.2?file=${encodeURIComponent(glbAbsUrl)}` +
    `&mode=ar_preferred&title=${encodeURIComponent(title)}` +
    '#Intent;scheme=https;package=com.google.android.googlequicksearchbox;' +
    `action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end;`
  );
}
