import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore, type ArtworkInstanceData } from './editorStore';
import { setClaimNotifier, setHeldClaims } from '../lib/live/claimGate';
import type { ClaimHolder } from '../lib/live/protocol';

const inst = (id: number, x = 0, wallId: number | null = null): ArtworkInstanceData => ({
  id, wallId, artwork: { asset: { path: '', width: 100, height: 100, dpi: 72, type: 'image' } },
  position_x: x, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1,
});

const ANNA: ClaimHolder = { session: 'other', userId: 2, name: 'anna', color: '#f00' };
const notified: ClaimHolder[][] = [];

beforeEach(() => {
  notified.length = 0;
  setClaimNotifier((holders) => notified.push(holders));
  setHeldClaims(new Map([['instance:2', ANNA], ['figure:7', ANNA], ['instance:4', ANNA]]));
  useEditorStore.setState({
    localInstances: [inst(1), inst(2), inst(3), inst(4, 0, 9)], pastInstances: [], futureInstances: [],
    selectedInstanceId: null, selectedInstanceIds: [], selectedWallId: null, selectedZoneId: null, selectedFigureId: null,
    wallEditor: null, wallEditorSelection: [],
  });
});

afterEach(() => {
  setHeldClaims(new Map());
  setClaimNotifier(() => {});
});

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('selection respects other tabs\' claims', () => {
  it('a click on a held artwork changes nothing and says who has it', async () => {
    useEditorStore.getState().selectInstance(1);
    useEditorStore.getState().selectInstance(2);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([1]);
    useEditorStore.getState().toggleInstanceInSelection(2);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([1]);
    await flush();
    expect(notified).toEqual([[ANNA], [ANNA]]);
  });

  it('select all and set selection leave held artworks out', async () => {
    useEditorStore.getState().selectAllInstances();
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([1, 3]);
    useEditorStore.getState().setInstanceSelection([2, 3]);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([3]);
    useEditorStore.getState().setWallEditorSelection([1, 2]);
    expect(useEditorStore.getState().wallEditorSelection).toEqual([1]);
  });

  it('a wall with a held artwork on it and a held figure cannot be selected', () => {
    useEditorStore.getState().selectWall(9);
    expect(useEditorStore.getState().selectedWallId).toBeNull();
    useEditorStore.getState().selectWall(8);
    expect(useEditorStore.getState().selectedWallId).toBe(8);
    useEditorStore.getState().selectFigure(7);
    expect(useEditorStore.getState().selectedFigureId).toBeNull();
    expect(useEditorStore.getState().selectedWallId).toBe(8);
  });

  it('undo and redo leave held artworks as they are now', () => {
    const before = useEditorStore.getState().localInstances;
    // Own edit to 1, and (as received) anna's later move of 2.
    useEditorStore.getState().commitLocalChange(before.map((i) => (i.id === 1 ? { ...i, position_x: 5 } : i)));
    useEditorStore.setState({
      localInstances: useEditorStore.getState().localInstances.map((i) => (i.id === 2 ? { ...i, position_x: 9 } : i)),
    });
    useEditorStore.getState().undo();
    const undone = new Map(useEditorStore.getState().localInstances.map((i) => [i.id, i.position_x]));
    expect(undone.get(1)).toBe(0);
    expect(undone.get(2)).toBe(9);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().localInstances.find((i) => i.id === 1)?.position_x).toBe(5);
    expect(useEditorStore.getState().localInstances.find((i) => i.id === 2)?.position_x).toBe(9);
  });

  it('without a live channel nothing is held', () => {
    setHeldClaims(new Map());
    useEditorStore.getState().selectAllInstances();
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([1, 2, 3, 4]);
    expect(vi.isFakeTimers()).toBe(false);
  });
});
