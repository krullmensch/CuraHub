import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, KeyboardControls, PointerLockControls, useKeyboardControls } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider, CapsuleCollider, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import type { GLTF } from 'three-stdlib';
import {
    useEditorStore,
    modelBBoxMap,
    type ArtworkInstanceData,
    type ModularWallData,
} from '../../store/editorStore';
import { modelBBoxCenterMap } from './modelBBoxCenterMap';

/**
 * The ONLY place in the app that imports @react-three/rapier (LOAD-01 / RND-08).
 * The ~2 MB base64 Rapier WASM blob only ends up in this lazily-loaded chunk,
 * which is mounted:
 *  - in the Editor only while `plannerViewMode === 'firstPerson'`
 *  - in the Viewer always (it is FPV-only)
 *
 * Renders <Physics>, the first-person player body + camera sync (moved from
 * Player.tsx), and every collider: room (trimesh, same node geometries as
 * Satellit.tsx), modular walls (cuboid), and 3D model instances (cuboid, from
 * modelBBoxMap/modelBBoxCenterMap + instance transform — same math ModelInstance
 * used to do inline).
 */

const SPEED = 3.5;
const ACCEL_FACTOR = 12;
const DECEL_FACTOR = 10;
const IDLE_BOB_SPEED = 0.6;
const IDLE_BOB_AMOUNT_Y = 0.003;
const IDLE_BOB_AMOUNT_X = 0.002;

const KEY_MAP = [
    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
    { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
    { name: 'jump', keys: ['Space'] },
    { name: 'run', keys: ['Shift'] },
    { name: 'noclip', keys: ['c', 'C'] },
];

// --- Player body (RigidBody-driven movement + camera sync), moved from Player.tsx ---
const PlayerBody = ({ paused }: { paused: boolean }) => {
    const { camera } = useThree();
    const [, getKeys] = useKeyboardControls();
    const rigidBody = useRef<RapierRigidBody>(null);
    const currentVelocity = useRef(new THREE.Vector2(0, 0));

    useEffect(() => {
        camera.rotation.set(0, -1.1, 0);
    }, [camera]);

    useFrame((state, delta) => {
        if (!rigidBody.current) return;

        if (paused) {
            currentVelocity.current.set(0, 0);
            rigidBody.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            return;
        }

        const { forward, backward, left, right } = getKeys();

        const frontVector = new THREE.Vector3();
        camera.getWorldDirection(frontVector);
        frontVector.y = 0;
        frontVector.normalize();

        const sideVector = new THREE.Vector3();
        sideVector.copy(frontVector).cross(new THREE.Vector3(0, 1, 0)).normalize();

        const direction = new THREE.Vector3();
        if (forward) direction.add(frontVector);
        if (backward) direction.sub(frontVector);
        if (right) direction.add(sideVector);
        if (left) direction.sub(sideVector);

        const isMoving = direction.lengthSq() > 0;
        if (isMoving) direction.normalize();

        const targetX = direction.x * SPEED;
        const targetZ = direction.z * SPEED;
        const lerpRate = isMoving ? ACCEL_FACTOR : DECEL_FACTOR;
        const t = 1 - Math.exp(-lerpRate * delta);

        currentVelocity.current.x += (targetX - currentVelocity.current.x) * t;
        currentVelocity.current.y += (targetZ - currentVelocity.current.y) * t;

        if (!isMoving && currentVelocity.current.length() < 0.05) {
            currentVelocity.current.set(0, 0);
        }

        const physVel = rigidBody.current.linvel();
        rigidBody.current.setLinvel(
            { x: currentVelocity.current.x, y: physVel.y, z: currentVelocity.current.y },
            true
        );

        const translation = rigidBody.current.translation();
        const baseY = translation.y + 0.8;

        const speed = currentVelocity.current.length();
        const idleBlend = Math.max(0, 1 - speed / 0.5);
        const elapsed = state.clock.elapsedTime;
        const bobY = Math.sin(elapsed * IDLE_BOB_SPEED * Math.PI * 2) * IDLE_BOB_AMOUNT_Y * idleBlend;
        const bobX = Math.sin(elapsed * IDLE_BOB_SPEED * 0.7 * Math.PI * 2) * IDLE_BOB_AMOUNT_X * idleBlend;

        camera.position.set(translation.x + bobX, baseY + bobY, translation.z);
    });

    return (
        <RigidBody
            ref={rigidBody}
            colliders={false}
            mass={1}
            type="dynamic"
            position={[-5.99, 0.8, 2.6]}
            enabledRotations={[false, false, false]}
            lockRotations
        >
            <CapsuleCollider args={[0.5, 0.3]} />
        </RigidBody>
    );
};

// --- Room colliders: same node geometries Satellit.tsx renders, trimesh, invisible ---
type SatellitNodes = GLTF & {
    nodes: {
        Decke001: THREE.Mesh;
        Grundriss002: THREE.Mesh;
        Boden001: THREE.Mesh;
        Fenster001: THREE.Mesh;
        Traversen: THREE.Mesh;
        Tür2001: THREE.Mesh;
        Tür1001: THREE.Mesh;
        Fensterbank: THREE.Mesh;
    };
};

const RoomColliders = () => {
    const { nodes } = useGLTF('/models/Satellit_new-optimized.glb') as unknown as SatellitNodes;
    return (
        // The collider meshes are invisible (the visible room is rendered by Satellit.tsx).
        // @react-three/rapier builds auto colliders via traverseVisible() unless
        // includeInvisible is set — without it the room has NO collision and the player
        // falls through the floor.
        <RigidBody type="fixed" colliders="trimesh" includeInvisible>
            <mesh geometry={nodes.Decke001.geometry} visible={false} />
            <mesh geometry={nodes.Grundriss002.geometry} visible={false} />
            <mesh geometry={nodes.Boden001.geometry} visible={false} />
            <mesh geometry={nodes.Fenster001.geometry} visible={false} />
            <mesh
                geometry={nodes.Traversen.geometry}
                position={[-3.051, 3.453, -1.501]}
                rotation={[0, Math.PI / 2, 0]}
                visible={false}
            />
            <mesh geometry={nodes.Tür2001.geometry} position={[6.33, 1, 0.12]} visible={false} />
            <mesh geometry={nodes.Tür1001.geometry} position={[-6.33, 1, 2.372]} visible={false} />
            <mesh geometry={nodes.Fensterbank.geometry} visible={false} />
        </RigidBody>
    );
};

// --- Wall colliders ---
const WallColliders = ({ walls }: { walls: ModularWallData[] }) => (
    <>
        {walls.map((wall) => (
            <RigidBody
                key={wall.id}
                type="fixed"
                colliders={false}
                position={[wall.position_x, wall.position_y, wall.position_z]}
                rotation={[wall.rotation_x, wall.rotation_y, wall.rotation_z]}
            >
                <CuboidCollider args={[wall.width / 2, wall.height / 2, wall.thickness / 2]} />
            </RigidBody>
        ))}
    </>
);

// --- Model instance colliders (bbox published by ModelInstance.tsx via the two maps) ---
const ModelInstanceCollider = ({ instance }: { instance: ArtworkInstanceData }) => {
    // modelBBoxMap/modelBBoxCenterMap are plain Maps, not reactive store state — they
    // are populated by ModelInstance's own effect on mount. Poll briefly until the
    // visual component (always mounted) has published the bbox.
    const [, forceTick] = useState(0);
    const size = modelBBoxMap.get(instance.id);
    const center = modelBBoxCenterMap.get(instance.id);

    useEffect(() => {
        if (size && center) return;
        const id = setInterval(() => forceTick((v) => v + 1), 100);
        return () => clearInterval(id);
    }, [size, center]);

    if (!size || !center) return null;

    return (
        <group
            position={[instance.position_x, instance.position_y, instance.position_z]}
            rotation={[instance.rotation_x, instance.rotation_y, instance.rotation_z]}
            scale={[instance.scale_x, instance.scale_y, instance.scale_z]}
        >
            <RigidBody type="fixed" colliders={false}>
                <CuboidCollider
                    args={[size.x / 2, size.y / 2, size.z / 2]}
                    position={[center.x, center.y, center.z]}
                />
            </RigidBody>
        </group>
    );
};

const ModelColliders = ({ instances }: { instances: ArtworkInstanceData[] }) => (
    <>
        {instances
            .filter((i) => (i.artwork?.asset?.type || 'image') === 'model3d')
            .map((instance) => (
                <ModelInstanceCollider key={instance.id} instance={instance} />
            ))}
    </>
);

interface PhysicsLayerProps {
    isEditor?: boolean;
    viewerWalls?: ModularWallData[];
    viewerInstances?: ArtworkInstanceData[];
}

const PhysicsLayer = ({ isEditor = true, viewerWalls, viewerInstances }: PhysicsLayerProps) => {
    const isDialogOpen = useEditorStore((state) => state.isDialogOpen);
    const localWalls = useEditorStore((state) => state.localWalls);
    const localInstances = useEditorStore((state) => state.localInstances);

    const walls = viewerWalls ?? localWalls;
    const instances = viewerInstances ?? localInstances;

    // Room boundary/wall colliders are static per data set; memoize the arrays we pass
    // down so children don't re-render on unrelated store churn.
    const wallsMemo = useMemo(() => walls, [walls]);
    const instancesMemo = useMemo(() => instances, [instances]);

    return (
        <Physics gravity={[0, -9.81, 0]}>
            <RoomColliders />
            <WallColliders walls={wallsMemo} />
            <ModelColliders instances={instancesMemo} />
            <KeyboardControls map={KEY_MAP}>
                <PlayerBody paused={isDialogOpen} />
                {/* Editor: pointer lock stays engaged while in FPV regardless of dialogs
                    (matches previous PlannerCameraSystem behaviour). Viewer: pointer lock
                    releases while a dialog/overlay is open (matches previous Player.tsx). */}
                {(isEditor || !isDialogOpen) && <PointerLockControls selector="#root" />}
            </KeyboardControls>
        </Physics>
    );
};

export default PhysicsLayer;
