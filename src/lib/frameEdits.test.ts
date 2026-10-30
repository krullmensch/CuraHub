import { describe, expect, it } from 'vitest';
import { withFrameStyle, withPassepartout } from './frameEdits';
import { MAX_PASSEPARTOUT_WIDTH_CM } from './frameStyles';
import type { ArtworkInstanceData } from '@/store/editorStore';

const inst = (id: number): ArtworkInstanceData => ({
    id, artwork: { asset: { path: '', width: 1, height: 1, dpi: 72 } },
    position_x: 0, position_y: 0, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0, scale_x: 1, scale_y: 1, scale_z: 1,
});

describe('frameEdits', () => {
    it('withFrameStyle changes only that artwork and returns a new list', () => {
        const list = [inst(1), inst(2)];
        const next = withFrameStyle(list, 2, 'alu8-silber-matt');
        expect(next).not.toBe(list);
        expect(next[1].frameStyle).toBe('alu8-silber-matt');
        expect(next[0]).toBe(list[0]);
        expect(list[1].frameStyle).toBeUndefined();
    });

    it('withPassepartout clamps the width', () => {
        const list = [inst(1)];
        expect(withPassepartout(list, 1, { width: 99, placement: 'center' })[0].passepartoutWidth).toBe(MAX_PASSEPARTOUT_WIDTH_CM);
        expect(withPassepartout(list, 1, { width: -3, placement: 'golden-ratio' })[0]).toMatchObject({ passepartoutWidth: 0, passepartoutPlacement: 'golden-ratio' });
    });
});
