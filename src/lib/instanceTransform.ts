import type * as THREE from 'three';
import { artworkMinY, type ArtworkInstanceData, type ModularWallData, type TransformMode } from '@/store/editorStore';

/** How far beyond a wall's surface or end an artwork may sit and still count as hanging on it. */
const WALL_TOLERANCE_M = 0.15;

/** Detaches an artwork from its wall once it sits beyond the wall's thickness or width. */
export function detachIfOffWall(inst: ArtworkInstanceData, walls: ModularWallData[]): ArtworkInstanceData {
  if (!inst.wallId) return inst;
  const wall = walls.find(w => w.id === inst.wallId);
  if (!wall) return inst;
  // Distance from the artwork to the wall's centre plane, in wall-local space
  const dx = inst.position_x - wall.position_x;
  const dz = inst.position_z - wall.position_z;
  const cos = Math.cos(-wall.rotation_y);
  const sin = Math.sin(-wall.rotation_y);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const tolerance = wall.thickness / 2 + WALL_TOLERANCE_M;
  const halfW = wall.width / 2 + WALL_TOLERANCE_M;
  return Math.abs(localZ) > tolerance || Math.abs(localX) > halfW ? { ...inst, wallId: null } : inst;
}

/** Writes the transform of an artwork's group back to the instance, for the one gizmo mode used. */
export function finalizeInstanceTransform(
  inst: ArtworkInstanceData, object: THREE.Object3D, mode: TransformMode, walls: ModularWallData[],
): ArtworkInstanceData {
  // Clamp Y so the artwork bottom edge never goes below the floor
  if (mode === 'translate') object.position.y = Math.max(artworkMinY(inst, object.scale.y), object.position.y);
  const updated: ArtworkInstanceData = {
    ...inst,
    position_x: mode === 'translate' ? object.position.x : inst.position_x,
    position_y: mode === 'translate' ? object.position.y : inst.position_y,
    position_z: mode === 'translate' ? object.position.z : inst.position_z,
    rotation_x: mode === 'rotate' ? object.rotation.x : inst.rotation_x,
    rotation_y: mode === 'rotate' ? object.rotation.y : inst.rotation_y,
    rotation_z: mode === 'rotate' ? object.rotation.z : inst.rotation_z,
    scale_x: mode === 'scale' ? object.scale.x : inst.scale_x,
    scale_y: mode === 'scale' ? object.scale.y : inst.scale_y,
    scale_z: mode === 'scale' ? object.scale.z : inst.scale_z,
  };
  return mode === 'translate' ? detachIfOffWall(updated, walls) : updated;
}

/** Group transforms move, turn and scale members at once (rotation moves them too) — write all of it. */
export function finalizeGroupMember(inst: ArtworkInstanceData, object: THREE.Object3D, walls: ModularWallData[]): ArtworkInstanceData {
  object.position.y = Math.max(artworkMinY(inst, object.scale.y), object.position.y);
  return detachIfOffWall({
    ...inst,
    position_x: object.position.x,
    position_y: object.position.y,
    position_z: object.position.z,
    rotation_x: object.rotation.x,
    rotation_y: object.rotation.y,
    rotation_z: object.rotation.z,
    scale_x: object.scale.x,
    scale_y: object.scale.y,
    scale_z: object.scale.z,
  }, walls);
}
