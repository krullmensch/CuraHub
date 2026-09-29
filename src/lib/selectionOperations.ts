import * as THREE from 'three';
import { artworkMinY, isFixedSizeMedium, nextTempId, type ArtworkInstanceData, type ModularWallData } from '@/store/editorStore';
import type { FrameStyleId, PassepartoutPlacement } from './frameStyles';
import { instanceWorldBounds } from './instanceBounds';
import { detachIfOffWall } from './instanceTransform';

/**
 * Commands on a multi-selection of the 3D editor. Each takes the current instances and returns the
 * new list (one commitLocalChange → one undo step), or null when there is nothing to do.
 * The primary artwork is the last id of `ids` (see editorStore.setInstanceSelection).
 */

export type HeightEdge = 'bottom' | 'center' | 'top';
export type AxisEdge = 'min' | 'center' | 'max';
export type WorldAxis = 'x' | 'z';

export interface FramePatch {
  frameStyle?: FrameStyleId;
  passepartoutWidth?: number;
  passepartoutPlacement?: PassepartoutPlacement;
}

/** Gap between a duplicated group and the original. */
const DUPLICATE_GAP_M = 0.1;

/** Pictures take a frame and passepartout; videos, monitors and floor objects don't. */
export const isFramable = (inst: ArtworkInstanceData) =>
  (inst.artwork.asset.type ?? 'image') === 'image' && inst.medium !== 'monitor';

function selectedOf(instances: ArtworkInstanceData[], ids: number[]) {
  const set = new Set(ids);
  return instances.filter(i => set.has(i.id));
}

function primaryOf(members: ArtworkInstanceData[], ids: number[]) {
  return members.find(m => m.id === ids[ids.length - 1]) ?? members[members.length - 1];
}

/** Applies per-id patches in one pass; moved artworks may leave their wall. */
function patchAll(
  instances: ArtworkInstanceData[], patches: Map<number, Partial<ArtworkInstanceData>>, walls: ModularWallData[], moved: boolean,
) {
  if (patches.size === 0) return null;
  return instances.map(inst => {
    const patch = patches.get(inst.id);
    if (!patch) return inst;
    const next = { ...inst, ...patch };
    return moved ? detachIfOffWall(next, walls) : next;
  });
}

const heightOf = (box: THREE.Box3, edge: HeightEdge) =>
  edge === 'bottom' ? box.min.y : edge === 'top' ? box.max.y : (box.min.y + box.max.y) / 2;

/**
 * Brings bottoms, centres or tops to one height: the primary artwork's, or `target` (metres).
 * Frames and passepartouts count. Works across walls — nothing moves sideways.
 */
export function alignHeight(
  instances: ArtworkInstanceData[], ids: number[], walls: ModularWallData[], edge: HeightEdge, target?: number,
) {
  const members = selectedOf(instances, ids);
  if (members.length === 0 || (target === undefined && members.length < 2)) return null;
  const goal = target ?? heightOf(instanceWorldBounds(primaryOf(members, ids)), edge);
  const patches = new Map<number, Partial<ArtworkInstanceData>>();
  for (const inst of members) {
    if (inst.medium === 'book') continue;
    const dy = goal - heightOf(instanceWorldBounds(inst), edge);
    patches.set(inst.id, { position_y: Math.max(artworkMinY(inst), inst.position_y + dy) });
  }
  return patchAll(instances, patches, walls, false);
}

const axisOf = (box: THREE.Box3, axis: WorldAxis, edge: AxisEdge) =>
  edge === 'min' ? box.min[axis] : edge === 'max' ? box.max[axis] : (box.min[axis] + box.max[axis]) / 2;
const positionKey = (axis: WorldAxis) => (axis === 'x' ? 'position_x' : 'position_z');

/** Lines the selection up on a world axis (floor plan) at the primary artwork's min/centre/max. */
export function alignAxis(
  instances: ArtworkInstanceData[], ids: number[], walls: ModularWallData[], axis: WorldAxis, edge: AxisEdge,
) {
  const members = selectedOf(instances, ids);
  if (members.length < 2) return null;
  const goal = axisOf(instanceWorldBounds(primaryOf(members, ids)), axis, edge);
  const key = positionKey(axis);
  const patches = new Map<number, Partial<ArtworkInstanceData>>();
  for (const inst of members) {
    patches.set(inst.id, { [key]: inst[key] + goal - axisOf(instanceWorldBounds(inst), axis, edge) });
  }
  return patchAll(instances, patches, walls, true);
}

/** Equal gaps between the artworks along a world axis; the two outer ones stay where they are. */
export function distributeAxis(instances: ArtworkInstanceData[], ids: number[], walls: ModularWallData[], axis: WorldAxis) {
  const members = selectedOf(instances, ids);
  if (members.length < 3) return null;
  const items = members
    .map(inst => ({ inst, box: instanceWorldBounds(inst) }))
    .sort((a, b) => (a.box.min[axis] + a.box.max[axis]) - (b.box.min[axis] + b.box.max[axis]));
  const first = items[0].box.min[axis];
  const last = items[items.length - 1].box.max[axis];
  const total = items.reduce((sum, { box }) => sum + box.max[axis] - box.min[axis], 0);
  const gap = (last - first - total) / (items.length - 1);
  const key = positionKey(axis);
  const patches = new Map<number, Partial<ArtworkInstanceData>>();
  let cursor = first;
  for (const { inst, box } of items) {
    patches.set(inst.id, { [key]: inst[key] + cursor - box.min[axis] });
    cursor += box.max[axis] - box.min[axis] + gap;
  }
  return patchAll(instances, patches, walls, true);
}

/** Scales every artwork by `factor` about its own centre; monitors and books keep their size. */
export function scaleSelection(instances: ArtworkInstanceData[], ids: number[], factor: number) {
  if (!(factor > 0) || factor === 1) return null;
  const patches = new Map<number, Partial<ArtworkInstanceData>>();
  for (const inst of selectedOf(instances, ids)) {
    if (isFixedSizeMedium(inst.medium)) continue;
    const scaleY = inst.scale_y * factor;
    patches.set(inst.id, {
      scale_x: inst.scale_x * factor,
      scale_y: scaleY,
      scale_z: inst.scale_z * factor,
      position_y: Math.max(artworkMinY(inst, scaleY), inst.position_y),
    });
  }
  return patchAll(instances, patches, [], false);
}

/** Sets frame style and/or passepartout on every picture of the selection. */
export function setSelectionFrame(instances: ArtworkInstanceData[], ids: number[], patch: FramePatch) {
  const patches = new Map<number, Partial<ArtworkInstanceData>>();
  for (const inst of selectedOf(instances, ids)) if (isFramable(inst)) patches.set(inst.id, patch);
  return patchAll(instances, patches, [], false);
}

const _right = new THREE.Vector3();
const _euler = new THREE.Euler();
const _corner = new THREE.Vector3();
const _box = new THREE.Box3();

/**
 * Copies the selection next to itself: the whole group moves by its own width plus 10 cm to the
 * right of the primary artwork (as seen from in front of it), so pictures stay on their wall.
 * The copies are new instances of the same artworks (temporary ids until auto-sync creates them).
 */
export function duplicateSelection(
  instances: ArtworkInstanceData[], ids: number[], primaryId: number | null, walls: ModularWallData[],
): { instances: ArtworkInstanceData[]; copies: number[] } | null {
  const members = selectedOf(instances, ids);
  if (members.length === 0) return null;
  const primary = members.find(m => m.id === primaryId) ?? members[members.length - 1];
  _right.set(1, 0, 0).applyEuler(_euler.set(primary.rotation_x, primary.rotation_y, primary.rotation_z));
  _right.y = 0;
  if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
  _right.normalize();

  let min = Infinity;
  let max = -Infinity;
  for (const inst of members) {
    instanceWorldBounds(inst, _box);
    for (let i = 0; i < 8; i++) {
      _corner.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z);
      const d = _corner.dot(_right);
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
  }
  const shift = _right.multiplyScalar(max - min + DUPLICATE_GAP_M);
  const copies = members.map(inst => detachIfOffWall({
    ...inst,
    id: nextTempId(),
    position_x: inst.position_x + shift.x,
    position_z: inst.position_z + shift.z,
  }, walls));
  return { instances: [...instances, ...copies], copies: copies.map(c => c.id) };
}
