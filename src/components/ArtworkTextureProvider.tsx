import { useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ArtworkTextureManager } from '../lib/artworkTextureManager';
import { ArtworkTextureContext } from '../lib/artworkTextureContext';
import { useRenderQualitySettings } from '../hooks/use-render-quality';

/**
 * LOAD-05 / LOAD-07: owns the artwork texture LOD manager for this Canvas and drives it
 * once per rendered frame. Artworks never suspend on their images any more — the room and
 * frames show immediately and pictures sharpen progressively.
 */
export const ArtworkTextureProvider = ({ children }: { children: ReactNode }) => {
    const manager = useMemo(() => new ArtworkTextureManager(), []);
    const settings = useRenderQualitySettings();
    const gl = useThree((state) => state.gl);
    const invalidate = useThree((state) => state.invalidate);

    useLayoutEffect(() => {
        manager.configure(settings, gl.capabilities.maxTextureSize, invalidate);
    }, [manager, settings, gl, invalidate]);

    useEffect(() => {
        const canvas = gl.domElement;
        const onRestored = () => {
            manager.handleContextRestored();
            invalidate();
        };
        canvas.addEventListener('webglcontextrestored', onRestored);
        return () => canvas.removeEventListener('webglcontextrestored', onRestored);
    }, [manager, gl, invalidate]);

    useEffect(() => () => manager.dispose(), [manager]);

    useFrame((state) => {
        manager.tick(state.camera, gl, performance.now());
    });

    return <ArtworkTextureContext.Provider value={manager}>{children}</ArtworkTextureContext.Provider>;
};
