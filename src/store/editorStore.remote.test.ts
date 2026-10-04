import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyRemoteChange, isAutoSyncBusy, mergeRemoteState, useEditorStore,
  type ArtworkInstanceData, type ModularWallData, type ScaleFigureData,
} from './editorStore';
import { onWallEvent, type WallEvent } from '../lib/wallEvents';

const inst = (id: number, x = 0, wallId: number | null = null): ArtworkInstanceData => ({
  id, wallId, artworkId: id * 10,
  artwork: { id: id * 10, title: `Werk ${id}`, asset: { path: '', width: 100, height: 100, dpi: 72, type: 'image' } },
  position_x: x, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1,
} as ArtworkInstanceData);

const wall = (id: number, label: string, x = 0): ModularWallData => ({
  id, label, position_x: x, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  width: 3, height: 3, thickness: 0.2, color: '#fff', isLocked: false,
});

const figure = (id: number, x = 0, clientKey?: string): ScaleFigureData => ({ id, position_x: x, position_z: 0, rotation_y: 0, isPublic: false, clientKey });

const state = () => useEditorStore.getState();

beforeEach(async () => {
  // The setters also seed auto-sync's "persisted" snapshots.
  state().setLocalInstances([inst(1), inst(2, 0, 7)]);
  state().setLocalWalls([wall(7, 'Wall A'), wall(-2, 'Wall B')]);
  state().setLocalScaleFigures([figure(3, 0, 'key-3')]);
  useEditorStore.setState({
    selectedInstanceId: null, selectedInstanceIds: [], selectedWallId: null, selectedFigureId: null,
    wallEditor: null, wallEditorSelection: [], hasUnsavedChanges: false,
  });
  // Let the auto-sync debounce these changes schedule run out (no token: it does nothing).
  await new Promise((resolve) => setTimeout(resolve, 200));
});

describe('remote changes in the store', () => {
  it('moves an artwork without marking the exhibition dirty and keeps undo to own work', () => {
    // An own edit first (undo step), then anna moves artwork 2.
    state().commitLocalChange(state().localInstances.map((i) => (i.id === 1 ? { ...i, position_x: 4 } : i)));
    applyRemoteChange({ kind: 'instance', op: 'upsert', data: inst(2, 9, 7) });
    expect(state().localInstances.find((i) => i.id === 2)?.position_x).toBe(9);
    state().undo();
    const byId = new Map(state().localInstances.map((i) => [i.id, i.position_x]));
    expect(byId.get(1)).toBe(0);
    expect(byId.get(2)).toBe(9); // anna's move survives the undo
  });

  it('adds remote artworks to every undo snapshot and removes deleted ones', () => {
    state().commitLocalChange(state().localInstances.map((i) => (i.id === 1 ? { ...i, position_x: 4 } : i)));
    applyRemoteChange({ kind: 'instance', op: 'upsert', data: inst(5, 2) });
    state().undo();
    expect(state().localInstances.map((i) => i.id).sort()).toEqual([1, 2, 5]);
    state().redo();
    applyRemoteChange({ kind: 'instance', op: 'delete', id: 5 });
    state().undo();
    expect(state().localInstances.map((i) => i.id).sort()).toEqual([1, 2]);
  });

  it('ignores artworks without an asset and reports a deleted selection', () => {
    applyRemoteChange({ kind: 'instance', op: 'upsert', data: { ...inst(6), artwork: { asset: undefined } } as unknown as ArtworkInstanceData });
    expect(state().localInstances.some((i) => i.id === 6)).toBe(false);
    state().setInstanceSelection([1, 2], 1);
    expect(applyRemoteChange({ kind: 'instance', op: 'delete', id: 1 })).toBe(true);
    expect(state().selectedInstanceIds).toEqual([2]);
    expect(state().selectedInstanceId).toBe(2);
  });

  it('a deleted wall detaches its artworks and leaves the wall editor', () => {
    const events: WallEvent[] = [];
    const off = onWallEvent((e) => events.push(e));
    useEditorStore.setState({ selectedWallId: 7 });
    expect(applyRemoteChange({ kind: 'wall', op: 'delete', id: 7 })).toBe(true);
    off();
    expect(state().localWalls.map((w) => w.id)).toEqual([-2]);
    expect(state().localInstances.find((i) => i.id === 2)?.wallId).toBeNull();
    expect(state().selectedWallId).toBeNull();
    expect(events).toEqual([{ type: 'deleted', id: 7 }]);
  });

  it('a remote wall replaces this tab\'s unsaved default wall of the same name', () => {
    const events: WallEvent[] = [];
    const off = onWallEvent((e) => events.push(e));
    useEditorStore.setState({ localInstances: [...state().localInstances, inst(8, 0, -2)], selectedWallId: -2 });
    applyRemoteChange({ kind: 'wall', op: 'upsert', data: wall(12, 'Wall B', 1) });
    off();
    expect(state().localWalls.map((w) => w.id)).toEqual([7, 12]);
    expect(state().localInstances.find((i) => i.id === 8)?.wallId).toBe(12);
    expect(state().selectedWallId).toBe(12);
    expect(events).toEqual([{ type: 'replaced', from: -2, to: 12 }]);
  });

  it('keeps a figure\'s React key', () => {
    applyRemoteChange({ kind: 'figure', op: 'upsert', data: figure(3, 2) });
    expect(state().localScaleFigures).toEqual([{ ...figure(3, 2), clientKey: 'key-3' }]);
  });

  it('merges a full server state: new, changed and gone objects', () => {
    expect(isAutoSyncBusy()).toBe(false);
    const merged = mergeRemoteState({
      instances: [inst(2, 3, 7), inst(9)],
      walls: [wall(7, 'Wall A', 2)],
      figures: [],
    });
    expect(merged).toBe(true);
    expect(state().localInstances.map((i) => [i.id, i.position_x])).toEqual([[2, 3], [9, 0]]);
    expect(state().localWalls.find((w) => w.id === 7)?.position_x).toBe(2);
    expect(state().localWalls.some((w) => w.id === -2)).toBe(true); // unsaved default stays
    expect(state().localScaleFigures).toEqual([]);
  });

  it('waits while auto-sync has unsaved new objects', () => {
    useEditorStore.setState({ localInstances: [...state().localInstances, inst(-4)] });
    expect(isAutoSyncBusy()).toBe(true);
    expect(mergeRemoteState({ instances: [], walls: [], figures: [] })).toBe(false);
    expect(state().localInstances).toHaveLength(3);
  });
});
