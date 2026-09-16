import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import * as THREE from 'three';
import { getWebGPUSupport, isWebGPURenderer } from '../lib/rendererBackend';

const GRID_POSITION: [number, number, number] = [0, -0.01, 0];
const FADE_DISTANCE = 50;
/** drei's infinite grid scales its plane by (1 + fadeDistance); the TSL grid uses a plane that large. */
const PLANE_SIZE = 20 * (1 + FADE_DISTANCE);
const noRaycast = () => {};

/** WebGPU: TSL port of drei's grid (drei's GLSL shader only runs on WebGLRenderer). */
const WebGPUGrid = () => {
    const gl = useThree((state) => state.gl);
    const material = useMemo(() => getWebGPUSupport(gl).createGridMaterial({
        cellSize: 0.5,
        sectionSize: 1,
        cellThickness: 0.5,
        sectionThickness: 1,
        cellColor: 'white',
        sectionColor: 'gray',
        fadeDistance: FADE_DISTANCE,
        fadeStrength: 1,
    }), [gl]);
    const geometry = useMemo(() => new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE).rotateX(-Math.PI / 2), []);
    useEffect(() => () => {
        material.dispose();
        geometry.dispose();
    }, [material, geometry]);

    return <mesh geometry={geometry} material={material} position={GRID_POSITION} frustumCulled={false} raycast={noRaycast} />;
};

/** Floor grid of the editor's top/orbit views. */
export const EditorGrid = () => {
    const gl = useThree((state) => state.gl);
    if (isWebGPURenderer(gl)) return <WebGPUGrid />;
    return <Grid args={[20, 20]} cellColor="white" sectionColor="gray" infiniteGrid fadeDistance={FADE_DISTANCE} position={GRID_POSITION} />;
};
