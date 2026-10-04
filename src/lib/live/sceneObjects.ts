import type * as THREE from 'three';
import { instanceRefMap } from '../../store/editorStore';

/**
 * The Three.js groups of claimable objects by claim key: artworks come from `instanceRefMap`,
 * modular walls and scale figures register here (ModularWallsController, ScaleFigures). Used to
 * send this tab's live drags and to show other tabs' drags and selections.
 */

const walls = new Map<number, THREE.Object3D>();
const figures = new Map<number, THREE.Object3D>();

const register = (map: Map<number, THREE.Object3D>, id: number, object: THREE.Object3D | null) => {
  if (object) map.set(id, object);
  else if (map.get(id)) map.delete(id);
};

export const registerWallObject = (id: number, object: THREE.Object3D | null) => register(walls, id, object);
export const registerFigureObject = (id: number, object: THREE.Object3D | null) => register(figures, id, object);

export function objectForKey(key: string): THREE.Object3D | undefined {
  const sep = key.indexOf(':');
  const kind = key.slice(0, sep);
  const id = Number(key.slice(sep + 1));
  if (kind === 'instance') return instanceRefMap.get(id);
  if (kind === 'wall') return walls.get(id);
  if (kind === 'figure') return figures.get(id);
  return undefined;
}
