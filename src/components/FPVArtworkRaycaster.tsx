import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, instanceRefMap, type ArtworkInstanceData } from '../store/editorStore';
import { useBookViewerStore } from '../store/bookViewerStore';
import { bookInReach, installFirstPersonBookClick } from '../lib/book/viewerActions';
import { useRenderQualitySettings } from '../hooks/use-render-quality';
import { collectOccluders, pickArtworkAt } from '../lib/artworkPick';
import { isWalking } from '../lib/touch/walking';
import { useTouchViewer } from '../lib/touch/touchMode';

interface FPVArtworkRaycasterProps {
    isEditor: boolean;
    /** The public viewer's data; the editor reads its store. */
    instances?: ArtworkInstanceData[];
}

const OCCLUDER_REFRESH_MS = 1000;
const CENTRE = { x: 0, y: 0 };

export const FPVArtworkRaycaster = ({ isEditor, instances }: FPVArtworkRaycasterProps) => {
    const camera = useThree((state) => state.camera);
    const scene = useThree((state) => state.scene);
    const { raycastHz } = useRenderQualitySettings();
    // Created lazily inside the frame loop: its `far` is changed per cast, which the React
    // compiler lint does not allow on hook-returned values.
    const raycasterRef = useRef<THREE.Raycaster | null>(null);
    const lastCast = useRef(-Infinity);
    const lastInstanceId = useRef<number | null>(null);
    const occluders = useRef<THREE.Object3D[]>([]);
    const occludersRefreshedAt = useRef(-Infinity);
    // Touch viewer: artworks are picked on tap (TouchTapHandler), not every frame from the centre.
    const touch = useTouchViewer();

    useEffect(() => {
        return () => {
            useEditorStore.getState().setFpvHoveredInfo(null);
            useBookViewerStore.getState().setBookInReach(null);
        };
    }, []);

    const instancesRef = useRef(instances);
    useEffect(() => { instancesRef.current = instances; }, [instances]);
    useEffect(() => installFirstPersonBookClick(
        (id) => (instancesRef.current ?? useEditorStore.getState().localInstances).find((i) => i.id === id),
        !isEditor,
    ), [isEditor]);

    useFrame(() => {
        const clearHover = () => {
            useBookViewerStore.getState().setBookInReach(null);
            if (lastInstanceId.current !== null) {
                lastInstanceId.current = null;
                useEditorStore.getState().setFpvHoveredInfo(null);
            }
        };

        if (isEditor && useEditorStore.getState().plannerViewMode !== 'firstPerson') {
            clearHover();
            return;
        }
        // RND-05: the info overlay only matters while walking — no raycasts behind the
        // viewer's entry overlay or before the editor preview captured the mouse.
        if (touch && !isEditor) return;
        if (!isWalking()) {
            clearHover();
            return;
        }

        const now = performance.now();
        if (now - lastCast.current < 1000 / raycastHz) return;
        lastCast.current = now;

        raycasterRef.current ??= new THREE.Raycaster();
        if (now - occludersRefreshedAt.current > OCCLUDER_REFRESH_MS) {
            occludersRefreshedAt.current = now;
            occluders.current = collectOccluders(scene);
        }
        const pick = pickArtworkAt(CENTRE, camera, Array.from(instanceRefMap.values()), occluders.current, raycasterRef.current);
        if (!pick) {
            clearHover();
            return;
        }
        const artworkGroup = pick.group;
        const firstHit = pick.hit;

        const id = artworkGroup.userData.instanceId as number;
        const info = artworkGroup.userData.artworkInfo as { assetType: string; publicReadable?: boolean };
        const readable = isEditor || info.publicReadable === true;
        useBookViewerStore.getState().setBookInReach(
            info.assetType === 'book' && bookInReach(firstHit, readable) ? id : null,
        );
        if (lastInstanceId.current !== id) {
            lastInstanceId.current = id;
            useEditorStore.getState().setFpvHoveredInfo(artworkGroup.userData.artworkInfo);
        }
    });

    return null;
};
