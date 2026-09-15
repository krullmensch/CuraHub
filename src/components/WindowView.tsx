import { use, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useRenderQuality, useRenderQualitySettings } from '../hooks/use-render-quality';
import { WINDOW_VIEW_TEXTURES, buildWindowViewGeometries, loadWindowViewTexture } from '../lib/windowView';

const noRaycast = () => null;

interface WindowViewProps {
    /** true once the street is shown, false again on unmount (e.g. to make the window glass clearer meanwhile). */
    onReadyChange?: (ready: boolean) => void;
}

/**
 * Photographic street outside the windows ("räumliche Szene"): real geometry at the measured
 * distances, so the view shifts with parallax while walking. Mount only in first person and inside
 * its own Suspense boundary — it suspends until both textures are decoded.
 */
export const WindowView = ({ onReadyChange }: WindowViewProps) => {
    const quality = useRenderQuality();
    const { anisotropy } = useRenderQualitySettings();
    const urls = quality === 'low' ? WINDOW_VIEW_TEXTURES.low : WINDOW_VIEW_TEXTURES.high;
    const panoTexture = use(loadWindowViewTexture(urls.pano, anisotropy));
    const carsTexture = use(loadWindowViewTexture(urls.cars, anisotropy));

    const geometries = useMemo(() => buildWindowViewGeometries(), []);
    const backgroundMaterial = useMemo(
        () => (panoTexture ? new THREE.MeshBasicMaterial({ map: panoTexture, side: THREE.DoubleSide, toneMapped: false }) : null),
        [panoTexture],
    );
    const carsMaterial = useMemo(
        () => (carsTexture
            ? new THREE.MeshBasicMaterial({ map: carsTexture, side: THREE.DoubleSide, toneMapped: false, transparent: true, depthWrite: false, alphaTest: 0.01 })
            : null),
        [carsTexture],
    );

    useEffect(() => {
        if (!backgroundMaterial) return;
        onReadyChange?.(true);
        return () => onReadyChange?.(false);
    }, [backgroundMaterial, onReadyChange]);

    // Textures stay cached (and uploaded) for the next visit; geometries and materials are per mount.
    useEffect(() => () => {
        geometries.background.forEach((g) => g.dispose());
        geometries.cars.dispose();
    }, [geometries]);
    useEffect(() => () => backgroundMaterial?.dispose(), [backgroundMaterial]);
    useEffect(() => () => carsMaterial?.dispose(), [carsMaterial]);

    if (!backgroundMaterial) return null;

    return (
        <group name="WindowView">
            {geometries.background.map((geometry, i) => (
                <mesh key={i} geometry={geometry} material={backgroundMaterial} raycast={noRaycast} />
            ))}
            {carsMaterial && <mesh geometry={geometries.cars} material={carsMaterial} raycast={noRaycast} />}
        </group>
    );
};
