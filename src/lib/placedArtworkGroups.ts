import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { resolveFace, targetForInstance, targetKey } from './wallEditor/faces';
import { worldToWall } from './wallEditor/geometry';
import type { RoomFace } from './wallEditor/roomFaces';

export interface PlacedArtworkGroup {
  /** Face key (see targetKey), or 'free' for artworks on no wall. */
  key: string;
  label: string;
  /** Artwork ids, left to right along the face (free artworks by id). */
  ids: number[];
}

export const FREE_GROUP_KEY = 'free';

/**
 * The placed artworks by the wall face they hang on — modular walls first (by label), then the
 * room walls in the model's order, artworks standing free in the room last.
 */
export function groupPlacedArtworks(
  instances: ArtworkInstanceData[], walls: ModularWallData[], roomFaces: RoomFace[],
): PlacedArtworkGroup[] {
  const faces = new Map<string, { label: string; rank: string; items: { id: number; u: number }[] }>();
  const free: number[] = [];
  for (const inst of instances) {
    const target = targetForInstance(inst, walls, roomFaces);
    const face = target ? resolveFace(target, walls, roomFaces) : null;
    if (!target || !face) {
      free.push(inst.id);
      continue;
    }
    const key = targetKey(target);
    let group = faces.get(key);
    if (!group) {
      const rank = target.kind === 'wall'
        ? `0:${face.label}`
        : `1:${String(roomFaces.findIndex((r) => r.id === target.faceId)).padStart(4, '0')}`;
      group = { label: face.label, rank, items: [] };
      faces.set(key, group);
    }
    group.items.push({ id: inst.id, u: worldToWall(face.frame, { x: inst.position_x, y: inst.position_y, z: inst.position_z }).u });
  }
  const groups: PlacedArtworkGroup[] = [...faces.entries()]
    .sort(([, a], [, b]) => a.rank.localeCompare(b.rank, 'de'))
    .map(([key, group]) => ({ key, label: group.label, ids: group.items.sort((a, b) => a.u - b.u).map((item) => item.id) }));
  if (free.length > 0) groups.push({ key: FREE_GROUP_KEY, label: 'Frei im Raum', ids: free.sort((a, b) => a - b) });
  return groups;
}

/** ⇧-click in a list: everything from the anchor to `id` (inclusive, list order), or just `id`. */
export function rangeSelection(order: number[], anchor: number | null, id: number): number[] {
  const from = anchor === null ? -1 : order.indexOf(anchor);
  const to = order.indexOf(id);
  if (from < 0 || to < 0) return [id];
  return from <= to ? order.slice(from, to + 1) : order.slice(to, from + 1);
}
