import { memo, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useEditorStore, instanceRefMap, markListLoadFailed, type ArtworkInstanceData } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { SelectableInstance } from './SelectableInstance';
import { VideoInstance, VideoStillInstance } from './VideoInstance';
import { ModelInstance } from './ModelInstance';
import { SplatInstance } from './SplatInstance';
import { BookInstance } from './book/BookInstance';
import { InstanceTransformControls } from './InstanceTransformControls';
import { SelectionBridge } from './SelectionBridge';
import { instanceOnFace, instanceOnRoomFace, openFaceOf } from '../lib/wallEditor/faces';
import { useRoomCutaway } from '../store/roomCutawayStore';
import { useWallEditorView } from '../store/wallEditorViewStore';
import { displayArtworkTitle } from '../lib/artworkTitle';
import { useExportMode } from '../lib/arExport/exportMode';
import { ExportPart } from './arExport/ExportPart';

interface PlacedArtworksProps {
    viewerInstances?: ArtworkInstanceData[];
    isEditor?: boolean;
}

const buildArtworkInfo = (instance: ArtworkInstanceData) => ({
    title: displayArtworkTitle(instance.artwork?.title || ''),
    artist: instance.artwork?.artist || '',
    year: instance.artwork?.year || '',
    description: instance.artwork?.description || '',
    instanceId: instance.id,
    assetType: instance.artwork?.asset?.type || 'image',
    publicReadable: instance.artwork?.publicReadable === true,
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
    const selected = useEditorStore((state) => isEditor && state.selectedInstanceIds.includes(instance.id));
    // 2D wall editor: only the artworks of the open face stay visible
    const hidden = useEditorStore((state) => {
        if (!isEditor || !state.wallEditor) return false;
        const face = openFaceOf(state);
        return !face || !instanceOnFace(instance, face);
    });
    // Cutaway: artworks on a hidden room wall go with it (floor works and modular walls stay);
    // a selected one stays so its gizmo and outline don't hang in the air.
    const cutAway = useRoomCutaway((state) => {
        if (!isEditor || selected || state.hiddenFaceIds.length === 0) return false;
        const rooms = useWallEditorView.getState().roomFaces;
        return state.hiddenFaceIds.some((id) => {
            const room = rooms.find((f) => f.id === id);
            return !!room && instanceOnRoomFace(instance, room);
        });
    });
    const refCallback = useCallback((el: THREE.Group | null) => registerRef(instance.id, el), [registerRef, instance.id]);
    const assetType = instance.artwork?.asset?.type || 'image';
    // AR export: videos as their still, splats left out (no AR viewer renders them).
    const exportMode = useExportMode().active;
    if (exportMode && assetType === 'splat') return null;
    const Component =
        assetType === 'video' ? (exportMode ? VideoStillInstance : VideoInstance) :
        assetType === 'model3d' ? ModelInstance :
        assetType === 'book' ? BookInstance :
        assetType === 'splat' ? SplatInstance :
        SelectableInstance;

    return (
        <group visible={!hidden && !cutAway}>
            <ExportPart part={`instance:${instance.id}`}>
                <Component ref={refCallback} instance={instance} selected={selected} isEditor={isEditor} />
            </ExportPart>
        </group>
    );
});
InstanceSlot.displayName = 'InstanceSlot';

export const PlacedArtworks = ({ viewerInstances, isEditor = true }: PlacedArtworksProps) => {
    const localInstances = useEditorStore((state) => state.localInstances);
    const setLocalInstances = useEditorStore((state) => state.setLocalInstances);
    const version = useEditorStore((state) => state.instancesVersion);
    const plannerViewMode = useEditorStore((state) => state.plannerViewMode);
    // Phone planning view: select and change frames only, no gizmo or marquee.
    const mobilePlanner = useEditorStore((state) => state.mobilePlanner);
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
                if (!cancelled) markListLoadFailed('instances', activeVersionId);
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
            {isEditor && plannerViewMode !== 'firstPerson' && !wallEditorOpen && !mobilePlanner && <InstanceTransformControls instanceRefs={instanceRefs} />}
            {isEditor && !mobilePlanner && <SelectionBridge />}
        </group>
    );
};
