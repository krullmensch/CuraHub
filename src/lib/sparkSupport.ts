import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { computeSplatFrame, type SplatHandle, type SplatLoadContext } from './splats';

// Gaussian splats on the WebGL fallback, rendered by Spark (World Labs). Loaded on demand — the
// bundle (~2.6 MB incl. WASM) only downloads when a WebGL canvas actually shows a splat.

interface SparkEntry {
    spark: SparkRenderer;
    scene: THREE.Scene;
    refs: number;
}

// One SparkRenderer per renderer: it sorts and draws every SplatMesh in its scene together.
const sparkRenderers = new WeakMap<THREE.WebGLRenderer, SparkEntry>();

function acquireSparkRenderer({ gl, scene, invalidate }: SplatLoadContext) {
    let entry = sparkRenderers.get(gl);
    if (!entry) {
        // onDirty: sorting runs in a worker, so under frameloop="demand" a finished sort needs a frame.
        const spark = new SparkRenderer({ renderer: gl, onDirty: invalidate });
        spark.name = 'SparkRenderer';
        scene.add(spark);
        entry = { spark, scene, refs: 0 };
        sparkRenderers.set(gl, entry);
    }
    entry.refs++;
    const current = entry;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        current.refs--;
        if (current.refs > 0) return;
        current.scene.remove(current.spark);
        current.spark.dispose();
        if (sparkRenderers.get(gl) === current) sparkRenderers.delete(gl);
    };
}

export async function loadSparkSplat(context: SplatLoadContext): Promise<SplatHandle> {
    const release = acquireSparkRenderer(context);
    const mesh = new SplatMesh({ url: context.url });
    try {
        await mesh.initialized;
        const count = mesh.splats?.getNumSplats() ?? mesh.packedSplats?.numSplats ?? 0;
        const centers = new Float32Array(count * 3);
        mesh.forEachSplat((index, center) => {
            if (index >= count) return;
            centers[index * 3] = center.x;
            centers[index * 3 + 1] = center.y;
            centers[index * 3 + 2] = center.z;
        });
        const frame = computeSplatFrame(count, (i, out) => {
            out[0] = centers[i * 3];
            out[1] = centers[i * 3 + 1];
            out[2] = centers[i * 3 + 2];
        });
        context.invalidate();
        return {
            object: mesh,
            frame,
            dispose() {
                mesh.dispose();
                release();
            },
        };
    } catch (err) {
        mesh.dispose();
        release();
        throw err;
    }
}
