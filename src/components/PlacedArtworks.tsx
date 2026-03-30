import { useEffect, useRef, useCallback, Suspense } from 'react';
import * as THREE from 'three';
import { useEditorStore, instanceRefMap, type ArtworkInstanceData } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { SelectableInstance } from './SelectableInstance';
import { VideoInstance } from './VideoInstance';
import { ModelInstance } from './ModelInstance';
import { InstanceTransformControls } from './InstanceTransformControls';

interface PlacedArtworksProps {
    viewerInstances?: ArtworkInstanceData[];
    isEditor?: boolean;
}

export const PlacedArtworks = ({ viewerInstances, isEditor = true }: PlacedArtworksProps) => {
    const localInstances = useEditorStore((state) => state.localInstances);
    const setLocalInstances = useEditorStore((state) => state.setLocalInstances);
    const version = useEditorStore((state) => state.instancesVersion);
    const selectedInstanceId = useEditorStore((state) => state.selectedInstanceId);
    const token = useAuthStore((state) => state.token);
    const activeVersionId = useEditorStore((state) => state.activeVersionId);

    // Map of instance ID -> group ref for TransformControls
    const instanceRefs = useRef<Map<number, THREE.Group>>(new Map());

    // Ref callback factory — also registers in shared instanceRefMap for cross-component access
    const setInstanceRef = useCallback((id: number, instance: ArtworkInstanceData) => (el: THREE.Group | null) => {
        if (el) {
            instanceRefs.current.set(id, el);
            instanceRefMap.set(id, el);
            el.userData.instanceId = id;
            el.userData.artworkInfo = {
                title: instance.artwork?.title || '',
                artist: instance.artwork?.artist || '',
                year: instance.artwork?.year || '',
                description: instance.artwork?.description || '',
                instanceId: id,
                assetType: instance.artwork?.asset?.type || 'image',
            };
        } else {
            instanceRefs.current.delete(id);
            instanceRefMap.delete(id);
        }
    }, []);

    // Only fetch in editor mode (viewer receives data via props)
    useEffect(() => {
        if (!isEditor || viewerInstances) return;
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
    }, [version, token, activeVersionId, setLocalInstances, isEditor, viewerInstances]);

    const instances = viewerInstances ?? localInstances;

    return (
        <group>
                {instances.map((instance) => {
                    const assetType = instance.artwork?.asset?.type || 'image';
                    const Component =
                        assetType === 'video' ? VideoInstance :
                        assetType === 'model3d' ? ModelInstance :
                        SelectableInstance;

                    return (
                        <Suspense key={instance.id} fallback={null}>
                            <Component
                                ref={setInstanceRef(instance.id, instance)}
                                instance={instance}
                                selected={isEditor ? instance.id === selectedInstanceId : false}
                                isEditor={isEditor}
                            />
                        </Suspense>
                    );
                })}
            {isEditor && <InstanceTransformControls instanceRefs={instanceRefs} />}
        </group>
    );
};
