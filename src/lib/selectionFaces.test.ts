import { describe, expect, it } from 'vitest';
import { commonFaceTarget } from './selectionFaces';
import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';

const wall: ModularWallData = {
  id: 1, position_x: 0, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  width: 4, height: 3, thickness: 0.1, color: '#fff', isLocked: false,
};
const pic = (id: number, z: number): ArtworkInstanceData => ({
  id, wallId: 1, artwork: { asset: { path: '', width: 100, height: 100, dpi: 72, type: 'image' } },
  position_x: 0, position_y: 1.5, position_z: z, rotation_x: 0, rotation_y: z > 0 ? 0 : Math.PI, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1,
});

describe('commonFaceTarget', () => {
  it('returns the face when all artworks hang on it', () => {
    expect(commonFaceTarget([pic(1, 0.06), pic(2, 0.06)], [wall], [])).toEqual({ kind: 'wall', wallId: 1, side: 'front' });
  });
  it('returns null for artworks on different faces', () => {
    expect(commonFaceTarget([pic(1, 0.06), pic(2, -0.06)], [wall], [])).toBeNull();
  });
  it('returns null for an empty selection', () => {
    expect(commonFaceTarget([], [wall], [])).toBeNull();
  });
});
