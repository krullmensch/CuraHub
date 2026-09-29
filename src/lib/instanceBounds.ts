import * as THREE from 'three';
import { instanceRefMap, isFloorAssetType, type ArtworkInstanceData } from '@/store/editorStore';
import { artworkFrameLayout, baseArtworkSize } from './wallEditor/footprint';
import { BoxHitProxy } from './boxHitProxy';

/** Side length used while nothing better is known (model not loaded, no pixel size). */
const FALLBACK_SIZE_M = 0.5;
/** Depth of a picture in front of its anchor: the deepest frame profiles are ~30 mm. */
const PICTURE_FRONT_M = 0.04;
const PICTURE_BACK_M = 0.01;

const _local = new THREE.Box3();
const _box = new THREE.Box3();
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

function instanceMatrix(inst: ArtworkInstanceData, withScale: boolean): THREE.Matrix4 {
  _position.set(inst.position_x, inst.position_y, inst.position_z);
  _quaternion.setFromEuler(_euler.set(inst.rotation_x, inst.rotation_y, inst.rotation_z));
  if (withScale) _scale.set(inst.scale_x, inst.scale_y, inst.scale_z);
  else _scale.set(1, 1, 1);
  return _matrix.compose(_position, _quaternion, _scale);
}

/**
 * World bounds of the meshes below an artwork's group (frames are drawn instanced elsewhere).
 * A splat's meshes say nothing about its extent (WebGPU draws it as a ±2 m instanced quad) — its
 * hit proxy carries the robust bounds of the capture. A book's proxy (`bookHitProxy`) covers only
 * the book, so books are measured from their meshes (pedestal included).
 */
function measuredBounds(id: number, target: THREE.Box3): THREE.Box3 | null {
  const group = instanceRefMap.get(id);
  if (!group) return null;
  group.updateWorldMatrix(true, true);
  let proxy: BoxHitProxy | null = null;
  group.traverse((object) => {
    if (!proxy && object instanceof BoxHitProxy && !object.userData.bookHitProxy && !object.box.isEmpty()) proxy = object;
  });
  if (proxy) {
    const hit: BoxHitProxy = proxy;
    return target.copy(hit.box).applyMatrix4(hit.matrixWorld);
  }
  target.makeEmpty();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || object.userData.wallEditorIgnore) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb || bb.isEmpty()) return;
    target.union(_box.copy(bb).applyMatrix4(mesh.matrixWorld));
  });
  return target.isEmpty() ? null : target;
}

/**
 * World-space bounds of a placed artwork — frame and passepartout included for pictures (computed
 * from data, like the 2D editor's footprint), measured from the meshes for everything else. Never
 * empty: an artwork that has not loaded yet gets a box of its nominal size.
 */
export function instanceWorldBounds(inst: ArtworkInstanceData, target = new THREE.Box3()): THREE.Box3 {
  const type = inst.artwork.asset.type ?? 'image';
  if (type === 'image' && inst.medium !== 'monitor') {
    const { left, right, bottom, top } = artworkFrameLayout(inst);
    _local.min.set(left, bottom, -PICTURE_BACK_M);
    _local.max.set(right, top, PICTURE_FRONT_M);
    return target.copy(_local).applyMatrix4(instanceMatrix(inst, false));
  }

  if (measuredBounds(inst.id, target)) return target;

  // Floor objects (models, splats) stand on their anchor; wall media hang centred on it.
  const floor = isFloorAssetType(type) || isFloorAssetType(inst.medium);
  const base = floor ? { w: 1, h: 1 } : baseArtworkSize(inst);
  const w = base.w || FALLBACK_SIZE_M;
  const h = base.h || FALLBACK_SIZE_M;
  if (floor) {
    _local.min.set(-w / 2, 0, -w / 2);
    _local.max.set(w / 2, h, w / 2);
  } else {
    _local.min.set(-w / 2, -h / 2, -PICTURE_BACK_M);
    _local.max.set(w / 2, h / 2, PICTURE_FRONT_M);
  }
  return target.copy(_local).applyMatrix4(instanceMatrix(inst, true));
}
