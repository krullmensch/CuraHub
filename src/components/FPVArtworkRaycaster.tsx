import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore } from '../store/editorStore';

interface FPVArtworkRaycasterProps {
    isEditor: boolean;
}

/** Walk ancestors to find a group carrying artworkInfo userData. */
function findArtworkAncestor(obj: THREE.Object3D | null): THREE.Object3D | null {
    while (obj) {
        if (obj.userData.artworkInfo) return obj;
        obj = obj.parent;
    }
    return null;
}

export const FPVArtworkRaycaster = ({ isEditor }: FPVArtworkRaycasterProps) => {
    const { camera, scene } = useThree();
    const raycaster = useMemo(() => {
        const rc = new THREE.Raycaster();
        rc.far = 12;
        return rc;
    }, []);
    const direction = useMemo(() => new THREE.Vector3(), []);
    const frameCount = useRef(0);
    const lastInstanceId = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            useEditorStore.getState().setFpvHoveredInfo(null);
        };
    }, []);

    useFrame(() => {
        if (isEditor) {
            const viewMode = useEditorStore.getState().plannerViewMode;
            if (viewMode !== 'firstPerson') {
                if (lastInstanceId.current !== null) {
                    lastInstanceId.current = null;
                    useEditorStore.getState().setFpvHoveredInfo(null);
                }
                return;
            }
        }

        frameCount.current++;
        if (frameCount.current % 3 !== 0) return;

        camera.getWorldDirection(direction);
        raycaster.set(camera.position, direction);

        // Raycast the full scene — hits are sorted by distance
        const hits = raycaster.intersectObjects(scene.children, true);

        // The first visible hit decides: artwork → show info, anything else → occluded
        for (const hit of hits) {
            if (!hit.object.visible) continue;

            const artworkGroup = findArtworkAncestor(hit.object);
            if (artworkGroup) {
                const id = artworkGroup.userData.instanceId as number;
                if (lastInstanceId.current !== id) {
                    lastInstanceId.current = id;
                    useEditorStore.getState().setFpvHoveredInfo(artworkGroup.userData.artworkInfo);
                }
                return;
            }

            // First visible hit is not an artwork — a wall or venue mesh blocks the view
            break;
        }

        if (lastInstanceId.current !== null) {
            lastInstanceId.current = null;
            useEditorStore.getState().setFpvHoveredInfo(null);
        }
    });

    return null;
};
