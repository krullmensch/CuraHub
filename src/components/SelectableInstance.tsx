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
                // eslint-disable-next-line react-hooks/immutability
                texture.needsUpdate = true;
            }
        }, [texture, gl]);

        // DPI-based sizing: (pixels / dpi) * 0.0254 = meters
        const dpi = asset.dpi || 72;
        const width = (asset.width / dpi) * 0.0254;
        const height = (asset.height / dpi) * 0.0254;

        const handleClick = (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            selectInstance(instance.id);
        };

        return (
            <group
                ref={ref}
                position={[instance.position_x, instance.position_y, instance.position_z]}
                rotation={[instance.rotation_x, instance.rotation_y, instance.rotation_z]}
                scale={[instance.scale_x, instance.scale_y, instance.scale_z]}
                onClick={handleClick}
            >
                {/* Modular Halbe frame around the picture — wrapped so we can offset
                    the entire frame back so it sits flush on the wall. */}
                <group position={[0, 0, FRAME_Z]}>
                    <ModularFrame width={width} height={height} />
                </group>

                {/* Image plane, inset 4mm behind the front face of the frame */}
                <mesh position={[0, 0, IMAGE_Z]} castShadow={false} receiveShadow={false}>
                    <planeGeometry args={[width, height]} />
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
                        <boxGeometry args={[width + 0.05, height + 0.05, FRAME_PROFILE_DEPTH + 0.01]} />
                        <meshBasicMaterial
                            color="#4488ff"
                            transparent
                            opacity={0.25}
                            side={THREE.BackSide}
                        />
                    </mesh>
                )}
            </group>
        );
    }
);

SelectableInstance.displayName = 'SelectableInstance';
