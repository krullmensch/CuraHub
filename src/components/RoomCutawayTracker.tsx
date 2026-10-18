import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useEditorStore } from '../store/editorStore';
import { useRoomCutaway } from '../store/roomCutawayStore';
import { useWallEditorView } from '../store/wallEditorViewStore';
import { cutawayFaceIds } from '../lib/roomCutaway';

/**
 * Editor orbit view: decides which room walls the camera looks through (cutaway enabled). The
 * store only changes when the camera crosses a wall's plane, so this costs a few dot products
 * per frame.
 */
export const RoomCutawayTracker = () => {
    const enabled = useRoomCutaway((s) => s.enabled);
    const viewMode = useEditorStore((s) => s.plannerViewMode);
    const wallEditorOpen = useEditorStore((s) => !!s.wallEditor);
    const active = enabled && viewMode !== 'firstPerson' && !wallEditorOpen;

    useEffect(() => {
        if (!active) useRoomCutaway.getState().setHiddenFaceIds([]);
    }, [active]);

    useFrame(({ camera }) => {
        if (!active) return;
        const faces = useWallEditorView.getState().roomFaces;
        useRoomCutaway.getState().setHiddenFaceIds(cutawayFaceIds(faces, camera.position));
    });

    return null;
};
