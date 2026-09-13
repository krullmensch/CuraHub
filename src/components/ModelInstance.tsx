import { forwardRef, useMemo, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, modelBBoxMap, type ArtworkInstanceData } from '../store/editorStore';
import { modelBBoxCenterMap } from './physics/modelBBoxCenterMap';

interface ModelInstanceProps {
    instance: ArtworkInstanceData;
    selected: boolean;
    isEditor?: boolean;
}

export const ModelInstance = forwardRef<THREE.Group, ModelInstanceProps>(
    ({ instance, selected }, ref) => {
        const asset = instance.artwork.asset;
        const selectInstance = useEditorStore((state) => state.selectInstance);

        // Uploaded GLBs are Draco-compressed; decoder served same-origin (no gstatic CDN).
        const { scene } = useGLTF(asset.path, '/draco/gltf/');

        // Clone the scene AND its materials so multiple instances of the same model
        // (and the shared useGLTF cache) don't conflict when we mutate emissive
        // below on selection (RND-10).
        const clonedScene = useMemo(() => {
            const clone = scene.clone(true);
            clone.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    if (Array.isArray(mesh.material)) {
                        mesh.material = mesh.material.map((m) => m.clone());
                    } else if (mesh.material) {
                        mesh.material = mesh.material.clone();
                    }
                }
            });
            return clone;
        }, [scene]);

        // Dispose the per-instance cloned materials on unmount / re-clone so we
        // don't leak GPU resources (geometries are shared with the useGLTF cache
        // and must NOT be disposed here).
        useEffect(() => {
            return () => {
                clonedScene.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        const mesh = child as THREE.Mesh;
                        if (Array.isArray(mesh.material)) {
                            mesh.material.forEach((m) => m.dispose());
                        } else {
                            mesh.material?.dispose();
                        }
                    }
                });
            };
        }, [clonedScene]);

        // Compute bounding box from the cloned scene
        const bbox = useMemo(() => {
            const box = new THREE.Box3().setFromObject(clonedScene);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);
            return { size, center };
        }, [clonedScene]);

        // Publish natural (unscaled) bbox size + center so PropertiesPanel can show
        // real-world dimensions, and PhysicsLayer can build a matching collider
        // (RND-08 — physics colliders live outside this component now).
        useEffect(() => {
            modelBBoxMap.set(instance.id, bbox.size.clone());
            modelBBoxCenterMap.set(instance.id, bbox.center.clone());
            return () => {
                modelBBoxMap.delete(instance.id);
                modelBBoxCenterMap.delete(instance.id);
            };
        }, [instance.id, bbox.size, bbox.center]);

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

                {/* Physics collider for first-person collision now lives in
                    src/components/physics/PhysicsLayer.tsx (RND-08 / LOAD-01) — this
                    visual component no longer imports @react-three/rapier. */}

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
