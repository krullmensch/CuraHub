import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, instanceRefMap } from '../store/editorStore';
import { useRenderQualitySettings } from '../hooks/use-render-quality';

interface FPVArtworkRaycasterProps {
    isEditor: boolean;
}

const MAX_DISTANCE = 12;
// Surfaces that can hide an artwork: the room's wall mesh and modular walls.
const OCCLUDER_NAMES = new Set(['Wall', 'ModularWall']);
const OCCLUDER_REFRESH_MS = 1000;

/** Walk ancestors to find a group carrying artworkInfo userData. */
function findArtworkAncestor(obj: THREE.Object3D | null): THREE.Object3D | null {
    while (obj) {
        if (obj.userData.artworkInfo) return obj;
        obj = obj.parent;
    }
    return null;
}

export const FPVArtworkRaycaster = ({ isEditor }: FPVArtworkRaycasterProps) => {
    const camera = useThree((state) => state.camera);
    const scene = useThree((state) => state.scene);
    const { raycastHz } = useRenderQualitySettings();
    // Created lazily inside the frame loop: its `far` is changed per cast, which the React
    // compiler lint does not allow on hook-returned values.
    const raycasterRef = useRef<THREE.Raycaster | null>(null);
    const direction = useMemo(() => new THREE.Vector3(), []);
    const lastCast = useRef(-Infinity);
    const lastInstanceId = useRef<number | null>(null);
    const occluders = useRef<THREE.Object3D[]>([]);
    const occludersRefreshedAt = useRef(-Infinity);

    useEffect(() => {
        return () => {
            useEditorStore.getState().setFpvHoveredInfo(null);
        };
    }, []);

    useFrame(() => {
        const clearHover = () => {
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
        if (!document.pointerLockElement) {
            clearHover();
            return;
        }

        const now = performance.now();
        if (now - lastCast.current < 1000 / raycastHz) return;
        lastCast.current = now;

        raycasterRef.current ??= new THREE.Raycaster();
        const raycaster = raycasterRef.current;
        camera.getWorldDirection(direction);
        raycaster.set(camera.position, direction);
        raycaster.far = MAX_DISTANCE;

        // 1) Artworks only (picture planes, video screens, models) — a few dozen small meshes
        //    instead of the whole scene with the room model (≈20k mesh raycasts/s before).
        let artworkGroup: THREE.Object3D | null = null;
        let hitDistance = 0;
        for (const hit of raycaster.intersectObjects(Array.from(instanceRefMap.values()), true)) {
            if (!hit.object.visible) continue;
            artworkGroup = findArtworkAncestor(hit.object);
            hitDistance = hit.distance;
            break;
        }
        if (!artworkGroup) {
            clearHover();
            return;
        }

        // 2) Occlusion: only walls in front of the artwork count.
        if (now - occludersRefreshedAt.current > OCCLUDER_REFRESH_MS) {
            occludersRefreshedAt.current = now;
            const found: THREE.Object3D[] = [];
            scene.traverse((obj) => {
                if ((obj as THREE.Mesh).isMesh && OCCLUDER_NAMES.has(obj.name)) found.push(obj);
            });
            occluders.current = found;
        }
        raycaster.far = hitDistance;
        const blocked = raycaster.intersectObjects(occluders.current, false).some((hit) => hit.object.visible);
        raycaster.far = MAX_DISTANCE;
        if (blocked) {
            clearHover();
            return;
        }

        const id = artworkGroup.userData.instanceId as number;
        if (lastInstanceId.current !== id) {
            lastInstanceId.current = id;
            useEditorStore.getState().setFpvHoveredInfo(artworkGroup.userData.artworkInfo);
        }
    });

    return null;
};
