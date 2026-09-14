import { useEffect, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

/** Safety net: never keep the scene hidden longer than this. */
const WARMUP_TIMEOUT_MS = 10_000;

/**
 * Compiles the shader programs of everything mounted so far with `renderer.compileAsync`
 * (KHR_parallel_shader_compile) before the first visible frame. Without it the first frame after
 * the room loaded blocked the main thread with a synchronous compile (~0.9 s with a cold shader
 * cache on M2/ANGLE-Metal, far longer on weak GPUs).
 *
 * While compiling, the camera renders no layers, so frames stay empty instead of forcing the
 * synchronous compile. Mount it next to the content to warm up, inside its Suspense boundary.
 * Runs once per mount; content that mounts later compiles on first use as before.
 */
export const ShaderWarmup = ({ onDone }: { onDone?: () => void }) => {
    const gl = useThree((s) => s.gl);
    const scene = useThree((s) => s.scene);
    const get = useThree((s) => s.get);
    const invalidate = useThree((s) => s.invalidate);
    const onDoneRef = useRef(onDone);
    useEffect(() => {
        onDoneRef.current = onDone;
    }, [onDone]);

    useLayoutEffect(() => {
        // Read the camera at effect time: a makeDefault camera mounted in the same commit has
        // already replaced the default one in the store.
        const camera = get().camera;
        const layerMask = camera.layers.mask;
        let restored = false;
        const restore = () => {
            if (restored) return false;
            restored = true;
            camera.layers.mask = layerMask;
            invalidate();
            return true;
        };
        const finish = () => {
            if (restore()) onDoneRef.current?.();
        };

        gl.compileAsync(scene, camera).then(finish, finish);
        camera.layers.disableAll();
        const timer = setTimeout(finish, WARMUP_TIMEOUT_MS);

        return () => {
            clearTimeout(timer);
            restore();
        };
    }, [gl, scene, get, invalidate]);

    return null;
};
