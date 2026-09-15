import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, KeyboardControls, useKeyboardControls } from '@react-three/drei';
import { RigidBody, CapsuleCollider, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useEditorStore } from '../store/editorStore';
import { firstPersonTransition } from '../lib/cameraTransition';

const SPEED = 3.5;
const ACCEL_FACTOR = 12;  // How fast we reach target speed (higher = snappier)
const DECEL_FACTOR = 10;  // How fast we slow down (higher = less slide)

// Idle head sway constants
const IDLE_BOB_SPEED = 0.6;       // Breathing rhythm (Hz-ish)
const IDLE_BOB_AMOUNT_Y = 0.003;  // Vertical sway amplitude
const IDLE_BOB_AMOUNT_X = 0.002;  // Horizontal sway amplitude

/** Height of the camera above the player body's center. */
export const PLAYER_EYE_OFFSET = 0.8;
const DEFAULT_SPAWN: [number, number, number] = [-5.99, 0.8, 2.6];
const DEFAULT_ROTATION: [number, number, number] = [0, -1.1, 0];

interface PlayerControllerProps {
    paused: boolean;
    /** Body center at mount. Read once — later changes don't teleport the player. */
    spawn?: [number, number, number];
    /** Camera rotation (Euler XYZ) at mount. */
    initialRotation?: [number, number, number];
}

export const PlayerController = ({ paused, spawn = DEFAULT_SPAWN, initialRotation = DEFAULT_ROTATION }: PlayerControllerProps) => {
    const { camera } = useThree();
    const [, getKeys] = useKeyboardControls();
    const rigidBody = useRef<RapierRigidBody>(null);
    const currentVelocity = useRef(new THREE.Vector2(0, 0)); // smoothed XZ velocity

    const [spawnPosition] = useState(spawn);
    const [spawnRotation] = useState(initialRotation);

    useEffect(() => {
        // Apply initial rotation on mount (saved view when returning to first person). While the
        // editor's camera flight is running it sets the same rotation when it lands.
        if (firstPersonTransition.active) return;
        camera.rotation.set(spawnRotation[0], spawnRotation[1], spawnRotation[2]);
    }, [camera, spawnRotation]);

    useFrame((state, delta) => {
        if (!rigidBody.current) return;
        // Editor camera still flying into first person — don't move or steer yet.
        if (firstPersonTransition.active) return;

        // If paused, just dampen velocity to zero and return
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
        if (isMoving) {
            direction.normalize();
        }

        // Smooth acceleration / deceleration
        const targetX = direction.x * SPEED;
        const targetZ = direction.z * SPEED;
        const lerpRate = isMoving ? ACCEL_FACTOR : DECEL_FACTOR;
        const t = 1 - Math.exp(-lerpRate * delta); // frame-rate independent lerp

        currentVelocity.current.x += (targetX - currentVelocity.current.x) * t;
        currentVelocity.current.y += (targetZ - currentVelocity.current.y) * t;

        // Snap to zero when very slow to avoid endless drift
        if (!isMoving && currentVelocity.current.length() < 0.05) {
            currentVelocity.current.set(0, 0);
        }

        const physVel = rigidBody.current.linvel();
        rigidBody.current.setLinvel(
            {
                x: currentVelocity.current.x,
                y: physVel.y,
                z: currentVelocity.current.y
            },
            true
        );

        // Sync Camera to Body
        const translation = rigidBody.current.translation();
        const baseY = translation.y + PLAYER_EYE_OFFSET;

        // Subtle idle head sway when standing still
        const speed = currentVelocity.current.length();
        const idleBlend = Math.max(0, 1 - speed / 0.5); // blend out as we start moving
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
            position={spawnPosition}
            enabledRotations={[false, false, false]}
            lockRotations
        >
            <CapsuleCollider args={[0.5, 0.3]} />
        </RigidBody>
    );
};

export const Player = () => {
    const isDialogOpen = useEditorStore((state) => state.isDialogOpen);

    const map = [
        { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
        { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
        { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
        { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
        { name: 'noclip', keys: ['c', 'C'] },
    ];

    // Keep PlayerController mounted so physics/position persists.
    // Only toggle PointerLockControls to free cursor.
    return (
        <KeyboardControls map={map}>
            <PlayerController paused={isDialogOpen} />
            {!isDialogOpen && <PointerLockControls selector="#root" />}
        </KeyboardControls>
    );
};
