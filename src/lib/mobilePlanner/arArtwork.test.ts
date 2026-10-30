import { describe, expect, it } from 'vitest';
import { arArtworkInstance, canOfferAr } from './arArtwork';
import { pictureSize } from '@/lib/wallEditor/footprint';
import type { ArtworkInstanceData } from '@/store/editorStore';

const artwork = { id: 4, title: 'Bild', width: 40, height: 50, asset: { id: 9, path: '/uploads/a.webp', width: 2000, height: 2500, dpi: 72, type: 'image' as const } };
const placed: ArtworkInstanceData = {
    id: 12, artworkId: 4, assetId: 9, wallId: 3, medium: 'frame', frameStyle: 'alu8-silber-matt', passepartoutWidth: 5,
    artwork,
    position_x: 3, position_y: 1.45, position_z: -2, rotation_x: 0, rotation_y: 1.2, rotation_z: 0,
    scale_x: 1.5, scale_y: 1.5, scale_z: 1,
};

describe('canOfferAr', () => {
    it('pictures only (videos have no frame and no real-size still)', () => {
        expect(canOfferAr('image')).toBe(true);
        for (const t of ['video', 'model3d', 'splat', 'book', undefined]) expect(canOfferAr(t)).toBe(false);
    });
});

describe('arArtworkInstance', () => {
    const frame = { frameStyle: 'aab102-aab-kirsche' as const, passepartout: { width: 8, placement: 'optical-center' as const } };

    it('a placed artwork keeps its hung size but sits at the origin', () => {
        const inst = arArtworkInstance(placed, frame);
        expect(inst.id).toBe(-1);
        expect(inst.wallId).toBeNull();
        expect([inst.position_x, inst.position_y, inst.position_z]).toEqual([0, 0, 0]);
        expect([inst.rotation_x, inst.rotation_y, inst.rotation_z]).toEqual([0, 0, 0]);
        expect([inst.scale_x, inst.scale_y, inst.scale_z]).toEqual([1.5, 1.5, 1]);
        expect(inst.frameStyle).toBe('aab102-aab-kirsche');
        expect(inst.passepartoutWidth).toBe(8);
        expect(inst.passepartoutPlacement).toBe('optical-center');
        expect(inst.medium).toBe('frame');
        expect(inst.artwork).toBe(artwork);
    });

    it('an asset goes at real size', () => {
        const inst = arArtworkInstance({ artworkId: 4, assetId: 9, artwork }, frame);
        expect([inst.scale_x, inst.scale_y]).toEqual([1, 1]);
        const size = pictureSize(inst);
        expect(size.w).toBeCloseTo(0.4);
        expect(size.h).toBeCloseTo(0.5);
    });

    it('an asset without cm values goes at the size picked in the sheet', () => {
        const noCm = { ...artwork, width: null, height: null };
        const inst = arArtworkInstance({ artworkId: 4, assetId: 9, artwork: noCm }, frame, { w: 60, h: 48 });
        const size = pictureSize(inst);
        expect(size.w).toBeCloseTo(0.6);
        expect(size.h).toBeCloseTo(0.48);
    });

    it('does not change the placed instance', () => {
        arArtworkInstance(placed, frame);
        expect(placed.position_x).toBe(3);
        expect(placed.frameStyle).toBe('alu8-silber-matt');
    });
});
