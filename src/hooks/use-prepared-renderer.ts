import { useEffect, useState } from 'react';
import { prepareRenderer, releasePreparedRenderer, type PreparedRenderer } from '../lib/rendererBackend';

/**
 * Chooses the render backend (WebGPU or WebGL) and sets up the GPU device before a Canvas
 * mounts. null while that is still running — render the Canvas only once it is available.
 */
export function usePreparedRenderer(): PreparedRenderer | null {
    const [prepared, setPrepared] = useState<PreparedRenderer | null>(null);

    useEffect(() => {
        let cancelled = false;
        prepareRenderer().then((result) => {
            if (cancelled) releasePreparedRenderer(result);
            else setPrepared(result);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // The device outlives nothing but its Canvas. R3F tears its root down asynchronously after
    // the Canvas unmounted, so give it a moment before destroying the device underneath it.
    useEffect(() => {
        if (!prepared) return;
        return () => {
            window.setTimeout(() => releasePreparedRenderer(prepared), DEVICE_RELEASE_DELAY_MS);
        };
    }, [prepared]);

    return prepared;
}

const DEVICE_RELEASE_DELAY_MS = 2000;
