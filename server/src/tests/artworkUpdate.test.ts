import { artworkUpdateSchema } from '../routes/artworks';

describe('artwork update', () => {
    it('accepts a book thickness between 0.3 and 8 cm, or null for automatic', () => {
        expect(artworkUpdateSchema.parse({ depth: 1.4 }).depth).toBe(1.4);
        expect(artworkUpdateSchema.parse({ depth: null }).depth).toBeNull();
        expect(() => artworkUpdateSchema.parse({ depth: 0.1 })).toThrow();
        expect(() => artworkUpdateSchema.parse({ depth: 9 })).toThrow();
    });
    it('accepts the public-viewer switch as a boolean only', () => {
        expect(artworkUpdateSchema.parse({ publicReadable: true }).publicReadable).toBe(true);
        expect(() => artworkUpdateSchema.parse({ publicReadable: 'ja' })).toThrow();
    });
    it('accepts a real height in cm, or null for the capture\'s own scale', () => {
        expect(artworkUpdateSchema.parse({ height: 140 }).height).toBe(140);
        expect(artworkUpdateSchema.parse({ height: null }).height).toBeNull();
        expect(() => artworkUpdateSchema.parse({ height: 0 })).toThrow();
    });
    it('keeps the existing fields', () => {
        expect(artworkUpdateSchema.parse({ title: 'Katalog', artist: 'A. B.', year: '2024' })).toMatchObject({ title: 'Katalog' });
    });
});
