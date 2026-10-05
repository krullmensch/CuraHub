import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { setPreviewInvalidator, stepPreviews } from '@/lib/live/remotePreviews';
import { objectForKey } from '@/lib/live/sceneObjects';
import { RemoteSelectionTracker } from './RemoteSelections';

/**
 * What other tabs show in this editor's scene (live collaboration, step 4): their objects
 * moving while they drag them, and the outline of what they hold, with their name. People
 * themselves are not drawn in the room. Mounted inside the editor's Canvas.
 */
export const LiveSceneLayer = () => (
    <>
        <RemotePreviewApplier />
        <RemoteSelectionTracker />
    </>
);

const RemotePreviewApplier = () => {
    const invalidate = useThree((s) => s.invalidate);
    useEffect(() => {
        setPreviewInvalidator(invalidate);
        return () => setPreviewInvalidator(null);
    }, [invalidate]);
    useFrame((_, delta) => {
        if (stepPreviews(delta, objectForKey)) invalidate();
    });
    return null;
};
