import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { instanceWorldBounds } from './instanceBounds';
import { BoxHitProxy } from './boxHitProxy';
import { instanceRefMap } from '@/store/editorStore';
import type { ArtworkInstanceData } from '@/store/editorStore';

const picture = (patch: Partial<ArtworkInstanceData> = {}): ArtworkInstanceData => ({
  id: 1, frameStyle: 'none', artwork: { width: 100, height: 50, asset: { path: '', width: 1000, height: 500, dpi: 72, type: 'image' } },
  position_x: 2, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1, ...patch,
});

describe('instanceWorldBounds', () => {
  it('unframed picture spans its physical size around the anchor', () => {
    const b = instanceWorldBounds(picture());
    expect(b.min.x).toBeCloseTo(1.5); expect(b.max.x).toBeCloseTo(2.5);
    expect(b.min.y).toBeCloseTo(1.25); expect(b.max.y).toBeCloseTo(1.75);
  });

  it('rotated picture swaps its width into z', () => {
    const b = instanceWorldBounds(picture({ rotation_y: Math.PI / 2 }));
    expect(b.max.z - b.min.z).toBeCloseTo(1);
    expect(b.max.x - b.min.x).toBeLessThan(0.1);
  });

  it('a frame and passepartout grow the bounds', () => {
    const plain = instanceWorldBounds(picture());
    const framed = instanceWorldBounds(picture({ frameStyle: 'alu8-silber-matt', passepartoutWidth: 10 }));
    expect(framed.max.x - framed.min.x).toBeGreaterThan(plain.max.x - plain.min.x + 0.2);
  });

  it('fallback bounds for a model that has not loaded are finite', () => {
    const b = instanceWorldBounds(picture({ id: 999, medium: 'model3d', artwork: { asset: { path: '', width: 0, height: 0, dpi: null, type: 'model3d' } } }));
    expect(Number.isFinite(b.min.x) && Number.isFinite(b.max.y)).toBe(true);
    expect(b.isEmpty()).toBe(false);
  });
});

describe('instanceWorldBounds for splats', () => {
  it('measures the hit proxy box, not the splat quad mesh', () => {
    const group = new THREE.Group();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(4, 4));
    const proxy = new BoxHitProxy();
    proxy.box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 2, 0.5));
    group.add(quad, proxy);
    group.position.set(3, 0, 0);
    instanceRefMap.set(4242, group as THREE.Group);
    const b = instanceWorldBounds(picture({ id: 4242, medium: 'splat', artwork: { asset: { path: '', width: 0, height: 0, dpi: null, type: 'splat' } } }));
    instanceRefMap.delete(4242);
    expect(b.min.x).toBeCloseTo(2.5); expect(b.max.x).toBeCloseTo(3.5);
    expect(b.max.y).toBeCloseTo(2);
  });
});
