import { useCallback, useContext, useLayoutEffect, useRef, type RefObject } from 'react';
import type * as THREE from 'three';
import { ArtworkTextureContext } from '../lib/artworkTextureContext';
import type { ArtworkMaterial, ArtworkTextureSource } from '../lib/artworkTextureManager';

/**
 * Registers an artwork image with the texture LOD manager (LOAD-05). Returns a ref callback
 * for the material; the manager assigns `material.map` directly, so texture swaps cause no
 * React re-render.
 */
export function useArtworkTexture(
    id: number,
    source: ArtworkTextureSource,
    objectRef: RefObject<THREE.Object3D | null>,
): (material: ArtworkMaterial | null) => void {
    const manager = useContext(ArtworkTextureContext);
    const materialRef = useRef<ArtworkMaterial | null>(null);
    const { path, thumbnailPath, pixelWidth, pixelHeight, sizeM, forceMax } = source;

    useLayoutEffect(() => {
        if (!manager) return;
        manager.register(id, { path, thumbnailPath, pixelWidth, pixelHeight, sizeM, forceMax }, objectRef.current, materialRef.current);
        return () => manager.unregister(id);
        // Registration depends on identity only; the remaining fields are synced below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [manager, id, path]);

    useLayoutEffect(() => {
        manager?.update(id, { thumbnailPath, pixelWidth, pixelHeight, sizeM, forceMax });
    }, [manager, id, thumbnailPath, pixelWidth, pixelHeight, sizeM, forceMax]);

    return useCallback((material: ArtworkMaterial | null) => {
        materialRef.current = material;
        manager?.bindMaterial(id, material);
    }, [manager, id]);
}
