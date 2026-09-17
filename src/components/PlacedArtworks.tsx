import { memo, useEffect, useRef, useCallback, Suspense } from 'react';
import * as THREE from 'three';
import { useEditorStore, instanceRefMap, type ArtworkInstanceData } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { SelectableInstance } from './SelectableInstance';
import { VideoInstance } from './VideoInstance';
import { ModelInstance } from './ModelInstance';
import { SplatInstance } from './SplatInstance';
import { InstanceTransformControls } from './InstanceTransformControls';
import { instanceOnFace, openFaceOf } from '../lib/wallEditor/faces';

interface PlacedArtworksProps {
    viewerInstances?: ArtworkInstanceData[];
    isEditor?: boolean;
}

const buildArtworkInfo = (instance: ArtworkInstanceData) => ({
    title: instance.artwork?.title || '',
    artist: instance.artwork?.artist || '',
    year: instance.artwork?.year || '',
    description: instance.artwork?.description || '',
    instanceId: instance.id,
    assetType: instance.artwork?.asset?.type || 'image',
});

interface InstanceSlotProps {
    instance: ArtworkInstanceData;
    isEditor: boolean;
    registerRef: (id: number, el: THREE.Group | null) => void;
}

// RND-06: each slot reads its own selection state, so selecting an artwork re-renders two
// slots instead of the whole list, and memo skips instances whose data object is unchanged
// (commitLocalChange keeps untouched instance objects). The ref callback is stable per id —
// a new callback on every render made React detach/re-attach all refs on each list render.
const InstanceSlot = memo(({ instance, isEditor, registerRef }: InstanceSlotProps) => {
    const selected = useEditorStore((state) => isEditor && state.selectedInstanceId === instance.id);
    // 2D wall editor: only the artworks of the open face stay visible
    const hidden = useEditorStore((state) => {
        if (!isEditor || !state.wallEditor) return false;
        const face = openFaceOf(state);
        return !face || !instanceOnFace(instance, face);
    });
    const refCallback = useCallback((el: THREE.Group | null) => registerRef(instance.id, el), [registerRef, instance.id]);
    const assetType = instance.artwork?.asset?.type || 'image';
    const Component =
        assetType === 'video' ? VideoInstance :
        assetType === 'model3d' ? ModelInstance :
        assetType === 'splat' ? SplatInstance :
        SelectableInstance;

    return (
        <group visible={!hidden}>
            <Suspense fallback={null}>
                <Component ref={refCallback} instance={instance} selected={selected} isEditor={isEditor} />
            </Suspense>
        </group>
    );
});
InstanceSlot.displayName = 'InstanceSlot';

export const PlacedArtworks = ({ viewerInstances, isEditor = true }: PlacedArtworksProps) => {
    const localInstances = useEditorStore((state) => state.localInstances);
    const setLocalInstances = useEditorStore((state) => state.setLocalInstances);
    const version = useEditorStore((state) => state.instancesVersion);
    const plannerViewMode = useEditorStore((state) => state.plannerViewMode);
    const wallEditorOpen = useEditorStore((state) => !!state.wallEditor);
    // API-01: depend on "logged in", not on the token string — refreshAuth() issues a fresh
    // token on every mount/focus, which used to refetch all instances.
    const hasToken = useAuthStore((state) => !!state.token);
    const activeVersionId = useEditorStore((state) => state.activeVersionId);

    const instances = viewerInstances ?? localInstances;

    // Map of instance ID -> group ref for TransformControls
    const instanceRefs = useRef<Map<number, THREE.Group>>(new Map());
    const instancesById = useRef<Map<number, ArtworkInstanceData>>(new Map());

    // Also registers in shared instanceRefMap for cross-component access
    const registerRef = useCallback((id: number, el: THREE.Group | null) => {
        if (el) {
            instanceRefs.current.set(id, el);
            instanceRefMap.set(id, el);
            el.userData.instanceId = id;
            const instance = instancesById.current.get(id);
            if (instance) el.userData.artworkInfo = buildArtworkInfo(instance);
        } else {
            instanceRefs.current.delete(id);
            instanceRefMap.delete(id);
        }
    }, []);

    // Keep the FPV info userData in sync with (possibly edited) artwork metadata.
    useEffect(() => {
        const byId = new Map(instances.map((instance) => [instance.id, instance]));
        instancesById.current = byId;
        for (const [id, group] of instanceRefs.current) {
            const instance = byId.get(id);
            if (instance) group.userData.artworkInfo = buildArtworkInfo(instance);
        }
    }, [instances]);

    // Only fetch in editor mode (viewer receives data via props)
    useEffect(() => {
        if (!isEditor || viewerInstances) return;
        if (!hasToken) return;
        if (!activeVersionId) {
            setLocalInstances([]);
            return;
        }

        let cancelled = false;
        const fetchInstances = async () => {
            try {
                const res = await fetch(`/api/instances?versionId=${activeVersionId}`, {
                    headers: { 'Authorization': `Bearer ${useAuthStore.getState().token}` }
                });
                if (res.status === 401) {
                    useAuthStore.getState().logout();
                    return;
                }
                if (!res.ok) throw new Error('Failed to fetch');
                const data: ArtworkInstanceData[] = await res.json();
                if (cancelled) return;

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
        return () => { cancelled = true; };
    }, [version, hasToken, activeVersionId, setLocalInstances, isEditor, viewerInstances]);

    return (
        <group>
            {instances.map((instance) => (
                <InstanceSlot key={instance.id} instance={instance} isEditor={isEditor} registerRef={registerRef} />
            ))}
            {/* No transform gizmo while walking through the room in first-person preview */}
            {isEditor && plannerViewMode !== 'firstPerson' && !wallEditorOpen && <InstanceTransformControls instanceRefs={instanceRefs} />}
        </group>
    );
};
