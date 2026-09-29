import { canReadBookPdf, publishedPlacementWhere, safeBookFile } from '../lib/bookAccess';

describe('canReadBookPdf', () => {
    const cases: [boolean, boolean, boolean, boolean][] = [
        // hasProjectAccess, publicReadable, inPublishedVersion → allowed
        [true, false, false, true],
        [true, true, true, true],
        [false, true, true, true],
        [false, true, false, false],
        [false, false, true, false],
        [false, false, false, false],
    ];
    it.each(cases)('access=%s readable=%s published=%s → %s', (hasProjectAccess, publicReadable, inPublishedVersion, allowed) => {
        expect(canReadBookPdf({ hasProjectAccess, publicReadable, inPublishedVersion })).toBe(allowed);
    });
});

describe('safeBookFile', () => {
    it('keeps plain PDF basenames and rejects everything else', () => {
        expect(safeBookFile('abc-katalog.pdf')).toBe('abc-katalog.pdf');
        expect(safeBookFile('../../etc/passwd')).toBeNull();
        expect(safeBookFile('sub/abc.pdf')).toBeNull();
        expect(safeBookFile('abc.webp')).toBeNull();
        expect(safeBookFile('')).toBeNull();
    });
});

describe('publishedPlacementWhere', () => {
    it('denies (null) when the asset has no project', () => {
        expect(publishedPlacementWhere(7, null)).toBeNull();
    });
    it('only counts published versions of the book\'s own project', () => {
        expect(publishedPlacementWhere(7, 3)).toEqual({
            artworkId: 7,
            version: { is_published: true, exhibition: { projectId: 3 } },
        });
    });
});
