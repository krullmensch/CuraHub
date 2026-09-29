import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { detachIfOffWall, finalizeGroupMember, finalizeInstanceTransform } from './instanceTransform';
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
