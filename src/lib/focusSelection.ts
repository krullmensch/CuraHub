import * as THREE from 'three';
import { useEditorStore, type ModularWallData } from '@/store/editorStore';
import { instanceWorldBounds } from './instanceBounds';
import { cameraInfoBridge } from './cameraInfoBridge';
import { boundsFocus, focusDistance } from './focusFraming';
import { SCALE_FIGURE_HEIGHT } from './scaleFigure';

const FIGURE_HALF_SPAN_M = 0.3;
const DEFAULT_FOV = 60;
const DEFAULT_ASPECT = 16 / 9;

/** World AABB of a modular wall (its oriented box, rotated). */
export function wallWorldBox(wall: ModularWallData): THREE.Box3 {
  const box = new THREE.Box3(
    new THREE.Vector3(-wall.width / 2, -wall.height / 2, -wall.thickness / 2),
    new THREE.Vector3(wall.width / 2, wall.height / 2, wall.thickness / 2),
  );
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(wall.position_x, wall.position_y, wall.position_z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(wall.rotation_x, wall.rotation_y, wall.rotation_z)),
    new THREE.Vector3(1, 1, 1),
  );
  return box.applyMatrix4(matrix);
}

/**
 * Points the orbit camera at the current selection (artworks, wall or scale figure), at a distance
 * that frames its bounds. Returns false when nothing is selected.
 */
export function focusSelection(): boolean {
  const store = useEditorStore.getState();
  const box = new THREE.Box3();

  if (store.selectedInstanceIds.length > 0) {
    const ids = new Set(store.selectedInstanceIds);
    const part = new THREE.Box3();
    for (const inst of store.localInstances) {
      if (ids.has(inst.id)) box.union(instanceWorldBounds(inst, part));
    }
  } else if (store.selectedWallId !== null) {
    const wall = store.localWalls.find((w) => w.id === store.selectedWallId);
    if (wall) box.copy(wallWorldBox(wall));
  } else if (store.selectedFigureId !== null) {
    const figure = store.localScaleFigures.find((f) => f.id === store.selectedFigureId);
    if (figure) {
      box.set(
        new THREE.Vector3(figure.position_x - FIGURE_HALF_SPAN_M, 0, figure.position_z - FIGURE_HALF_SPAN_M),
        new THREE.Vector3(figure.position_x + FIGURE_HALF_SPAN_M, SCALE_FIGURE_HEIGHT, figure.position_z + FIGURE_HALF_SPAN_M),
      );
    }
  }

  if (box.isEmpty()) return false;
  const { center, radius } = boundsFocus({ min: box.min.toArray(), max: box.max.toArray() });
  const info = cameraInfoBridge.get?.() ?? { fov: DEFAULT_FOV, aspect: DEFAULT_ASPECT };
  store.setFocusTarget({
    target: center,
    distance: focusDistance(radius, info.fov, info.aspect),
    isHoming: false,
  });
  return true;
}
