import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useEditorStore } from '@/store/editorStore';
import { useLiveStore } from '@/store/liveStore';
import { reportCamera } from '@/lib/live/cameraPose';
import { setPreviewInvalidator, stepPreviews } from '@/lib/live/remotePreviews';
import { objectForKey } from '@/lib/live/sceneObjects';
import { avatarPose, avatarSessions, onAvatarPose, onAvatarSessionsChanged } from '@/lib/live/avatarPoses';
import { getLabelTexture, onLabelTexturesChanged } from '@/lib/measureLabelTextures';
import { SCALE_FIGURE_MESH, SCALE_FIGURE_URL } from '@/lib/scaleFigure';
import { avatarLabelHeight, avatarPlacement } from '@/lib/live/avatarPlacement';
import type { PresenceMember } from '@/lib/live/protocol';
import { RemoteSelectionTracker } from './RemoteSelections';

/**
 * What other tabs show in this editor's scene (live collaboration, step 4): their objects
 * moving while they drag them, and their avatars — the scale figure in their colour where they
 * walk in first person, a small camera where they look from in the orbit view. Also reports
 * this tab's own camera for the others. Mounted inside the editor's Canvas.
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

const RemoteAvatars = () => {
    const sessions = useSyncExternalStore(onAvatarSessionsChanged, avatarSessions);
    const members = useLiveStore((s) => s.members);
    const activeVersionId = useEditorStore((s) => s.activeVersionId);
    const wallEditorOpen = useEditorStore((s) => s.wallEditor !== null);
    const { nodes } = useGLTF(SCALE_FIGURE_URL);
    const geometry = (nodes[SCALE_FIGURE_MESH] as THREE.Mesh).geometry;
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
                return <Avatar key={session} member={member} geometry={geometry} labelVersion={labelVersion} />;
            })}
        </group>
    );
};

const CAMERA_MARKER = new THREE.ConeGeometry(0.11, 0.26, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4);
const CAMERA_HEAD = new THREE.SphereGeometry(0.07, 16, 12).translate(0, 0, 0.13);
/** Approach rate of the easing (per second); poses arrive ~10 times a second. */
const EASE_RATE = 12;
const _target = new THREE.Vector3();
const _targetQ = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _toCamera = new THREE.Vector3();

const Avatar = ({ member, geometry, labelVersion }: { member: PresenceMember; geometry: THREE.BufferGeometry; labelVersion: number }) => {
    const firstPerson = member.mode === 'firstPerson';
    const group = useRef<THREE.Group>(null);
    const body = useRef<THREE.Group>(null);
    const label = useRef<THREE.Sprite>(null);
    const placed = useRef(false);
    const camera = useThree((s) => s.camera);
    const viewportHeight = useThree((s) => s.size.height);
    const invalidate = useThree((s) => s.invalidate);

    const material = useMemo(() => new THREE.MeshStandardMaterial({
        color: member.color,
        emissive: member.color,
        emissiveIntensity: 0.25,
        roughness: 0.6,
    }), [member.color]);
    useEffect(() => () => material.dispose(), [material]);

    const tex = useMemo(
        () => getLabelTexture(member.name, { background: member.color, color: '#09090b' }),
        [member.name, member.color, labelVersion], // eslint-disable-line react-hooks/exhaustive-deps
    );
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
    const k = (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, viewportHeight);

    useFrame(({ camera: cam }, delta) => {
        const g = group.current;
        const b = body.current;
        const pose = avatarPose(member.session);
        if (!g || !b || !pose) return;
        const place = avatarPlacement(pose, firstPerson);
        _target.set(...place.position);
        _targetQ.setFromEuler(_euler.set(place.pitch, place.yaw, 0, 'YXZ'));
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
        if (label.current) label.current.visible = _toCamera.copy(cam.position).sub(g.position).lengthSq() > 0.04;
    });

    return (
        <group ref={group}>
            {/* Turned (and, for the camera marker, tilted) like the other person's view; the label stays upright. */}
            <group ref={body}>
                {firstPerson ? (
                    // The figure faces +Z; the camera looks along −Z: half a turn.
                    <mesh geometry={geometry} material={material} rotation={[0, Math.PI, 0]} raycast={noRaycast} />
                ) : (
                    <>
                        <mesh geometry={CAMERA_MARKER} material={material} raycast={noRaycast} />
                        <mesh geometry={CAMERA_HEAD} material={material} raycast={noRaycast} />
                    </>
                )}
            </group>
            <sprite
                ref={label}
                position={[0, avatarLabelHeight(firstPerson), 0]}
                scale={[tex.width * k, tex.height * k, 1]}
                raycast={noRaycast}
                renderOrder={12}
            >
                <spriteMaterial map={tex.texture} sizeAttenuation={false} depthWrite={false} depthTest={false} transparent toneMapped={false} />
            </sprite>
        </group>
    );
};
