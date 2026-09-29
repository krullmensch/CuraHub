import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyGroupDelta, floorDeltaLimit } from './selectionTransform';

const m = (x: number, y: number, z: number, rotY = 0, s = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(s, s, s),
  );
const pos = (mat: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(mat);

describe('applyGroupDelta', () => {
  it('translate moves every member by the pivot delta', () => {
    const out = applyGroupDelta(m(1, 1.5, 0), m(0, 1.5, 0), m(2, 1.5, 3), 'translate', new THREE.Matrix4());
    const p = pos(out);
    expect(p.x).toBeCloseTo(3); expect(p.y).toBeCloseTo(1.5); expect(p.z).toBeCloseTo(3);
  });

  it('rotate turns members around the pivot and turns them too', () => {
    const out = applyGroupDelta(m(1, 0, 0), m(0, 0, 0), m(0, 0, 0, Math.PI / 2), 'rotate', new THREE.Matrix4());
    const p = pos(out);
    expect(p.x).toBeCloseTo(0); expect(p.z).toBeCloseTo(-1);
    const q = new THREE.Quaternion();
    out.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    expect(new THREE.Euler().setFromQuaternion(q).y).toBeCloseTo(Math.PI / 2);
  });

  it('scale scales each member about its own centre and keeps positions', () => {
    const out = applyGroupDelta(m(1, 1, 0), m(0, 1, 0), m(0, 1, 0, 0, 2), 'scale', new THREE.Matrix4());
    const s = new THREE.Vector3();
    out.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    expect(s.x).toBeCloseTo(2);
    expect(pos(out).x).toBeCloseTo(1);
  });
});

describe('floorDeltaLimit', () => {
  it('is the largest downward move that keeps every member above its minimum', () => {
    expect(floorDeltaLimit([1.0, 0.8], [1.5, 1.0])).toBeCloseTo(-0.2);
  });
  it('is 0 when a member already sits at its minimum', () => {
    expect(floorDeltaLimit([0.5], [0.5])).toBe(0);
  });
});
