import { describe, expect, it } from 'vitest';
import {
  defaultWallReplacedBy, deleteInHistory, deleteRemote, figureSyncedEqual, instanceSyncedEqual,
  upsertInHistory, upsertRemote, wallSyncedEqual, withoutDeleted,
} from './remoteChanges';

type Item = { id: number; x: number; note?: string };
const equal = (a: Item, b: Item) => a.x === b.x;

describe('remote upserts', () => {
  it('takes the remote row where this tab has no unsaved change', () => {
    const saved = { id: 1, x: 0 };
    const next = upsertRemote({ local: [saved], persisted: [saved] }, { id: 1, x: 5 }, equal);
    expect(next).toEqual({ local: [{ id: 1, x: 5 }], persisted: [{ id: 1, x: 5 }] });
  });

  it('keeps an unsaved local change (auto-sync sends it next)', () => {
    const next = upsertRemote({ local: [{ id: 1, x: 2 }], persisted: [{ id: 1, x: 0 }] }, { id: 1, x: 5 }, equal);
    expect(next.local).toEqual([{ id: 1, x: 2 }]);
    expect(next.persisted).toEqual([{ id: 1, x: 5 }]);
  });

  it('adds new remote objects, but not ones this tab deleted and has not synced yet', () => {
    expect(upsertRemote({ local: [], persisted: [] }, { id: 2, x: 1 }, equal).local).toEqual([{ id: 2, x: 1 }]);
    const deletedHere = upsertRemote({ local: [], persisted: [{ id: 3, x: 0 }] }, { id: 3, x: 9 }, equal);
    expect(deletedHere.local).toEqual([]);
    expect(deletedHere.persisted).toEqual([{ id: 3, x: 9 }]);
  });

  it('deletes everywhere', () => {
    expect(deleteRemote({ local: [{ id: 1, x: 2 }], persisted: [{ id: 1, x: 0 }] }, 1)).toEqual({ local: [], persisted: [] });
  });
});

describe('undo history', () => {
  it('replaces or adds the remote row in every snapshot, and drops deleted ones', () => {
    const history = [[{ id: 1, x: 0 }], [{ id: 1, x: 1 }, { id: 2, x: 0 }]];
    expect(upsertInHistory(history, { id: 2, x: 7 })).toEqual([[{ id: 1, x: 0 }, { id: 2, x: 7 }], [{ id: 1, x: 1 }, { id: 2, x: 7 }]]);
    const pruned = deleteInHistory(history, 2);
    expect(pruned).toEqual([[{ id: 1, x: 0 }], [{ id: 1, x: 1 }]]);
    expect(pruned[0]).toBe(history[0]);
  });
});

describe('synced field comparisons', () => {
  type Inst = Parameters<typeof instanceSyncedEqual>[0];
  const inst: Inst = {
    position_x: 0, position_y: 1, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
    scale_x: 1, scale_y: 1, scale_z: 1, wallId: null, medium: 'frame', frameStyle: 'none',
  };
  it('instances: defaults count as equal, any synced field differs', () => {
    expect(instanceSyncedEqual({ ...inst, opacity: 1, passepartoutWidth: 0 }, inst)).toBe(true);
    expect(instanceSyncedEqual({ ...inst, wallId: undefined }, inst)).toBe(true);
    expect(instanceSyncedEqual({ ...inst, scale_z: 2 }, inst)).toBe(false);
    expect(instanceSyncedEqual({ ...inst, passepartoutPlacement: 'golden-ratio' }, inst)).toBe(false);
  });
  it('walls and figures', () => {
    const wall = { position_x: 0, position_z: 0, rotation_y: 0, isLocked: false, label: 'Wall A', color: '#fff' };
    expect(wallSyncedEqual(wall, { ...wall })).toBe(true);
    expect(wallSyncedEqual(wall, { ...wall, isLocked: true })).toBe(false);
    const fig = { position_x: 0, position_z: 0, rotation_y: 0, isPublic: false };
    expect(figureSyncedEqual(fig, { ...fig, isPublic: true })).toBe(false);
  });
});

describe('helpers', () => {
  it('matches a remote wall to an unsaved default wall by label', () => {
    const local: { id: number; label: string | null }[] = [{ id: -1, label: 'Wall A' }, { id: -2, label: 'Wall B' }, { id: 4, label: 'Wall C' }];
    expect(defaultWallReplacedBy(local, [], { id: 9, label: 'Wall B' })?.id).toBe(-2);
    expect(defaultWallReplacedBy(local, [{ id: 9, label: 'Wall B' }], { id: 9, label: 'Wall B' })).toBeUndefined();
    expect(defaultWallReplacedBy(local, [], { id: 9, label: 'Wall C' })).toBeUndefined();
    expect(defaultWallReplacedBy(local, [], { id: 9, label: null })).toBeUndefined();
  });

  it('drops a deleted object from the selection', () => {
    expect(withoutDeleted({ selectedInstanceIds: [1, 2], selectedInstanceId: 2, wallEditorSelection: [2, 3] }, 2))
      .toEqual({ selectedInstanceIds: [1], selectedInstanceId: 1, wallEditorSelection: [3] });
  });
});
