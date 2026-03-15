import { useEffect, useRef, useCallback, Suspense } from 'react';
import * as THREE from 'three';
import { useEditorStore, type ArtworkInstanceData } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { SelectableInstance } from './SelectableInstance';
import { InstanceTransformControls } from './InstanceTransformControls';

export const PlacedArtworks = () => {
    const localInstances = useEditorStore((state) => state.localInstances);
    const setLocalInstances = useEditorStore((state) => state.setLocalInstances);
    const version = useEditorStore((state) => state.instancesVersion);
    const selectedInstanceId = useEditorStore((state) => state.selectedInstanceId);
    const token = useAuthStore((state) => state.token);
    const activeVersionId = useEditorStore((state) => state.activeVersionId);

    // Map of instance ID -> group ref for TransformControls
    const instanceRefs = useRef<Map<number, THREE.Group>>(new Map());

    // Ref callback factory
    const setInstanceRef = useCallback((id: number) => (el: THREE.Group | null) => {
        if (el) {
            instanceRefs.current.set(id, el);
        } else {
            instanceRefs.current.delete(id);
        }
    }, []);

    useEffect(() => {
        if (!token) return;
        if (!activeVersionId) {
            setLocalInstances([]);
            return;
        }

        const fetchInstances = async () => {
            try {
                const res = await fetch(`/api/instances?versionId=${activeVersionId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.status === 401) {
                    useAuthStore.getState().logout();
                    return;
                }
                if (!res.ok) throw new Error('Failed to fetch');
                const data: ArtworkInstanceData[] = await res.json();

                // Filter invalid
                const valid = data.filter(i => i.artwork?.asset);
                const invalidCount = data.length - valid.length;
                if (invalidCount > 0) {
                    console.warn(`[PlacedArtworks] ${invalidCount} instances have missing assets.`);
                }

                setLocalInstances(valid);
            } catch (err) {
                console.error("Failed to load instances", err);
            }
        };

        fetchInstances();
    }, [version, token, activeVersionId, setLocalInstances]);

    return (
        <group>
            <Suspense fallback={null}>
                {localInstances.map((instance) => (
                    <SelectableInstance
                        key={instance.id}
                        ref={setInstanceRef(instance.id)}
                        instance={instance}
                        selected={instance.id === selectedInstanceId}
                    />
                ))}
            </Suspense>
            <InstanceTransformControls instanceRefs={instanceRefs} />
        </group>
    );
};
