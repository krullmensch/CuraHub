import { beforeEach, describe, expect, it } from 'vitest';
import { recordInstanceIdRemap, remapSelection, resolveInstanceId, useEditorStore, type ArtworkInstanceData } from './editorStore';

const inst = (id: number): ArtworkInstanceData => ({
  id, artwork: { asset: { path: '', width: 100, height: 100, dpi: 72, type: 'image' } },
  position_x: 0, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1,
});

beforeEach(() => {
  useEditorStore.setState({
    localInstances: [inst(1), inst(2), inst(3)], pastInstances: [], futureInstances: [],
    selectedInstanceId: null, selectedInstanceIds: [], selectedWallId: null, selectedZoneId: null,
    wallEditor: null, wallEditorSelection: [],
  });
});

describe('instance selection', () => {
  it('selectInstance keeps primary and array in sync', () => {
    useEditorStore.getState().selectInstance(2);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([2]);
    expect(useEditorStore.getState().selectedInstanceId).toBe(2);
    useEditorStore.getState().selectInstance(null);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([]);
    expect(useEditorStore.getState().selectedInstanceId).toBeNull();
  });

  it('pickInstance additive toggles and moves primary', () => {
    const s = useEditorStore.getState();
    s.pickInstance(1, false);
    s.pickInstance(3, true);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([1, 3]);
    expect(useEditorStore.getState().selectedInstanceId).toBe(3);
    useEditorStore.getState().pickInstance(3, true);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([1]);
    expect(useEditorStore.getState().selectedInstanceId).toBe(1);
  });

  it('setInstanceSelection drops unknown ids and dedupes', () => {
    useEditorStore.getState().setInstanceSelection([2, 2, 99, 1]);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([2, 1]);
    expect(useEditorStore.getState().selectedInstanceId).toBe(1);
  });

  it('selectWall and selectZone clear the artwork selection', () => {
    useEditorStore.getState().setInstanceSelection([1, 2]);
    useEditorStore.getState().selectWall(5);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([]);
    useEditorStore.getState().setInstanceSelection([1, 2]);
    useEditorStore.getState().selectZone(5);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([]);
  });

  it('selectAllInstances selects every artwork', () => {
    useEditorStore.getState().selectAllInstances();
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([1, 2, 3]);
  });

  it('deleteSelectedInstance removes all selected in one undo step', () => {
    useEditorStore.getState().setInstanceSelection([1, 3]);
    useEditorStore.getState().deleteSelectedInstance();
    const s = useEditorStore.getState();
    expect(s.localInstances.map(i => i.id)).toEqual([2]);
    expect(s.pastInstances).toHaveLength(1);
    expect(s.selectedInstanceIds).toEqual([]);
  });

  it('undo clears selection', () => {
    useEditorStore.getState().setInstanceSelection([1, 2]);
    useEditorStore.getState().deleteSelectedInstance();
    useEditorStore.getState().setInstanceSelection([3]);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([]);
    expect(useEditorStore.getState().selectedInstanceId).toBeNull();
  });

  it('setActiveVersion clears selection', () => {
    useEditorStore.getState().setInstanceSelection([1, 2]);
    useEditorStore.getState().setActiveVersion(7);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([]);
  });

  it('temp id remap replaces the id in the selection', () => {
    expect(remapSelection([-3, 5], -3, 12)).toEqual([12, 5]);
    expect(remapSelection([5], -3, 12)).toEqual([5]);
  });

  it('shiftHeld follows setShiftHeld', () => {
    useEditorStore.getState().setShiftHeld(true);
    expect(useEditorStore.getState().shiftHeld).toBe(true);
    useEditorStore.getState().setShiftHeld(false);
    expect(useEditorStore.getState().shiftHeld).toBe(false);
  });

  it('closing the wall editor hands its selection back to 3D', () => {
    useEditorStore.setState({ wallEditor: { kind: 'room', faceId: 'f1' }, wallEditorSelection: [1, 2] });
    useEditorStore.getState().closeWallEditor();
    const s = useEditorStore.getState();
    expect(s.selectedInstanceIds).toEqual([1, 2]);
    expect(s.selectedInstanceId).toBe(2);
    expect(s.wallEditor).toBeNull();
  });

  it('closing the wall editor with nothing selected keeps the edited wall selected', () => {
    useEditorStore.setState({
      localWalls: [{ id: 7, position_x: 0, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0, width: 4, height: 3, thickness: 0.1, color: '#fff', isLocked: false }],
      wallEditor: { kind: 'wall', wallId: 7, side: 'front' }, wallEditorSelection: [],
    });
    useEditorStore.getState().closeWallEditor();
    expect(useEditorStore.getState().selectedWallId).toBe(7);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([]);
  });

  it('resolveInstanceId follows a temp id to its database id', () => {
    recordInstanceIdRemap(-501, 77);
    expect(resolveInstanceId(-501)).toBe(77);
    expect(resolveInstanceId(12)).toBe(12);
  });
});
