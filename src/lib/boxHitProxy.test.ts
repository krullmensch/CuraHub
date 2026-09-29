import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BoxHitProxy } from './boxHitProxy';

const cast = (proxy: THREE.Object3D, origin: [number, number, number], dir: [number, number, number]) => {
  const raycaster = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...dir).normalize());
  return raycaster.intersectObject(proxy, false);
};

describe('BoxHitProxy', () => {
  it('answers rays with its box, in world space', () => {
    const proxy = new BoxHitProxy();
    proxy.box.set(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0.05, 0.1));
    proxy.position.set(0, 1.2, 0);
    proxy.updateMatrixWorld();
    const hits = cast(proxy, [0, 1.62, 1], [0, -0.42, -1]);
    expect(hits).toHaveLength(1);
    // The ray enters through the front face (z = 0.1) at y = 1.62 − 0.42 × 0.9 = 1.242, in world space.
    expect(hits[0].point.z).toBeCloseTo(0.1, 3);
    expect(hits[0].point.y).toBeCloseTo(1.242, 3);
  });
  it('ignores rays that start inside the box and empty boxes', () => {
    const proxy = new BoxHitProxy();
    expect(cast(proxy, [0, 0, 5], [0, 0, -1])).toHaveLength(0);
    proxy.box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    proxy.updateMatrixWorld();
    expect(cast(proxy, [0, 0, 0], [0, 0, -1])).toHaveLength(0);
  });
});
