import { allowedOrigins } from '../lib/corsOrigins';

describe('allowedOrigins', () => {
    it('prefers CORS_ORIGINS from the env', () =>
        expect(allowedOrigins({ CORS_ORIGINS: 'https://a.de, https://b.de' }, 'https://c.de')).toEqual(['https://a.de', 'https://b.de']));
    it('falls back to the public URL', () => expect(allowedOrigins({}, 'https://c.de')).toEqual(['https://c.de']));
    it('is empty without either (same-origin only)', () => expect(allowedOrigins({}, null)).toEqual([]));
});
