import { useEffect, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { avatarSessions, onAvatarPose, onAvatarSessionsChanged } from '@/lib/live/avatarPoses';
import { reportCamera } from '@/lib/live/cameraPose';
import { blobColor } from '@/lib/live/blobChain';
import { SlimeBlob } from './SlimeBlob';

/**
 * Public viewer (live collaboration, step 5): every other visitor as a slime blob (SlimeBlob) in a
 * colour from their anonymous id, no names. Also reports this visitor's own camera so the others
 * see them. Mounted inside the viewer's Canvas.
 */

/** More blobs than this are not drawn (each one polygonises its own field every frame). */
const MAX_BLOBS = 16;

export const VisitorBlobs = () => {
    const sessions = useSyncExternalStore(onAvatarSessionsChanged, avatarSessions);
    const invalidate = useThree((s) => s.invalidate);
    useEffect(() => onAvatarPose(invalidate), [invalidate]);
    useFrame(({ camera }) => reportCamera(camera));
    return (
        <>
            {sessions.slice(0, MAX_BLOBS).map((id) => <SlimeBlob key={id} id={id} color={blobColor(id)} />)}
        </>
    );
};
