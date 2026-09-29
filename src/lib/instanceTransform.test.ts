import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { detachIfOffWall, finalizeGroupMember, finalizeInstanceTransform, movesInWallPlane } from './instanceTransform';
import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';

const wall: ModularWallData = {
  id: 1, position_x: 0, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  width: 4, height: 3, thickness: 0.1, color: '#fff', isLocked: false,
};
const pic = (patch: Partial<ArtworkInstanceData> = {}): ArtworkInstanceData => ({
  id: 1, wallId: 1, artwork: { width: 100, height: 100, asset: { path: '', width: 100, height: 100, dpi: 72, type: 'image' } },
  position_x: 0, position_y: 1.5, position_z: 0.06, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1, ...patch,
});

describe('detachIfOffWall', () => {
  it('keeps an artwork on its wall', () => {
    expect(detachIfOffWall(pic(), [wall]).wallId).toBe(1);
  });
  it('detaches an artwork moved away from the wall', () => {
    expect(detachIfOffWall(pic({ position_z: 1 }), [wall]).wallId).toBeNull();
  });
  it('detaches an artwork moved past the wall end', () => {
    expect(detachIfOffWall(pic({ position_x: 3 }), [wall]).wallId).toBeNull();
  });
});

describe('finalizeInstanceTransform', () => {
  it('translate writes only the position and clamps to the floor', () => {
    const object = new THREE.Object3D();
    object.position.set(0.5, 0.1, 0.06);
    object.rotation.set(0, 1, 0);
    const out = finalizeInstanceTransform(pic(), object, 'translate', [wall]);
    expect(out.position_x).toBeCloseTo(0.5);
    expect(out.position_y).toBeCloseTo(0.5); // half of 1 m height
    expect(out.rotation_y).toBe(0);
  });
});

describe('finalizeGroupMember', () => {
  it('writes position, rotation and scale at once', () => {
    const object = new THREE.Object3D();
    object.position.set(0.2, 1.4, 0.06);
    object.rotation.set(0, 0.3, 0);
    object.scale.set(2, 2, 2);
    const out = finalizeGroupMember(pic(), object, [wall], 'rotate');
    expect(out.position_x).toBeCloseTo(0.2);
    expect(out.rotation_y).toBeCloseTo(0.3);
    expect(out.scale_x).toBe(2);
    expect(out.position_y).toBeCloseTo(1.4);
  });
});

describe('finalizeGroupMember translate', () => {
  it('writes only the position, so turned pictures keep their stored rotation', () => {
    const object = new THREE.Object3D();
    object.position.set(0.3, 1.5, 0.06);
    object.rotation.set(Math.PI, 0, Math.PI); // same orientation as rotation_y = π, other Euler
    const out = finalizeGroupMember(pic({ rotation_y: Math.PI }), object, [wall], 'translate');
    expect(out.position_x).toBeCloseTo(0.3);
    expect(out.rotation_x).toBe(0);
    expect(out.rotation_y).toBe(Math.PI);
    expect(out.scale_x).toBe(1);
  });
});

describe('movesInWallPlane', () => {
  it('keeps pictures, monitors and beamer projections on their wall', () => {
    expect(movesInWallPlane(pic())).toBe(true);
    expect(movesInWallPlane(pic({ medium: 'monitor' }))).toBe(true);
    expect(movesInWallPlane(pic({ medium: 'beamer' }))).toBe(true);
  });
  it('lets floor objects move freely', () => {
    expect(movesInWallPlane(pic({ medium: 'model3d' }))).toBe(false);
    const splat = pic({ medium: 'splat' });
    expect(movesInWallPlane({ ...splat, artwork: { ...splat.artwork, asset: { ...splat.artwork.asset, type: 'splat' } } })).toBe(false);
  });
});

describe('books stay upright on the floor', () => {
  const book = (patch: Partial<ArtworkInstanceData> = {}) => pic({
    id: 2, wallId: null, medium: 'book', position_y: 0, position_z: 1, rotation_y: 0.4,
    artwork: { width: 21, height: 30, asset: { path: '', width: 1, height: 1, dpi: 72, type: 'book' } }, ...patch,
  });

  it('after a group rotation about X', () => {
    const object = new THREE.Object3D();
    object.position.set(0.5, 0.8, 1);
    object.rotation.set(0.6, 0.4, 0.2);
    const out = finalizeGroupMember(book(), object, [], 'rotate');
    expect(out.rotation_x).toBe(0);
    expect(out.rotation_z).toBe(0);
    // yaw of a tilted object is its YXZ yaw
    expect(out.rotation_y).toBeCloseTo(new THREE.Euler().setFromQuaternion(object.quaternion, 'YXZ').y);
    expect(out.position_y).toBe(0);
    expect(out.position_x).toBeCloseTo(0.5);
    // a picture in the same group still gets the delta
    const picObject = new THREE.Object3D();
    picObject.position.set(0.5, 1.8, 0.06);
    picObject.rotation.set(0.6, 0, 0);
    const picOut = finalizeGroupMember(pic(), picObject, [wall], 'rotate');
    expect(picOut.rotation_x).toBeCloseTo(0.6);
  });

  it.each([2.0, -2.5, 3.0])('keeps a yaw beyond ±90° (%s rad) after a rotate commit', (yaw) => {
    const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const object = new THREE.Object3D();
    object.position.set(0.5, 0, 1);
    object.rotation.y = yaw;
    // The XYZ Euler of a yaw beyond π/2 reads back as (π, y, π), the failure the guard must survive.
    object.rotation.setFromQuaternion(object.quaternion);
    const group = finalizeGroupMember(book(), object, [], 'rotate');
    const single = finalizeInstanceTransform(book(), object, 'rotate', []);
    for (const out of [group, single]) {
      expect(out.rotation_x).toBe(0);
      expect(out.rotation_z).toBe(0);
      expect(angleDiff(out.rotation_y, yaw)).toBeLessThan(1e-6);
    }
  });

  it('after a group move with dy > 0', () => {
    const object = new THREE.Object3D();
    object.position.set(0.5, 0.3, 1);
    expect(finalizeGroupMember(book(), object, [], 'translate').position_y).toBe(0);
    const picObject = new THREE.Object3D();
    picObject.position.set(0.5, 1.8, 0.06);
    expect(finalizeGroupMember(pic(), picObject, [wall], 'translate').position_y).toBeCloseTo(1.8);
  });

  it('after a single-object gizmo commit', () => {
    const object = new THREE.Object3D();
    object.position.set(0.5, 0.3, 1);
    object.rotation.set(0.5, 0.4, 0.5);
    expect(finalizeInstanceTransform(book(), object, 'translate', []).position_y).toBe(0);
    const rotated = finalizeInstanceTransform(book(), object, 'rotate', []);
    expect(rotated.rotation_x).toBe(0);
    expect(rotated.rotation_z).toBe(0);
    expect(rotated.rotation_y).toBeCloseTo(new THREE.Euler().setFromQuaternion(object.quaternion, 'YXZ').y);
  });
});
