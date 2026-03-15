import { forwardRef, useEffect } from 'react';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, type ArtworkInstanceData } from '../store/editorStore';

interface SelectableInstanceProps {
    instance: ArtworkInstanceData;
    selected: boolean;
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

        const frameColor = selected ? '#3b82f6' : '#222';
        const frameEmissive = selected ? '#1d4ed8' : '#000000';

        return (
            <group
                ref={ref}
                position={[instance.position_x, instance.position_y, instance.position_z]}
                rotation={[instance.rotation_x, instance.rotation_y, instance.rotation_z]}
                scale={[instance.scale_x, instance.scale_y, instance.scale_z]}
                onClick={handleClick}
            >
                {/* Artwork texture */}
                <mesh position={[0, 0, 0.02]} castShadow={false} receiveShadow={false}>
                    <planeGeometry args={[width, height]} />
                    <meshStandardMaterial
                        map={texture}
                        side={THREE.DoubleSide}
                        roughness={1}
                        metalness={0}
                        transparent={false}
                    />
                </mesh>
                {/* Frame */}
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[width + 0.04, height + 0.04, 0.02]} />
                    <meshStandardMaterial
                        color={frameColor}
                        emissive={frameEmissive}
                        emissiveIntensity={selected ? 0.5 : 0}
                    />
                </mesh>
            </group>
        );
    }
);

SelectableInstance.displayName = 'SelectableInstance';
