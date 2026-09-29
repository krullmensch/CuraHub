import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore, type ArtworkInstanceData } from '@/store/editorStore';
import { commitSelectionOperation, duplicateCurrentSelection, openFaceWithSelection } from './selectionActions';

const pic = (id: number, x: number): ArtworkInstanceData => ({
  id, artworkId: id, frameStyle: 'none',
  artwork: { width: 100, height: 100, asset: { path: '', width: 1000, height: 1000, dpi: 72, type: 'image' } },
  position_x: x, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1,
});

beforeEach(() => {
  useEditorStore.setState({
    localInstances: [pic(1, 0), pic(2, 2)], pastInstances: [], futureInstances: [],
    selectedInstanceId: null, selectedInstanceIds: [], localWalls: [],
  });
});

describe('duplicateCurrentSelection', () => {
  it('adds the copies in one undo step and selects them', () => {
    useEditorStore.getState().setInstanceSelection([1, 2]);
    duplicateCurrentSelection();
    const s = useEditorStore.getState();
    expect(s.localInstances).toHaveLength(4);
    expect(s.pastInstances).toHaveLength(1);
    expect(s.selectedInstanceIds).toHaveLength(2);
    expect(s.selectedInstanceIds.every(id => id < 0)).toBe(true);
  });

  it('does nothing without a selection', () => {
    duplicateCurrentSelection();
    expect(useEditorStore.getState().pastInstances).toHaveLength(0);
  });
});

describe('commitSelectionOperation', () => {
  it('commits a result and ignores null', () => {
    commitSelectionOperation(null);
    expect(useEditorStore.getState().pastInstances).toHaveLength(0);
    commitSelectionOperation([pic(1, 5)]);
    expect(useEditorStore.getState().localInstances.map(i => i.position_x)).toEqual([5]);
  });
});

describe('openFaceWithSelection', () => {
  it('opens the face with the selected artworks that hang on it', () => {
    const wall = { id: 1, position_x: 0, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0, width: 6, height: 3, thickness: 0.1, color: '#fff', isLocked: false };
    const front = (id: number, x: number) => ({ ...pic(id, x), wallId: 1, position_z: 0.06 });
    useEditorStore.setState({ localWalls: [wall], localInstances: [front(1, 0), front(2, 2), pic(3, 5)], plannerViewMode: 'perspective' });
    useEditorStore.getState().setInstanceSelection([1, 3]);
    openFaceWithSelection({ kind: 'wall', wallId: 1, side: 'front' });
    expect(useEditorStore.getState().wallEditor).toEqual({ kind: 'wall', wallId: 1, side: 'front' });
    expect(useEditorStore.getState().wallEditorSelection).toEqual([1]);
  });
});
