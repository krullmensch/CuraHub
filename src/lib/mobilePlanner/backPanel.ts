import * as THREE from 'three';

export const BACK_PANEL_NAME = 'ArBackPanel';
/** Kraft-paper brown of a frame's back board. */
const BACK_COLOR = '#8b7a63';
/** Just behind the artwork's back face, so it never shows through from the front. */
const GAP = 0.0005;

/**
 * Closes the single-artwork AR model from behind: in Quick Look and model-viewer the picture can be
 * walked around, and without a back you'd see the photo (or nothing) through it. A plain board the
 * size of the artwork's outline, facing -Z.
 */
export function addBackPanel(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x, size.y),
    new THREE.MeshStandardMaterial({ color: BACK_COLOR, roughness: 1, metalness: 0, side: THREE.FrontSide }),
  );
  panel.name = BACK_PANEL_NAME;
  panel.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z - GAP);
  panel.rotation.y = Math.PI;
  group.add(panel);
}
