import { describe, expect, it } from 'vitest';
import { isTouchViewer } from './touchMode';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

describe('isTouchViewer', () => {
    it('phone', () => {
        expect(isTouchViewer({ coarse: true, fine: false, maxTouchPoints: 5, ua: IPHONE })).toBe(true);
    });

    it('Android phone', () => {
        expect(isTouchViewer({ coarse: true, fine: false, maxTouchPoints: 5, ua: ANDROID })).toBe(true);
    });

    it('iPadOS desktop UA with touch', () => {
        expect(isTouchViewer({ coarse: true, fine: false, maxTouchPoints: 5, ua: MAC })).toBe(true);
        // iPadOS can report a fine pointer when a trackpad was ever connected; the Mac UA with touch points still wins
        expect(isTouchViewer({ coarse: false, fine: true, maxTouchPoints: 5, ua: MAC })).toBe(true);
    });

    it('desktop', () => {
        expect(isTouchViewer({ coarse: false, fine: true, maxTouchPoints: 0, ua: MAC })).toBe(false);
    });

    it('touch laptop keeps the desktop controls', () => {
        expect(isTouchViewer({ coarse: true, fine: true, maxTouchPoints: 10, ua: WINDOWS })).toBe(false);
    });
});
