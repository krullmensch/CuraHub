import { Suspense, lazy, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore } from '@/store/editorStore';
import { useLiveStore } from '@/store/liveStore';
import { reportCamera } from '@/lib/live/cameraPose';
import { setPreviewInvalidator, stepPreviews } from '@/lib/live/remotePreviews';
import { objectForKey } from '@/lib/live/sceneObjects';
import { avatarSessions, onAvatarPose, onAvatarSessionsChanged } from '@/lib/live/avatarPoses';
import { getLabelTexture, onLabelTexturesChanged } from '@/lib/measureLabelTextures';
import type { PresenceMember } from '@/lib/live/protocol';
import { RemoteSelectionTracker } from './RemoteSelections';

/**
 * What other tabs show in this editor's scene (live collaboration, step 4): their objects
 * moving while they drag them, and their avatars — a slime blob in their colour with their name
 * (like visitors in the public viewer), at chest height where they walk in first person, where
 * they look from in the orbit view. Also reports this tab's own camera for the others.
 * Mounted inside the editor's Canvas.
 */
export const LiveSceneLayer = () => (
    <>
        <LiveCameraReporter />
        <RemotePreviewApplier />
        <RemoteSelectionTracker />
        <Suspense fallback={null}>
            <RemoteAvatars />
        </Suspense>
    </>
);

const LiveCameraReporter = () => {
    useFrame(({ camera }) => reportCamera(camera));
    return null;
};

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

// MarchingCubes only loads once somebody else is in the version.
const SlimeBlob = lazy(() => import('./SlimeBlob').then((m) => ({ default: m.SlimeBlob })));

const RemoteAvatars = () => {
    const sessions = useSyncExternalStore(onAvatarSessionsChanged, avatarSessions);
    const members = useLiveStore((s) => s.members);
    const activeVersionId = useEditorStore((s) => s.activeVersionId);
    const wallEditorOpen = useEditorStore((s) => s.wallEditor !== null);
    const invalidate = useThree((s) => s.invalidate);
    useEffect(() => onAvatarPose(invalidate), [invalidate]);
    // Labels are redrawn once the label font has loaded.
    const [labelVersion, setLabelVersion] = useState(0);
    useEffect(() => onLabelTexturesChanged(() => setLabelVersion((v) => v + 1)), []);

    return (
        <group visible={!wallEditorOpen}>
            {sessions.map((session) => {
                const member = members.find((m) => m.session === session && m.versionId === activeVersionId);
                // In the 2D wall editor someone has no place in the room.
                if (!member || member.mode === 'wallEditor') return null;
                return <BlobAvatar key={session} member={member} labelVersion={labelVersion} />;
            })}
        </group>
    );
};

/** The person's name as a pill in their colour, at a constant size on screen. */
function useNameLabel(member: PresenceMember, labelVersion: number) {
    const camera = useThree((s) => s.camera);
    const viewportHeight = useThree((s) => s.size.height);
    const tex = useMemo(
        () => getLabelTexture(member.name, { background: member.color, color: '#09090b' }),
        [member.name, member.color, labelVersion], // eslint-disable-line react-hooks/exhaustive-deps
    );
    // With sizeAttenuation off, a sprite of scale s covers s · cot(fov/2) · H/2 pixels.
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
    const k = (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, viewportHeight);
    return { texture: tex.texture, scale: [tex.width * k, tex.height * k] as [number, number] };
}

/**
 * A slime blob in the person's colour with their name above it: at chest height where they walk
 * in first person, right where they look from in the orbit view.
 */
const BlobAvatar = ({ member, labelVersion }: { member: PresenceMember; labelVersion: number }) => {
    const label = useNameLabel(member, labelVersion);
    return <SlimeBlob id={member.session} color={member.color} label={label} floating={member.mode === 'orbit'} />;
};
