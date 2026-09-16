import * as THREE from 'three';

// Gaussian splats ("3D Gaussian Splatting" captures) as artworks. Rendering depends on the
// backend: three.js' GaussianSplat on WebGPU (./webgpuSupport), Spark on the WebGL fallback
// (./sparkSupport). Everything here is shared by both.

export type SplatFormat = 'ply' | 'spz' | 'splat' | 'ksplat';

export function splatFormatFromPath(path: string): SplatFormat | null {
    const ext = path.split('?')[0].split('.').pop()?.toLowerCase();
    return ext === 'ply' || ext === 'spz' || ext === 'splat' || ext === 'ksplat' ? ext : null;
}

/**
 * Splat captures are almost always stored in the camera convention of the training tools
 * (OpenCV: +Y down, +Z forward). Turning them half way around X makes them upright in three.js.
 */
export const SPLAT_UP_FLIP: [number, number, number] = [Math.PI, 0, 0];

/**
 * Robust bounds of the splat centers after SPLAT_UP_FLIP, in the file's units. Percentiles
 * instead of min/max: captures carry floaters far outside the actual object.
 */
export interface SplatFrame {
    min: [number, number, number];
    max: [number, number, number];
    count: number;
}

const FRAME_SAMPLES = 200_000;
const FRAME_LOW = 0.01;
const FRAME_HIGH = 0.99;

/**
 * `centerAt(i, out)` writes the (unflipped) center of splat i. Samples at most FRAME_SAMPLES
 * splats evenly, so millions of splats stay cheap.
 */
export function computeSplatFrame(count: number, centerAt: (index: number, out: [number, number, number]) => void): SplatFrame {
    if (count === 0) return { min: [0, 0, 0], max: [0, 0, 0], count };
    const step = Math.max(1, Math.floor(count / FRAME_SAMPLES));
    const samples = Math.ceil(count / step);
    const xs = new Float32Array(samples);
    const ys = new Float32Array(samples);
    const zs = new Float32Array(samples);
    const c: [number, number, number] = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < count && n < samples; i += step, n++) {
        centerAt(i, c);
        // SPLAT_UP_FLIP: (x, y, z) → (x, -y, -z)
        xs[n] = c[0];
        ys[n] = -c[1];
        zs[n] = -c[2];
    }
    const pick = (values: Float32Array, q: number) => values[Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))))];
    const sorted = [xs.subarray(0, n).sort(), ys.subarray(0, n).sort(), zs.subarray(0, n).sort()];
    return {
        min: [pick(sorted[0], FRAME_LOW), pick(sorted[1], FRAME_LOW), pick(sorted[2], FRAME_LOW)],
        max: [pick(sorted[0], FRAME_HIGH), pick(sorted[1], FRAME_HIGH), pick(sorted[2], FRAME_HIGH)],
        count,
    };
}

/**
 * Offset that puts the frame's floor center at the instance origin (like a 3D model standing on
 * the floor), and the frame's size.
 */
export function splatAnchor(frame: SplatFrame): { offset: [number, number, number]; size: THREE.Vector3 } {
    const [minX, minY, minZ] = frame.min;
    const [maxX, maxY, maxZ] = frame.max;
    return {
        offset: [-(minX + maxX) / 2, -minY, -(minZ + maxZ) / 2],
        size: new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ),
    };
}

const _inverse = new THREE.Matrix4();
const _ray = new THREE.Ray();
const _point = new THREE.Vector3();

/**
 * Invisible Object3D that answers raycasts with a box (in its local space). Clicking and the
 * first-person info raycast test this box instead of millions of splats; R3F raycasts every
 * pointer move. Rays starting inside the box don't hit — a room-sized capture would otherwise
 * swallow every click made from within it.
 */
export class SplatHitProxy extends THREE.Object3D {
    readonly box = new THREE.Box3();

    constructor() {
        super();
        this.name = 'SplatHitProxy';
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

/** A loaded splat, ready to be added below the SPLAT_UP_FLIP group. */
export interface SplatHandle {
    object: THREE.Object3D;
    frame: SplatFrame;
    dispose(): void;
}

export interface SplatLoadContext {
    url: string;
    gl: THREE.WebGLRenderer;
    scene: THREE.Scene;
    invalidate: () => void;
}

const noRaycast = () => {};
const SPLAT_FLAG = 'curahubSplat';

/**
 * Hides all splats in `scene` until the returned function is called. For offscreen captures
 * (window glass reflection): three.js' GaussianSplat sizes splats by the canvas viewport and
 * smears them across render targets, and Spark would re-sort once per cube face.
 */
export function hideSplats(scene: THREE.Object3D): () => void {
    const hidden: THREE.Object3D[] = [];
    scene.traverse((object) => {
        if (object.userData[SPLAT_FLAG] && object.visible) {
            object.visible = false;
            hidden.push(object);
        }
    });
    return () => hidden.forEach((object) => { object.visible = true; });
}

/** Picks the renderer-specific splat implementation for the Canvas' renderer. */
export async function loadSplat(context: SplatLoadContext): Promise<SplatHandle> {
    const manager = THREE.DefaultLoadingManager; // drei's useProgress (loading overlays) follows it
    manager.itemStart(context.url);
    try {
        const isWebGPU = (context.gl as unknown as { isWebGPURenderer?: boolean }).isWebGPURenderer === true;
        const handle = isWebGPU
            ? await (await import('./webgpuSupport')).loadGaussianSplat(context.url)
            : await (await import('./sparkSupport')).loadSparkSplat(context);
        handle.object.raycast = noRaycast;
        handle.object.userData[SPLAT_FLAG] = true;
        return handle;
    } catch (err) {
        manager.itemError(context.url);
        throw err;
    } finally {
        manager.itemEnd(context.url);
    }
}
