import { describe, expect, it } from 'vitest';
import { groupPlacedArtworks, rangeSelection } from './placedArtworkGroups';
import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';

const wall: ModularWallData = {
  id: 1, label: 'Wand A', position_x: 0, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  width: 4, height: 3, thickness: 0.1, color: '#fff', isLocked: false,
};
const pic = (id: number, x: number, z: number, patch: Partial<ArtworkInstanceData> = {}): ArtworkInstanceData => ({
  id, wallId: 1, artwork: { asset: { path: '', width: 100, height: 100, dpi: 72, type: 'image' } },
  position_x: x, position_y: 1.5, position_z: z, rotation_x: 0, rotation_y: z >= 0 ? 0 : Math.PI, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1, ...patch,
});

describe('rangeSelection', () => {
  it('selects the inclusive range between anchor and id in list order', () => {
    expect(rangeSelection([5, 3, 8, 1], 3, 1)).toEqual([3, 8, 1]);
    expect(rangeSelection([5, 3, 8, 1], 1, 5)).toEqual([5, 3, 8, 1]);
  });
  it('selects only the id without a usable anchor', () => {
    expect(rangeSelection([5, 3], null, 3)).toEqual([3]);
    expect(rangeSelection([5, 3], 99, 3)).toEqual([3]);
  });
});

describe('groupPlacedArtworks', () => {
  it('groups by wall face, orders left to right, free artworks last', () => {
    const model = pic(4, 3, 3, { wallId: null, medium: 'model3d', artwork: { asset: { path: '', width: 0, height: 0, dpi: null, type: 'model3d' } } });
    const groups = groupPlacedArtworks([pic(1, 1, 0.06), pic(2, -1, 0.06), pic(3, 0, -0.06), model], [wall], []);
    expect(groups).toHaveLength(3);
    expect(groups[groups.length - 1]).toMatchObject({ key: 'free', label: 'Frei im Raum', ids: [4] });
    const front = groups.find((g) => g.ids.includes(1))!;
    expect(front.label).toContain('Wand A');
    expect(front.ids).toEqual([2, 1]); // u grows to the right (right = up × normal = +x)
    expect(groups.find((g) => g.ids.includes(3))!.ids).toEqual([3]);
  });
});
