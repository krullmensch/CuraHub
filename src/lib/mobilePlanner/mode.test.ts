import { describe, expect, it } from 'vitest';
import { isMobilePlanner } from './mode';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';
const phone = { coarse: true, fine: false, maxTouchPoints: 5, ua: IPHONE, width: 390, height: 844 };

describe('isMobilePlanner', () => {
    it('phone portrait', () => expect(isMobilePlanner(phone, null)).toBe(true));
    it('phone landscape', () => expect(isMobilePlanner({ ...phone, width: 844, height: 390 }, null)).toBe(true));
    it('tablet keeps the full editor', () => {
        expect(isMobilePlanner({ coarse: true, fine: false, maxTouchPoints: 5, ua: MAC, width: 820, height: 1180 }, null)).toBe(false);
    });
    it('touch laptop keeps the full editor', () => {
        expect(isMobilePlanner({ coarse: true, fine: true, maxTouchPoints: 10, ua: WINDOWS, width: 1280, height: 560 }, null)).toBe(false);
    });
    it('override full wins on a phone', () => expect(isMobilePlanner(phone, 'full')).toBe(false));
    it('override mobile wins on a desktop', () => {
        expect(isMobilePlanner({ coarse: false, fine: true, maxTouchPoints: 0, ua: MAC, width: 1440, height: 900 }, 'mobile')).toBe(true);
    });
});
