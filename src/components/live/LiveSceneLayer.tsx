import { Suspense, lazy, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore } from '@/store/editorStore';
import { useLiveStore } from '@/store/liveStore';
import { reportCamera } from '@/lib/live/cameraPose';
import { setPreviewInvalidator, stepPreviews } from '@/lib/live/remotePreviews';
import { objectForKey } from '@/lib/live/sceneObjects';
import { avatarPose, avatarSessions, onAvatarPose, onAvatarSessionsChanged } from '@/lib/live/avatarPoses';
import { getLabelTexture, onLabelTexturesChanged } from '@/lib/measureLabelTextures';
import type { PresenceMember } from '@/lib/live/protocol';
import { RemoteSelectionTracker } from './RemoteSelections';

/**
 * What other tabs show in this editor's scene (live collaboration, step 4): their objects
 * moving while they drag them, and their avatars — a slime blob in their colour where they walk
 * in first person (like visitors in the public viewer), a small camera where they look from in
 * the orbit view, both with their name. Also reports this tab's own camera for the others.
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

const noRaycast = () => null;

// MarchingCubes only loads once somebody walks around in first person.
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
                return member.mode === 'firstPerson'
                    ? <WalkingAvatar key={session} member={member} labelVersion={labelVersion} />
                    : <CameraAvatar key={session} member={member} labelVersion={labelVersion} />;
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

/** Walking in first person: a slime blob in the person's colour, with their name above it. */
const WalkingAvatar = ({ member, labelVersion }: { member: PresenceMember; labelVersion: number }) => {
    const label = useNameLabel(member, labelVersion);
    return <SlimeBlob id={member.session} color={member.color} label={label} />;
};

const CAMERA_MARKER = new THREE.ConeGeometry(0.11, 0.26, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4);
const CAMERA_HEAD = new THREE.SphereGeometry(0.07, 16, 12).translate(0, 0, 0.13);
/** Name label height above the camera marker. */
const CAMERA_LABEL_HEIGHT = 0.22;
/** Approach rate of the easing (per second); poses arrive ~10 times a second. */
const EASE_RATE = 12;
const _target = new THREE.Vector3();
const _targetQ = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _toCamera = new THREE.Vector3();

/** Looking at the room from outside (orbit view): a small camera where they look from, turned and tilted like it. */
const CameraAvatar = ({ member, labelVersion }: { member: PresenceMember; labelVersion: number }) => {
    const group = useRef<THREE.Group>(null);
    const body = useRef<THREE.Group>(null);
    const labelSprite = useRef<THREE.Sprite>(null);
    const placed = useRef(false);
    const invalidate = useThree((s) => s.invalidate);
    const label = useNameLabel(member, labelVersion);

    const material = useMemo(() => new THREE.MeshStandardMaterial({
        color: member.color,
        emissive: member.color,
        emissiveIntensity: 0.25,
        roughness: 0.6,
    }), [member.color]);
    useEffect(() => () => material.dispose(), [material]);

    useFrame(({ camera: cam }, delta) => {
        const g = group.current;
        const b = body.current;
        const pose = avatarPose(member.session);
        if (!g || !b || !pose) return;
        _target.set(...pose.p);
        _targetQ.setFromEuler(_euler.set(pose.pitch, pose.yaw, 0, 'YXZ'));
        if (!placed.current) {
            g.position.copy(_target);
            b.quaternion.copy(_targetQ);
            placed.current = true;
        } else {
            const t = 1 - Math.exp(-EASE_RATE * delta);
            g.position.lerp(_target, t);
            b.quaternion.slerp(_targetQ, t);
        }
        if (g.position.distanceToSquared(_target) > 1e-6 || b.quaternion.angleTo(_targetQ) > 1e-3) invalidate();
        // Hide the label of an avatar right at this tab's own camera (same spot, e.g. both in a corner).
        if (labelSprite.current) labelSprite.current.visible = _toCamera.copy(cam.position).sub(g.position).lengthSq() > 0.04;
    });

    return (
        <group ref={group}>
            {/* Turned and tilted like the other person's view; the label stays upright. */}
            <group ref={body}>
                <mesh geometry={CAMERA_MARKER} material={material} raycast={noRaycast} />
                <mesh geometry={CAMERA_HEAD} material={material} raycast={noRaycast} />
            </group>
            <sprite
                ref={labelSprite}
                position={[0, CAMERA_LABEL_HEIGHT, 0]}
                scale={[label.scale[0], label.scale[1], 1]}
                raycast={noRaycast}
                renderOrder={12}
            >
                <spriteMaterial map={label.texture} sizeAttenuation={false} depthWrite={false} depthTest={false} transparent toneMapped={false} />
            </sprite>
        </group>
    );
};
