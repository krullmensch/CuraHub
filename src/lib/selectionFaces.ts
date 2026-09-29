import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { targetForInstance, targetKey, type WallEditorTarget } from './wallEditor/faces';
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
