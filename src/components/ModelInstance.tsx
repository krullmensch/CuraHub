import { forwardRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useEditorStore, type ArtworkInstanceData } from '../store/editorStore';

interface ModelInstanceProps {
    instance: ArtworkInstanceData;
    selected: boolean;
    isEditor?: boolean;
}

export const ModelInstance = forwardRef<THREE.Group, ModelInstanceProps>(
    ({ instance, selected }, ref) => {
        const asset = instance.artwork.asset;
        const selectInstance = useEditorStore((state) => state.selectInstance);

        const { scene } = useGLTF(asset.path);

        // Clone the scene so multiple instances of the same model don't conflict
        const clonedScene = useMemo(() => {
            const clone = scene.clone(true);
            clone.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            return clone;
        }, [scene]);

        // Compute bounding box from the cloned scene
        const bbox = useMemo(() => {
            const box = new THREE.Box3().setFromObject(clonedScene);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);
            return { size, center };
        }, [clonedScene]);

        // Selection highlight: apply emissive to all meshes
        useMemo(() => {
            clonedScene.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    const material = mesh.material as THREE.MeshStandardMaterial;
                    if (material && material.emissive) {
                        material.emissive.set(selected ? '#1d4ed8' : '#000000');
                        material.emissiveIntensity = selected ? 0.3 : 0;
                    }
                }
            });
        }, [clonedScene, selected]);

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
                <primitive object={clonedScene} />

                {/* Physics collider for first-person collision */}
                <RigidBody type="fixed" colliders={false}>
                    <CuboidCollider
                        args={[bbox.size.x / 2, bbox.size.y / 2, bbox.size.z / 2]}
                        position={[bbox.center.x, bbox.center.y, bbox.center.z]}
                    />
                </RigidBody>

                {/* Bounding box wireframe — only when selected */}
                {selected && (
                    <mesh position={[bbox.center.x, bbox.center.y, bbox.center.z]}>
                        <boxGeometry args={[bbox.size.x, bbox.size.y, bbox.size.z]} />
                        <meshBasicMaterial
                            color="#3b82f6"
                            wireframe
                            transparent
                            opacity={0.6}
                            depthTest={false}
                        />
                    </mesh>
                )}
            </group>
        );
    }
);

ModelInstance.displayName = 'ModelInstance';
