import * as THREE from 'three';
import type { TransformMode } from '@/store/editorStore';

const _inverse = new THREE.Matrix4();
const _delta = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _pivotStartScale = new THREE.Vector3();
const _pivotNowScale = new THREE.Vector3();

const ratio = (now: number, start: number) => (Math.abs(start) > 1e-9 ? now / start : 1);

/**
 * World matrix of a group member after the pivot moved from `pivotStart` to `pivotNow`.
 * translate/rotate carry the member rigidly with the pivot (the arrangement keeps its shape);
 * scale multiplies each member's own scale by the pivot's scale factor and leaves positions —
 * otherwise pictures would wander off their walls.
 */
export function applyGroupDelta(
  start: THREE.Matrix4,
  pivotStart: THREE.Matrix4,
  pivotNow: THREE.Matrix4,
  mode: TransformMode,
  out: THREE.Matrix4,
): THREE.Matrix4 {
  if (mode === 'scale') {
    pivotStart.decompose(_position, _quaternion, _pivotStartScale);
    pivotNow.decompose(_position, _quaternion, _pivotNowScale);
    start.decompose(_position, _quaternion, _scale);
    _scale.set(
      _scale.x * ratio(_pivotNowScale.x, _pivotStartScale.x),
      _scale.y * ratio(_pivotNowScale.y, _pivotStartScale.y),
      _scale.z * ratio(_pivotNowScale.z, _pivotStartScale.z),
    );
    return out.compose(_position, _quaternion, _scale);
  }
  _delta.multiplyMatrices(pivotNow, _inverse.copy(pivotStart).invert());
  return out.multiplyMatrices(_delta, start);
}

/**
 * Lowest allowed vertical delta for a rigid group: `minYs[i]` is the lowest centre height member
 * i may have (artworkMinY), `ys[i]` its height at the start of the drag. Returns a value ≤ 0.
 */
export function floorDeltaLimit(minYs: number[], ys: number[]): number {
  let limit = -Infinity;
  for (let i = 0; i < ys.length; i++) limit = Math.max(limit, minYs[i] - ys[i]);
  return Math.min(0, limit);
}
