import type * as THREE from 'three';
import { artworkMinY, isFloorAssetType, type ArtworkInstanceData, type ModularWallData, type TransformMode } from '@/store/editorStore';

/** How far beyond a wall's surface or end an artwork may sit and still count as hanging on it. */
const WALL_TOLERANCE_M = 0.15;

/**
 * Pictures, monitors and beamer projections hang on a wall and are never pulled into the room:
 * the move gizmo offers only the two axes in their own plane (local X and Y, not the normal Z).
 */
export function movesInWallPlane(inst: Pick<ArtworkInstanceData, 'medium' | 'artwork'>): boolean {
  return !isFloorAssetType(inst.medium) && !isFloorAssetType(inst.artwork?.asset?.type);
}

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

/** Books stand upright on the floor whatever a gizmo or group delta did to them. */
const uprightOnFloor = (inst: ArtworkInstanceData): ArtworkInstanceData =>
  inst.medium === 'book' ? { ...inst, position_y: 0, rotation_x: 0, rotation_z: 0 } : inst;

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
  return uprightOnFloor(mode === 'translate' ? detachIfOffWall(updated, walls) : updated);
}

/**
 * Writes a group member back after a group transform. Rotating a group moves its members too, so
 * rotate/scale write everything; a pure move writes only the position — the Euler angles read back
 * from the matrix may differ from the stored ones for the same orientation (ry = π → (π, 0, π)).
 */
export function finalizeGroupMember(
  inst: ArtworkInstanceData, object: THREE.Object3D, walls: ModularWallData[], mode: TransformMode,
): ArtworkInstanceData {
  object.position.y = Math.max(artworkMinY(inst, object.scale.y), object.position.y);
  const position = { position_x: object.position.x, position_y: object.position.y, position_z: object.position.z };
  if (mode === 'translate') return uprightOnFloor(detachIfOffWall({ ...inst, ...position }, walls));
  return uprightOnFloor(detachIfOffWall({
    ...inst,
    ...position,
    rotation_x: object.rotation.x,
    rotation_y: object.rotation.y,
    rotation_z: object.rotation.z,
    scale_x: object.scale.x,
    scale_y: object.scale.y,
    scale_z: object.scale.z,
  }, walls));
}
