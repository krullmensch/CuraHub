import * as THREE from 'three';

/** Screen rectangle in pixels, origin top-left. */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const _corner = new THREE.Vector3();
const _view = new THREE.Vector3();

/**
 * Screen rectangle covered by a world box, or null if the box lies entirely behind the camera.
 * Corners behind the camera are left out (their projection would flip to the other side).
 */
export function screenRectOfBox(box: THREE.Box3, camera: THREE.Camera, viewport: { width: number; height: number }): ScreenRect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    _corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    _view.copy(_corner).applyMatrix4(camera.matrixWorldInverse);
    if (_view.z >= 0) continue;
    _corner.project(camera);
    const sx = ((_corner.x + 1) / 2) * viewport.width;
    const sy = ((1 - _corner.y) / 2) * viewport.height;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export const rectsOverlap = (a: ScreenRect, b: ScreenRect): boolean =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
