import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaded = vi.hoisted(() => ({ id: null as number | null }));
vi.mock('../wallEditor/layoutSync', () => ({
  isWallLayoutLoaded: (versionId: number | null) => versionId != null && versionId === loaded.id,
}));

import { useEditorStore, type ArtworkInstanceData } from '../../store/editorStore';
import { useWallEditorView } from '../../store/wallEditorViewStore';
import { buildVersionSnapshot } from './snapshotPayload';

const wall = (id: number) => ({
  id, label: null, position_x: 0, position_y: 0, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  width: 4, height: 3, thickness: 0.1, color: '#fff', isLocked: false,
});

const inst = (id: number, assetId: number, wallId: number | null): ArtworkInstanceData => ({
  id, assetId, wallId,
  artwork: { asset: { path: '', width: 100, height: 100, dpi: 72, type: 'image' } },
  position_x: 1, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1,
} as ArtworkInstanceData);

const opts = { comment: 'Hallo', branchName: 'main', sourceVersionId: 5 };

beforeEach(() => {
  loaded.id = null;
  useEditorStore.setState({
    localWalls: [wall(10), wall(-7)] as never,
    localInstances: [inst(-3, 42, -7)],
    localScaleFigures: [],
  });
  useWallEditorView.setState({ hangingHeight: 1.6, guidesByFace: { 'wall:10:front': [{ id: 1, axis: 'h', value: 1.2 }] } } as never);
});

describe('buildVersionSnapshot', () => {
  it('maps an unsynced artwork on an unsynced wall to assetId + wallIndex', () => {
    const body = buildVersionSnapshot(opts) as { instances: Record<string, unknown>[] };
    expect(body.instances[0]).toMatchObject({ assetId: 42, wallId: -7, wallIndex: 1 });
  });

  it('includes hangingHeight and wallGuides only when the layout is loaded for the source version', () => {
    expect(buildVersionSnapshot(opts)).not.toHaveProperty('hangingHeight');
    expect(buildVersionSnapshot(opts)).not.toHaveProperty('wallGuides');
    loaded.id = 5;
    const body = buildVersionSnapshot(opts);
    expect(body.hangingHeight).toBe(1.6);
    expect(body.wallGuides).toEqual({ 'wall:10:front': [{ axis: 'h', value: 1.2 }] });
  });

  it('carries comment, branch_name and sourceVersionId', () => {
    const body = buildVersionSnapshot(opts);
    expect(body).toMatchObject({ comment: 'Hallo', branch_name: 'main', sourceVersionId: 5 });
  });
});
