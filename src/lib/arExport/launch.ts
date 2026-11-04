export type ArPlatform = 'ios' | 'android' | 'desktop';

/** iPadOS reports a Macintosh UA; touch points tell it from a real Mac. */
export function detectArPlatform(ua: string, maxTouchPoints: number): ArPlatform {
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
