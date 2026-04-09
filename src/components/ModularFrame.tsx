import { forwardRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const FRAME_MODEL = '/models/Halbe_Classic_Alu8.glb';
const CORNER_MESH_NAME = 'Halbe_Classic_Alu8_Corner';
const EDGE_MESH_NAME = 'Halbe_Classic_Alu8_Edge';

// Extracted via Blender MCP from Halbe_Classic_Alu8_Corner bounding box.
// The corner's origin sits at the inner picture vertex; the mesh extends
// 0.009 m inward (-X / -Y) along the picture edges.
const CORNER_ARM_LENGTH = 0.009;
// Small safety gap (per side, per axis) to prevent edge↔corner overlap and
// the resulting z-fighting artifacts where the two meshes meet.
const EDGE_SEAM_GAP = 0.0005;

interface ModularFrameProps {
    width: number;  // inner picture width in meters
    height: number; // inner picture height in meters
}

export const ModularFrame = forwardRef<THREE.Group, ModularFrameProps>(
    ({ width, height }, ref) => {
        const { scene } = useGLTF(FRAME_MODEL);

        const { cornerGeometry, cornerMaterial, edgeGeometry, edgeMaterial } = useMemo(() => {
            const root = scene.clone(true);
            let corner: THREE.Mesh | null = null;
            let edge: THREE.Mesh | null = null;

            root.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    if (mesh.name === CORNER_MESH_NAME) {
                        corner = mesh;
                    } else if (mesh.name === EDGE_MESH_NAME) {
                        edge = mesh;
                    }
                }
            });

            if (!corner || !edge) {
                throw new Error(
                    `ModularFrame: expected meshes "${CORNER_MESH_NAME}" and "${EDGE_MESH_NAME}" in ${FRAME_MODEL}`
                );
            }

            return {
                cornerGeometry: (corner as THREE.Mesh).geometry,
                cornerMaterial: (corner as THREE.Mesh).material as THREE.Material,
                edgeGeometry: (edge as THREE.Mesh).geometry,
                edgeMaterial: (edge as THREE.Mesh).material as THREE.Material,
            };
        }, [scene]);

        const xEdgeScale = Math.max(0, width - 2 * (CORNER_ARM_LENGTH + EDGE_SEAM_GAP));
        const yEdgeScale = Math.max(0, height - 2 * (CORNER_ARM_LENGTH + EDGE_SEAM_GAP));
        const hw = width / 2;
        const hh = height / 2;

        return (
            <group ref={ref}>
                {/* 4 corners */}
                <mesh
                    geometry={cornerGeometry}
                    material={cornerMaterial}
                    position={[hw, hh, 0]}
                    rotation={[Math.PI / 2, Math.PI, 0]}
                    castShadow
                    receiveShadow
                />
                <mesh
                    geometry={cornerGeometry}
                    material={cornerMaterial}
                    position={[-hw, hh, 0]}
                    rotation={[Math.PI / 2, -Math.PI / 2, 0]}
                    castShadow
                    receiveShadow
                />
                <mesh
                    geometry={cornerGeometry}
                    material={cornerMaterial}
                    position={[-hw, -hh, 0]}
                    rotation={[Math.PI / 2, 0, 0]}
                    castShadow
                    receiveShadow
                />
                <mesh
                    geometry={cornerGeometry}
                    material={cornerMaterial}
                    position={[hw, -hh, 0]}
                    rotation={[Math.PI / 2, Math.PI / 2, 0]}
                    castShadow
                    receiveShadow
                />

                {/* 4 edges — local X is the length axis */}
                <mesh
                    geometry={edgeGeometry}
                    material={edgeMaterial}
                    position={[0, hh, 0]}
                    rotation={[Math.PI / 2, Math.PI, 0]}
                    scale={[xEdgeScale, 1, 1]}
                    castShadow
                    receiveShadow
                />
                <mesh
                    geometry={edgeGeometry}
                    material={edgeMaterial}
                    position={[0, -hh, 0]}
                    rotation={[Math.PI / 2, 0, 0]}
                    scale={[xEdgeScale, 1, 1]}
                    castShadow
                    receiveShadow
                />
                <mesh
                    geometry={edgeGeometry}
                    material={edgeMaterial}
                    position={[-hw, 0, 0]}
                    rotation={[Math.PI / 2, -Math.PI / 2, 0]}
                    scale={[yEdgeScale, 1, 1]}
                    castShadow
                    receiveShadow
                />
                <mesh
                    geometry={edgeGeometry}
                    material={edgeMaterial}
                    position={[hw, 0, 0]}
                    rotation={[0, Math.PI / 2, Math.PI / 2]}
                    scale={[yEdgeScale, 1, 1]}
                    castShadow
                    receiveShadow
                />
            </group>
        );
    }
);

ModularFrame.displayName = 'ModularFrame';

useGLTF.preload(FRAME_MODEL);
