import { describe, expect, it } from 'vitest';
import { framePreviewBoxes } from './framePreview';
import { framedArtworkLayout } from '@/lib/frameStyles';

const layout = (frameStyle: string, pp = 0, placement = 'center') =>
    framedArtworkLayout({ width: 0.5, height: 0.4, frameStyle, passepartoutWidth: pp, passepartoutPlacement: placement });

describe('framePreviewBoxes', () => {
    it('unframed: the picture is the whole box', () => {
        const b = framePreviewBoxes(layout('none'), 0.5, 0.4);
        expect(b.aspect).toBeCloseTo(0.5 / 0.4);
        expect(b.picture).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    });

    it('framed: the picture sits centred inside the frame', () => {
        const b = framePreviewBoxes(layout('alu8-silber-matt'), 0.5, 0.4);
        expect(b.picture.x).toBeGreaterThan(0);
        expect(b.picture.x + b.picture.w).toBeLessThan(1);
        expect(b.picture.x).toBeCloseTo(1 - (b.picture.x + b.picture.w));
        expect(b.opening).toEqual(b.picture);
    });

    it('passepartout at the optical centre: more board below than above', () => {
        const b = framePreviewBoxes(layout('alu8-silber-matt', 8, 'optical-center'), 0.5, 0.4);
        const above = b.picture.y - b.opening.y;
        const below = (b.opening.y + b.opening.h) - (b.picture.y + b.picture.h);
        expect(above).toBeGreaterThan(0);
        expect(below).toBeGreaterThan(above);
        expect(b.opening.w).toBeGreaterThan(b.picture.w);
    });
});
