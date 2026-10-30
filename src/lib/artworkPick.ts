import * as THREE from 'three';

/** Default reach of the first-person artwork pick (metres). */
export const ARTWORK_PICK_DISTANCE = 12;
// Surfaces that can hide an artwork: the room's wall mesh and modular walls.
const OCCLUDER_NAMES = new Set(['Wall', 'ModularWall']);

export interface ArtworkPick {
  /** The ancestor carrying `userData.artworkInfo`. */
  group: THREE.Object3D;
  hit: THREE.Intersection;
  instanceId: number;
  info: unknown;
}

/** Walk ancestors to find a group carrying artworkInfo userData. */
export function findArtworkAncestor(obj: THREE.Object3D | null): THREE.Object3D | null {
  while (obj) {
    if (obj.userData.artworkInfo) return obj;
    obj = obj.parent;
  }
  return null;
}

/** Meshes that can hide an artwork (room wall, modular walls). */
export function collectOccluders(scene: THREE.Object3D): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh && OCCLUDER_NAMES.has(obj.name)) found.push(obj);
  });
  return found;
}

/**
 * The artwork under a screen point (NDC, centre = 0,0) — shared by the desktop crosshair (centre)
 * and the touch viewer's tap. Artworks first (a few dozen small meshes instead of the whole room),
 * then only walls in front of the hit count as occluders.
 */
export function pickArtworkAt(
  ndc: { x: number; y: number },
  camera: THREE.Camera,
  artworkRoots: THREE.Object3D[],
  occluders: THREE.Object3D[],
  raycaster: THREE.Raycaster = new THREE.Raycaster(),
  maxDistance = ARTWORK_PICK_DISTANCE,
): ArtworkPick | null {
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  raycaster.near = 0;
  raycaster.far = maxDistance;

  let group: THREE.Object3D | null = null;
  let firstHit: THREE.Intersection | null = null;
  for (const hit of raycaster.intersectObjects(artworkRoots, true)) {
    if (!hit.object.visible) continue;
    group = findArtworkAncestor(hit.object);
    firstHit = hit;
    break;
  }
  if (!group || !firstHit) return null;

  raycaster.far = firstHit.distance;
  const blocked = raycaster.intersectObjects(occluders, false).some((hit) => hit.object.visible);
  raycaster.far = maxDistance;
  if (blocked) return null;

  return { group, hit: firstHit, instanceId: group.userData.instanceId as number, info: group.userData.artworkInfo };
}
