/**
 * Changes other tabs saved, merged into this tab's state (step 3 of the live collaboration
 * spec). Pure functions; editorStore applies them to its lists, auto-sync's "believed
 * persisted" snapshots and the undo history.
 *
 * Rules:
 * - The snapshot (what the server has) always takes the remote row.
 * - The local list takes it too, unless this tab has an unsaved change to that object
 *   (local ≠ snapshot in a synced field): then the local change stays and auto-sync sends it.
 * - An object this tab deleted but has not synced yet stays deleted.
 * - A remote delete always wins.
 * - Undo snapshots get every remote row and lose every remote delete, so undo never reverts,
 *   resurrects or deletes somebody else's work.
 */

type WithId = { id: number };

/** Fields auto-sync compares (editorStore's diff); a difference means "unsaved local change". */
export type SyncedEqual<T> = (a: T, b: T) => boolean;

export interface EntityLists<T extends WithId> {
  local: T[];
  persisted: T[];
}

export function upsertRemote<T extends WithId>(lists: EntityLists<T>, remote: T, equal: SyncedEqual<T>): EntityLists<T> {
  const before = lists.persisted.find((i) => i.id === remote.id);
  const persisted = before
    ? lists.persisted.map((i) => (i.id === remote.id ? remote : i))
    : [...lists.persisted, remote];
  const mine = lists.local.find((i) => i.id === remote.id);
  let local: T[];
  if (mine) {
    const unsaved = before !== undefined && !equal(mine, before);
    local = unsaved ? lists.local : lists.local.map((i) => (i.id === remote.id ? remote : i));
  } else {
    // Known to the server before and gone here: deleted locally, the DELETE is on its way.
    local = before ? lists.local : [...lists.local, remote];
  }
  return { local, persisted };
}

export function deleteRemote<T extends WithId>(lists: EntityLists<T>, id: number): EntityLists<T> {
  return {
    local: lists.local.filter((i) => i.id !== id),
    persisted: lists.persisted.filter((i) => i.id !== id),
  };
}

/** Undo history after a remote upsert: the row replaces the old one or joins every snapshot. */
export function upsertInHistory<T extends WithId>(history: T[][], remote: T): T[][] {
  return history.map((snap) => (snap.some((i) => i.id === remote.id)
    ? snap.map((i) => (i.id === remote.id ? remote : i))
    : [...snap, remote]));
}

export function deleteInHistory<T extends WithId>(history: T[][], id: number): T[][] {
  return history.map((snap) => (snap.some((i) => i.id === id) ? snap.filter((i) => i.id !== id) : snap));
}

// ── Synced fields per kind (mirror the auto-sync diff in editorStore) ───────────

interface InstanceLike {
  position_x: number; position_y: number; position_z: number;
  rotation_x: number; rotation_y: number; rotation_z: number;
  scale_x: number; scale_y: number; scale_z: number;
  wallId?: number | null; medium?: string; frameStyle?: string;
  passepartoutWidth?: number; passepartoutPlacement?: string; opacity?: number;
}

export const instanceSyncedEqual = <T extends InstanceLike>(a: T, b: T): boolean =>
  a.position_x === b.position_x && a.position_y === b.position_y && a.position_z === b.position_z
  && a.rotation_x === b.rotation_x && a.rotation_y === b.rotation_y && a.rotation_z === b.rotation_z
  && a.scale_x === b.scale_x && a.scale_y === b.scale_y && a.scale_z === b.scale_z
  && (a.wallId ?? null) === (b.wallId ?? null) && a.medium === b.medium && a.frameStyle === b.frameStyle
  && (a.passepartoutWidth ?? 0) === (b.passepartoutWidth ?? 0)
  && (a.passepartoutPlacement ?? 'center') === (b.passepartoutPlacement ?? 'center')
  && (a.opacity ?? 1) === (b.opacity ?? 1);

interface WallLike {
  position_x: number; position_z: number; rotation_y: number;
  isLocked: boolean; label?: string | null; color: string;
}

export const wallSyncedEqual = <T extends WallLike>(a: T, b: T): boolean =>
  a.position_x === b.position_x && a.position_z === b.position_z && a.rotation_y === b.rotation_y
  && a.isLocked === b.isLocked && (a.label ?? null) === (b.label ?? null) && a.color === b.color;

interface FigureLike { position_x: number; position_z: number; rotation_y: number; isPublic: boolean }

export const figureSyncedEqual = <T extends FigureLike>(a: T, b: T): boolean =>
  a.position_x === b.position_x && a.position_z === b.position_z && a.rotation_y === b.rotation_y
  && a.isPublic === b.isPublic;

/**
 * A wall another tab created that matches one of this tab's unsaved default walls (same
 * label, temp id): both tabs started from the defaults, so the remote one replaces it.
 */
export function defaultWallReplacedBy<T extends WithId & { label?: string | null }>(local: T[], persisted: T[], remote: T): T | undefined {
  if (persisted.some((w) => w.id === remote.id) || !remote.label) return undefined;
  return local.find((w) => w.id < 0 && w.label === remote.label);
}

/** Selection fields without a deleted object. */
export function withoutDeleted(
  selection: { selectedInstanceIds: number[]; selectedInstanceId: number | null; wallEditorSelection: number[] },
  id: number,
) {
  const ids = selection.selectedInstanceIds.filter((i) => i !== id);
  return {
    selectedInstanceIds: ids,
    selectedInstanceId: selection.selectedInstanceId === id ? ids[ids.length - 1] ?? null : selection.selectedInstanceId,
    wallEditorSelection: selection.wallEditorSelection.filter((i) => i !== id),
  };
}
