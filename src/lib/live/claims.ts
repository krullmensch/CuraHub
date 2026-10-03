import type { ClaimEntry, ClaimHolder } from './protocol';

/**
 * Claims ("Sperren") in pure functions: which keys a tab's selection needs, who holds what,
 * and how undo leaves other people's objects alone. See the live collaboration spec, §3.
 */

export type ClaimKind = 'instance' | 'wall' | 'figure';

export const claimKey = (kind: ClaimKind, id: number): string => `${kind}:${id}`;

export interface ClaimSelectionState {
  selectedInstanceIds: number[];
  wallEditorSelection: number[];
  selectedWallId: number | null;
  selectedFigureId: number | null;
  localInstances: { id: number; wallId?: number | null }[];
}

/**
 * The groups a selection needs, each all-or-nothing: one per artwork, the selected wall
 * together with every artwork hanging on it (they move with it), the selected figure.
 * Temp ids (≤ 0, not saved yet) are left out — nobody else can know them. Sorted, so equal
 * selections give equal groups.
 */
export function desiredClaimGroups(state: ClaimSelectionState): string[][] {
  const groups: string[][] = [];
  const instanceIds = new Set([...state.selectedInstanceIds, ...state.wallEditorSelection].filter((id) => id > 0));
  for (const id of [...instanceIds].sort((a, b) => a - b)) groups.push([claimKey('instance', id)]);
  const wallId = state.selectedWallId;
  if (wallId !== null && wallId > 0) {
    const hung = state.localInstances
      .filter((i) => i.wallId === wallId && i.id > 0)
      .map((i) => i.id)
      .sort((a, b) => a - b)
      .map((id) => claimKey('instance', id));
    groups.push([claimKey('wall', wallId), ...hung]);
  }
  const figureId = state.selectedFigureId;
  if (figureId !== null && figureId > 0) groups.push([claimKey('figure', figureId)]);
  return groups;
}

export const claimGroupsSignature = (groups: string[][]): string => JSON.stringify(groups);

/** Keys held by other tabs (including other tabs of the same person). */
export function heldByOthers(entries: ClaimEntry[], selfSession: string | null): Map<string, ClaimHolder> {
  const held = new Map<string, ClaimHolder>();
  for (const { key, ...holder } of entries) {
    if (holder.session !== selfSession) held.set(key, holder);
  }
  return held;
}

export type HolderLookup = (key: string) => ClaimHolder | undefined;

/** Who blocks a wall: its own claim or a claim on an artwork hanging on it. */
export function wallBlocker(
  wallId: number,
  instances: { id: number; wallId?: number | null }[],
  holderOf: HolderLookup,
): ClaimHolder | undefined {
  const own = holderOf(claimKey('wall', wallId));
  if (own) return own;
  for (const inst of instances) {
    if (inst.wallId !== wallId) continue;
    const holder = holderOf(claimKey('instance', inst.id));
    if (holder) return holder;
  }
  return undefined;
}

/** Splits artwork ids into the selectable ones and the holders of the rest. */
export function splitClaimedInstances(ids: number[], holderOf: HolderLookup) {
  const allowed: number[] = [];
  const holders: ClaimHolder[] = [];
  for (const id of ids) {
    const holder = holderOf(claimKey('instance', id));
    if (holder) holders.push(holder);
    else allowed.push(id);
  }
  return { allowed, holders };
}

/** "Wird gerade von anna bearbeitet" / "3 Werke werden gerade von anna und ben bearbeitet". */
export function claimedMessage(holders: ClaimHolder[]): string {
  const names = [...new Set(holders.map((h) => h.name))];
  const who = names.length <= 1
    ? names[0] ?? 'jemand anderem'
    : `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
  if (holders.length <= 1) return `Wird gerade von ${who} bearbeitet`;
  return `${holders.length} Objekte werden gerade von ${who} bearbeitet`;
}

/**
 * Undo/redo target with every artwork someone else holds kept as it is now: the history only
 * ever changes your own work. Order follows the target; held artworks the target lacks stay.
 */
export function keepHeldInstances<T extends { id: number }>(target: T[], current: T[], isHeld: (id: number) => boolean): T[] {
  const currentById = new Map(current.map((i) => [i.id, i]));
  const result: T[] = [];
  const seen = new Set<number>();
  for (const item of target) {
    if (isHeld(item.id)) {
      const now = currentById.get(item.id);
      if (now) result.push(now);
    } else {
      result.push(item);
    }
    seen.add(item.id);
  }
  for (const item of current) {
    if (!seen.has(item.id) && isHeld(item.id)) result.push(item);
  }
  return result;
}

/** Keys a `claimed` answer leaves this tab without although it still selects them. */
export function lostKeys(wanted: string[][], granted: string[], heldElsewhere: (key: string) => boolean): Set<string> {
  const have = new Set(granted);
  const lost = new Set<string>();
  for (const group of wanted) {
    for (const key of group) {
      if (!have.has(key) && heldElsewhere(key)) lost.add(key);
    }
    // A wall whose group was refused is lost with it, whoever blocked it.
    if (group[0].startsWith('wall:') && !have.has(group[0])) lost.add(group[0]);
  }
  return lost;
}

/**
 * Puts objects whose change the server refused (423, someone else holds them) back to what
 * the server has: changed ones are replaced, deleted ones come back.
 */
export function restoreRefused<T extends { id: number }>(local: T[], refused: Set<number>, persisted: Map<number, T>): T[] {
  if (refused.size === 0) return local;
  const present = new Set(local.map((i) => i.id));
  const restored = local.map((i) => (refused.has(i.id) ? persisted.get(i.id) ?? i : i));
  for (const id of refused) {
    const saved = persisted.get(id);
    if (!present.has(id) && saved) restored.push(saved);
  }
  return restored;
}
