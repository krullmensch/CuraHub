import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { instanceOnFace, resolveFace, targetForInstance, targetKey, type WallEditorTarget } from './wallEditor/faces';
import type { RoomFace } from './wallEditor/roomFaces';

/** The wall face every artwork hangs on, or null when they are spread over several (or none). */
export function commonFaceTarget(
  instances: ArtworkInstanceData[], walls: ModularWallData[], roomFaces: RoomFace[],
): WallEditorTarget | null {
  let common: WallEditorTarget | null = null;
  for (const inst of instances) {
    const target = targetForInstance(inst, walls, roomFaces);
    if (!target) return null;
    if (common && targetKey(common) !== targetKey(target)) return null;
    common = target;
  }
  return common;
}

/** The selected artworks that hang on a face — what the 2D editor starts with when it opens it. */
export function selectionOnFace(
  target: WallEditorTarget, instances: ArtworkInstanceData[], selectedIds: number[], walls: ModularWallData[], roomFaces: RoomFace[],
): number[] {
  const face = resolveFace(target, walls, roomFaces);
  if (!face) return [];
  return instances.filter(inst => selectedIds.includes(inst.id) && instanceOnFace(inst, face)).map(inst => inst.id);
}
