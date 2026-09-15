// Shared offscreen thumbnail renderer for GLB/GLTF asset cards.
//
// RND-09 (docs/performance-audit-2026-09-13.md): ModelPreviewCard used to mount
// one <Canvas> (= one WebGL context) per card and never unmounted it. Chrome
// caps active WebGL contexts at ~16; beyond that the main editor canvas loses
// its context. This module renders thumbnails through a single, lazily
// created THREE.WebGLRenderer with a serial render queue and an in-memory LRU
// cache of object URLs, so the asset browser never opens more than one extra
// WebGL context regardless of how many model cards exist.
//
// Draco: the server Draco-compresses uploaded GLBs (`server/src/routes/upload.ts` optimizeGLB ->
// `draco()`). The decoder is served same-origin from `public/draco/gltf/` (copied from
// `node_modules/three/examples/jsm/libs/draco/gltf/`), so no request goes to www.gstatic.com.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const CACHE_LIMIT = 100;

interface CacheEntry {
    blobUrl: string;
    lastUsed: number;
}

interface QueueItem {
    url: string;
    size: number;
    resolve: (blobUrl: string) => void;
    reject: (err: unknown) => void;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();
const queue: QueueItem[] = [];
let processing = false;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let envTexture: THREE.Texture | null = null;
let loader: GLTFLoader | null = null;
let dracoLoader: DRACOLoader | null = null;
let contextLost = false;

function touchCache(url: string, blobUrl: string) {
    cache.set(url, { blobUrl, lastUsed: performance.now() });
    if (cache.size > CACHE_LIMIT) {
        let oldestUrl: string | null = null;
        let oldestTime = Infinity;
        for (const [key, entry] of cache) {
            if (entry.lastUsed < oldestTime) {
                oldestTime = entry.lastUsed;
                oldestUrl = key;
            }
        }
        if (oldestUrl) {
            const evicted = cache.get(oldestUrl);
            cache.delete(oldestUrl);
            if (evicted) URL.revokeObjectURL(evicted.blobUrl);
        }
    }
}

function ensureRenderer(): {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    envTexture: THREE.Texture;
    loader: GLTFLoader;
} {
    if (renderer && !contextLost && scene && camera && envTexture && loader) {
        return { renderer, scene, camera, envTexture, loader };
    }

    // (Re)create everything — either first use, or recovery after context loss.
    if (renderer) {
        renderer.dispose();
    }

    const canvas = document.createElement('canvas');
    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        contextLost = true;
    });

    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    contextLost = false;

    const pmrem = new THREE.PMREMGenerator(renderer);
    envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    scene = new THREE.Scene();
    scene.environment = envTexture;

    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444455, 1.2);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(2, 3, 4);
    scene.add(hemi, dir);

    if (!dracoLoader) {
        dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/gltf/');
    }
    loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    return { renderer, scene, camera, envTexture, loader };
}

function disposeObject3D(root: THREE.Object3D) {
    root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
            mesh.geometry?.dispose();
            const material = mesh.material;
            const materials = Array.isArray(material) ? material : [material];
            for (const mat of materials) {
                if (!mat) continue;
                for (const key of Object.keys(mat) as (keyof THREE.Material)[]) {
                    const value = (mat as unknown as Record<string, unknown>)[key as string];
                    if (value && typeof value === 'object' && 'isTexture' in value) {
                        (value as THREE.Texture).dispose();
                    }
                }
                mat.dispose();
            }
        }
    });
}

async function renderOne(url: string, size: number): Promise<string> {
    const ctx = ensureRenderer();

    const gltf = await ctx.loader.loadAsync(url);
    const root = gltf.scene || gltf.scenes[0];

    const box = new THREE.Box3().setFromObject(root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const radius = sphere.radius || 1;

    root.position.sub(center);

    const wrapper = new THREE.Group();
    wrapper.add(root);
    ctx.scene.add(wrapper);

    const distance = radius / Math.sin((ctx.camera.fov * Math.PI) / 360) * 1.35;
    ctx.camera.position.set(distance * 0.55, distance * 0.4, distance * 0.75);
    ctx.camera.near = Math.max(radius / 100, 0.01);
    ctx.camera.far = distance + radius * 4;
    ctx.camera.lookAt(0, 0, 0);
    ctx.camera.updateProjectionMatrix();

    ctx.renderer.setSize(size, size, false);
    ctx.renderer.setPixelRatio(1);
    ctx.renderer.render(ctx.scene, ctx.camera);

    const canvas = ctx.renderer.domElement;
    const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
    );

    ctx.scene.remove(wrapper);
    disposeObject3D(root);

    if (!blob) {
        throw new Error('Thumbnail-Rendering fehlgeschlagen (kein Blob)');
    }
    return URL.createObjectURL(blob);
}

async function processQueue() {
    if (processing) return;
    processing = true;
    while (queue.length > 0) {
        const item = queue.shift()!;
        try {
            const blobUrl = await renderOne(item.url, item.size);
            touchCache(item.url, blobUrl);
            item.resolve(blobUrl);
        } catch (err) {
            item.reject(err);
        } finally {
            inflight.delete(item.url);
        }
    }
    processing = false;
}

/**
 * Returns a same-origin object URL for a rendered thumbnail of the given
 * model URL, using a single shared WebGL context and a serial render queue.
 * Cached results (LRU, 100 entries) are returned synchronously via the
 * resolved promise on the next microtask; callers should render a spinner
 * until the promise resolves.
 */
export function getModelThumbnail(url: string, size = 256): Promise<string> {
    const cached = cache.get(url);
    if (cached) {
        cached.lastUsed = performance.now();
        return Promise.resolve(cached.blobUrl);
    }

    const pending = inflight.get(url);
    if (pending) return pending;

    const promise = new Promise<string>((resolve, reject) => {
        queue.push({ url, size, resolve, reject });
        void processQueue();
    });
    inflight.set(url, promise);
    return promise;
}
