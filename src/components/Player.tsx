import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, KeyboardControls, useKeyboardControls } from '@react-three/drei';
import { RigidBody, CapsuleCollider, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useEditorStore } from '../store/editorStore';

const SPEED = 5;

const PlayerController = ({ paused }: { paused: boolean }) => {
    const { camera } = useThree();
    const [, getKeys] = useKeyboardControls();
    const rigidBody = useRef<RapierRigidBody>(null);

    // Initial camera setup - only run once on mount
    useEffect(() => {
        // Only reset if we are just starting or purely resetting. 
        // If we keep this mounted, it's fine.
        // camera.rotation.set(0, 0, 0); 
    }, [camera]);
    
    useFrame(() => {
        if (!rigidBody.current) return;
        
        // If paused, just dampen velocity to zero and return
        if (paused) {
            rigidBody.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            return;
        }

        const { forward, backward, left, right } = getKeys();

        // Use getWorldDirection method which was reliable before
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
        
        // No need to applyEuler here because front/side are already world direction
        if (direction.lengthSq() > 0) {
            direction.normalize();
        }
        
        // Apply velocity to body
        const currentVel = rigidBody.current.linvel();
        
        // We change X/Z velocity but keep Y (gravity) unless jumping (not impl yet)
        rigidBody.current.setLinvel(
            { 
                x: direction.x * SPEED, 
                y: currentVel.y, 
                z: direction.z * SPEED 
            }, 
            true
        );
        
        // Sync Camera to Body
        const translation = rigidBody.current.translation();
        camera.position.set(translation.x, translation.y + 0.8, translation.z); 
    });

    return (
        <RigidBody 
            ref={rigidBody} 
            colliders={false} 
            mass={1} 
            type="dynamic" 
            position={[0, 2, 0]} 
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
