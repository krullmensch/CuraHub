import { describe, expect, it } from 'vitest';
import {
  claimedMessage, desiredClaimGroups, heldByOthers, keepHeldInstances, lostKeys, restoreRefused,
  splitClaimedInstances, wallBlocker,
} from './claims';
import type { ClaimHolder } from './protocol';

const anna: ClaimHolder = { session: 's-anna', userId: 2, name: 'anna', color: '#f00' };
const ben: ClaimHolder = { session: 's-ben', userId: 3, name: 'ben', color: '#0f0' };

describe('claim groups from the selection', () => {
  const base = { selectedInstanceIds: [], wallEditorSelection: [], selectedWallId: null, selectedFigureId: null, localInstances: [] };

  it('one group per artwork (3D and 2D selection), temp ids left out, sorted', () => {
    expect(desiredClaimGroups({ ...base, selectedInstanceIds: [7, -3, 2], wallEditorSelection: [2, 5] }))
      .toEqual([['instance:2'], ['instance:5'], ['instance:7']]);
  });

  it('a wall carries the artworks hanging on it, a figure is alone', () => {
    const groups = desiredClaimGroups({
      ...base, selectedWallId: 4, selectedFigureId: 9,
      localInstances: [{ id: 12, wallId: 4 }, { id: 11, wallId: 4 }, { id: -1, wallId: 4 }, { id: 13, wallId: 5 }],
    });
    expect(groups).toEqual([['wall:4', 'instance:11', 'instance:12'], ['figure:9']]);
    expect(desiredClaimGroups({ ...base, selectedWallId: -2 })).toEqual([]);
  });
});

describe('claim helpers', () => {
  const entries = [{ key: 'instance:1', ...anna }, { key: 'instance:2', ...ben }, { key: 'wall:3', ...anna }];
  const held = heldByOthers(entries, 's-ben');
  const holderOf = (key: string) => held.get(key);

  it('lists what other tabs hold', () => {
    expect([...held.keys()]).toEqual(['instance:1', 'wall:3']);
    expect(heldByOthers(entries, null).size).toBe(3);
  });

  it('splits selections and finds wall blockers', () => {
    expect(splitClaimedInstances([1, 2, 4], holderOf)).toEqual({ allowed: [2, 4], holders: [anna] });
    expect(wallBlocker(3, [], holderOf)).toEqual(anna);
    expect(wallBlocker(8, [{ id: 1, wallId: 8 }], holderOf)).toEqual(anna);
    expect(wallBlocker(8, [{ id: 2, wallId: 8 }, { id: 1, wallId: 9 }], holderOf)).toBeUndefined();
  });

  it('words the hint', () => {
    expect(claimedMessage([anna])).toBe('Wird gerade von anna bearbeitet');
    expect(claimedMessage([anna, anna, ben])).toBe('3 Objekte werden gerade von anna und ben bearbeitet');
    expect(claimedMessage([])).toBe('Wird gerade von jemand anderem bearbeitet');
  });

  it('keeps held artworks out of undo', () => {
    const target = [{ id: 1, v: 'old' }, { id: 2, v: 'old' }, { id: 4, v: 'old' }];
    const current = [{ id: 1, v: 'now' }, { id: 2, v: 'now' }, { id: 3, v: 'now' }];
    const isHeld = (id: number) => id === 2 || id === 3 || id === 4;
    // 2 stays as now, 3 (created by anna) stays, 4 (anna deleted it) stays gone.
    expect(keepHeldInstances(target, current, isHeld)).toEqual([{ id: 1, v: 'old' }, { id: 2, v: 'now' }, { id: 3, v: 'now' }]);
  });

  it('finds what a claimed answer took away', () => {
    const wanted = [['instance:1'], ['instance:5'], ['wall:3', 'instance:8']];
    const elsewhere = (key: string) => key === 'instance:1' || key === 'instance:8';
    expect([...lostKeys(wanted, ['instance:5'], elsewhere)].sort()).toEqual(['instance:1', 'instance:8', 'wall:3']);
    // A wall the server let this tab keep is not lost.
    expect([...lostKeys(wanted, ['instance:1', 'instance:5', 'wall:3'], elsewhere)]).toEqual(['instance:8']);
  });

  it('restores refused changes and deletions from the saved state', () => {
    const saved = new Map([[1, { id: 1, x: 0 }], [2, { id: 2, x: 0 }]]);
    const local = [{ id: 1, x: 5 }, { id: 3, x: 1 }];
    expect(restoreRefused(local, new Set([1, 2]), saved)).toEqual([{ id: 1, x: 0 }, { id: 3, x: 1 }, { id: 2, x: 0 }]);
    expect(restoreRefused(local, new Set(), saved)).toBe(local);
  });
});
