import * as THREE from 'three';
import type { Vec3 } from './protocol';

/**
 * This tab's camera, written every frame by LiveCameraReporter (inside the Canvas) and read by
 * the pose sender outside it. yaw/pitch as Euler 'YXZ' (yaw 0 looks along −Z).
 */

export interface CameraPose { p: Vec3; yaw: number; pitch: number }

let latest: CameraPose | null = null;
const _euler = new THREE.Euler();

export function reportCamera(camera: THREE.Camera): void {
  _euler.setFromQuaternion(camera.quaternion, 'YXZ');
  latest = { p: [camera.position.x, camera.position.y, camera.position.z], yaw: _euler.y, pitch: _euler.x };
}

export function clearCameraPose(): void {
  latest = null;
}

export const currentCameraPose = (): CameraPose | null => latest;

/** Worth sending: moved more than 2 cm or turned more than ~0.6°. */
export function poseMoved(a: CameraPose | null, b: CameraPose): boolean {
  if (!a) return true;
  const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]);
  return d > 0.02 || Math.abs(a.yaw - b.yaw) > 0.01 || Math.abs(a.pitch - b.pitch) > 0.01;
}
