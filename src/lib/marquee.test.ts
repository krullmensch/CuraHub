import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { rectsOverlap, screenRectOfBox } from './marquee';

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 0, 5);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

describe('screenRectOfBox', () => {
  it('projects a box in front of the camera to the screen centre', () => {
    const box = new THREE.Box3(new THREE.Vector3(-0.1, -0.1, 0), new THREE.Vector3(0.1, 0.1, 0));
    const r = screenRectOfBox(box, camera, { width: 1000, height: 1000 })!;
    expect(r.x + r.w / 2).toBeCloseTo(500, 0);
    expect(r.y + r.h / 2).toBeCloseTo(500, 0);
  });

  it('returns null for a box behind the camera', () => {
    const box = new THREE.Box3(new THREE.Vector3(-1, -1, 6), new THREE.Vector3(1, 1, 7));
    expect(screenRectOfBox(box, camera, { width: 1000, height: 1000 })).toBeNull();
  });
});

describe('rectsOverlap', () => {
  it('detects overlap and separation', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
  });
});
