import { describe, expect, it } from 'vitest';
import { detectArPlatform, sceneViewerIntent } from './launch';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

describe('detectArPlatform', () => {
  it('iPhone UA is ios', () => expect(detectArPlatform(IPHONE, 5)).toBe('ios'));
  it('iPadOS desktop UA with touch is ios', () => expect(detectArPlatform(MAC, 5)).toBe('ios'));
  it('Macintosh without touch is desktop', () => expect(detectArPlatform(MAC, 0)).toBe('desktop'));
  it('Android UA is android', () => expect(detectArPlatform(ANDROID, 5)).toBe('android'));
});

describe('sceneViewerIntent', () => {
  const intent = sceneViewerIntent('https://x.de/api/public/ar/a.glb?v=1', 'Licht & Landschaft', 'https://x.de/exhibition/a');
  it('has the Scene Viewer shape', () => {
    expect(intent.startsWith('intent://arvr.google.com/scene-viewer/1.2?file=https%3A%2F%2F')).toBe(true);
    expect(intent).toContain('mode=ar_preferred');
    expect(intent).toContain('title=Licht%20%26%20Landschaft');
    expect(intent).toContain('S.browser_fallback_url=https%3A%2F%2Fx.de%2Fexhibition%2Fa');
    expect(intent.endsWith(';end;')).toBe(true);
  });
});
