import { forwardRef, useEffect } from 'react';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, WALL_PLACEMENT_OFFSET, type ArtworkInstanceData } from '../store/editorStore';
import { ModularFrame } from './ModularFrame';

// Halbe_Classic_Alu8 frame profile depth (Z) extracted via Blender MCP.
const FRAME_PROFILE_DEPTH = 0.027;
// Inset the image plane 4 mm behind the front face of the frame.
const IMAGE_INSET_FROM_FRONT = 0.004;
// Render so the frame's back face sits at outer-group local z = -WALL_PLACEMENT_OFFSET,
// cancelling out the placement offset baked into stored positions so the back is
// flush against the wall surface.
const FRAME_Z = -WALL_PLACEMENT_OFFSET;
const IMAGE_Z = FRAME_Z + FRAME_PROFILE_DEPTH - IMAGE_INSET_FROM_FRONT;

interface SelectableInstanceProps {
    instance: ArtworkInstanceData;
    selected: boolean;
    isEditor?: boolean;
}

export const SelectableInstance = forwardRef<THREE.Group, SelectableInstanceProps>(
    ({ instance, selected }, ref) => {
        const asset = instance.artwork.asset;
        const texture = useTexture(asset.path);
        const gl = useThree((state) => state.gl);
        const selectInstance = useEditorStore((state) => state.selectInstance);

        useEffect(() => {
            if (texture) {
                // eslint-disable-next-line react-hooks/immutability
                texture.anisotropy = gl.capabilities.getMaxAnisotropy();
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
            }
        }, [texture, gl]);

        // Use physical dimensions from artwork if available (in cm -> convert to meters)
        // Otherwise, fallback to DPI-based sizing: (pixels / dpi) * 0.0254 = meters
        const hasPhysicalSize = instance.artwork.width != null && instance.artwork.height != null;
        const baseWidth = hasPhysicalSize 
            ? (instance.artwork.width! / 100) 
            : (asset.width / (asset.dpi || 72)) * 0.0254;
        const baseHeight = hasPhysicalSize 
            ? (instance.artwork.height! / 100) 
            : (asset.height / (asset.dpi || 72)) * 0.0254;

        // Outer group keeps `instance.scale_*` so TransformControls and the modal
        // transform system still drive resizing through the Three.js matrix. An
        // inverse-scale child group cancels that scale for geometry, and we pass the
        // *effective* dimensions (base × scale) into ModularFrame + image plane.
        // Net effect: edges stretch in length and corners reposition, but the frame
        // profile thickness stays constant — the whole picture area grows, the bevel
        // around it does not.
        const EPS = 1e-4;
        const sx = Math.abs(instance.scale_x) > EPS ? instance.scale_x : 1;
        const sy = Math.abs(instance.scale_y) > EPS ? instance.scale_y : 1;
        const sz = Math.abs(instance.scale_z) > EPS ? instance.scale_z : 1;
        const effWidth = baseWidth * sx;
        const effHeight = baseHeight * sy;

        const handleClick = (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            selectInstance(instance.id);
        };

        return (
            <group
                ref={ref}
                position={[instance.position_x, instance.position_y, instance.position_z]}
                rotation={[instance.rotation_x, instance.rotation_y, instance.rotation_z]}
                scale={[sx, sy, sz]}
                onClick={handleClick}
            >
                {/* Inverse-scale wrapper: geometry under this group renders at its
                    intrinsic size regardless of the outer instance scale. Positions
                    are preserved (outer_scale * inverse_scale = identity), so the
                    wall-flush offset and image inset stay correct. */}
                <group scale={[1 / sx, 1 / sy, 1 / sz]}>
                    {/* Modular Halbe frame around the picture — wrapped so we can offset
                        the entire frame back so it sits flush on the wall. */}
                    <group position={[0, 0, FRAME_Z]}>
                        <ModularFrame width={effWidth} height={effHeight} />
                    </group>

                    {/* Image plane, inset 4mm behind the front face of the frame */}
                    <mesh position={[0, 0, IMAGE_Z]} castShadow={false} receiveShadow={false}>
                        <planeGeometry args={[effWidth, effHeight]} />
                        <meshStandardMaterial
                            map={texture}
                            side={THREE.DoubleSide}
                            roughness={1}
                            metalness={0}
                            transparent={false}
                        />
                    </mesh>

                    {/* Selection halo — backside-rendered enlarged box (same pattern as ModularWallMesh) */}
                    {selected && (
                        <mesh position={[0, 0, FRAME_Z + FRAME_PROFILE_DEPTH / 2]}>
                            <boxGeometry args={[effWidth + 0.05, effHeight + 0.05, FRAME_PROFILE_DEPTH + 0.01]} />
                            <meshBasicMaterial
                                color="#4488ff"
                                transparent
                                opacity={0.25}
                                side={THREE.BackSide}
                            />
                        </mesh>
                    )}
                </group>
            </group>
        );
    }
);

SelectableInstance.displayName = 'SelectableInstance';
