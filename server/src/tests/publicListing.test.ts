import { toPublicListing } from '../lib/publicListing';

describe('toPublicListing', () => {
    const version = {
        id: 7,
        comment: 'Erste Fassung',
        published_at: new Date('2026-11-01T10:00:00Z'),
        exhibition: { id: 3, title: 'Licht', slug: 'licht' },
        creator: { email: 'mmuster@hsbi.de' },
        _count: { instances: 12 },
    };

    it('names the creator without the e-mail address', () => {
        const entry = toPublicListing(version);
        expect(entry.version.creator).toEqual({ name: 'mmuster' });
        expect(JSON.stringify(entry)).not.toContain('@');
    });

    it('keeps the listing fields', () =>
        expect(toPublicListing(version)).toEqual({
            exhibition: version.exhibition,
            version: { id: 7, comment: 'Erste Fassung', published_at: version.published_at, artworkCount: 12, creator: { name: 'mmuster' } },
        }));
});
