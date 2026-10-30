import { describe, expect, it } from 'vitest';
import { arSourceFromAsset, assetSearch, type PlannerAsset } from './assetSearch';

const a = (id: number, type: string, filename: string, title?: string): PlannerAsset => ({
    id, type, filename, path: `/uploads/${filename}`, width: 1000, height: 800, dpi: 72, thumbnailPath: null,
    artwork: title ? { id: id * 10, title, artist: null, year: null, width: 40, height: 32 } : null,
});

describe('assetSearch', () => {
    const list = [a(1, 'image', 'izmir.webp', 'Izmir am Morgen'), a(2, 'video', 'clip.mp4'), a(3, 'model3d', 'stuhl.glb'), a(4, 'book', 'kat.pdf')];

    it('only pictures', () => expect(assetSearch(list, '').map((x) => x.id)).toEqual([1]));
    it('searches title and file name, case-insensitive', () => {
        expect(assetSearch(list, 'MORGEN').map((x) => x.id)).toEqual([1]);
        expect(assetSearch(list, 'clip').map((x) => x.id)).toEqual([]);
    });
});

describe('arSourceFromAsset', () => {
    it('maps the asset and its artwork for the AR instance', () => {
        const src = arSourceFromAsset(a(1, 'image', 'izmir.webp', 'Izmir'));
        expect(src.assetId).toBe(1);
        expect(src.artworkId).toBe(10);
        expect(src.artwork).toMatchObject({ title: 'Izmir', width: 40, height: 32, asset: { id: 1, path: '/uploads/izmir.webp', type: 'image' } });
    });

    it('an asset without artwork has no size', () => {
        expect(arSourceFromAsset(a(2, 'video', 'clip.mp4')).artwork.width).toBeNull();
    });
});
