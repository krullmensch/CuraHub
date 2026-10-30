import { NOINDEX_ROUTE_PATTERNS } from '../lib/apiNamespaces';

describe('NOINDEX_ROUTE_PATTERNS', () => {
    const noindex = (p: string) => NOINDEX_ROUTE_PATTERNS.some((re) => re.test(p));

    it('covers the AR export page', () => {
        expect(noindex('/ar-export/12')).toBe(true);
    });

    it('leaves the public viewer indexable', () => {
        expect(noindex('/exhibition/some-slug')).toBe(false);
    });
});
