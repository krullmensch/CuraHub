import * as THREE from 'three';

const _inverse = new THREE.Matrix4();
const _ray = new THREE.Ray();
const _point = new THREE.Vector3();

/**
 * Invisible Object3D that answers raycasts with a box (in its local space). Splats and books use
 * it: clicks and the first-person raycast test this box instead of the real geometry (millions of
 * splats; a book only a few millimetres thick). Rays starting inside the box don't hit — a
 * room-sized capture would otherwise swallow every click made from within it.
 */
export class BoxHitProxy extends THREE.Object3D {
    readonly box = new THREE.Box3();

    constructor() {
        super();
        this.name = 'BoxHitProxy';
    }

    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
        if (this.box.isEmpty()) return;
        _inverse.copy(this.matrixWorld).invert();
        _ray.copy(raycaster.ray).applyMatrix4(_inverse);
        if (this.box.containsPoint(_ray.origin)) return;
        if (!_ray.intersectBox(this.box, _point)) return;
        _point.applyMatrix4(this.matrixWorld);
        const distance = raycaster.ray.origin.distanceTo(_point);
        if (distance < raycaster.near || distance > raycaster.far) return;
        intersects.push({ distance, point: _point.clone(), object: this });
    }
}
