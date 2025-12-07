import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, KeyboardControls, useKeyboardControls } from '@react-three/drei';
import { RigidBody, CapsuleCollider, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

const SPEED = 5;

const PlayerController = () => {
    const { camera } = useThree();
    const [, getKeys] = useKeyboardControls();
    const rigidBody = useRef<RapierRigidBody>(null);
    // We used to simulate direction vector, now we apply velocity to the RB
    // and sync camera to RB.
    
    useFrame(() => {
        const { forward, backward, left, right } = getKeys();
        
        if (!rigidBody.current) return;

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
        // Capsule center is at translation.
        // If capsule is height ~1.6m resting on ground, center is at 0.8m.
        // We want eyes at ~1.6m. So offset is 0.8m.
        // Let's try offset 0.8 first.
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
            {/* args=[halfHeight, radius] for Rapier? or [height, radius]? 
                Rapier React: args={[halfHeight, radius]} usually. 
                Height 1.7m human: Radius 0.3 -> Diameter 0.6.
                Total height = 2*radius + 2*halfHeight.
                If we want 1.7m total: 0.6 + 2*hh = 1.7 -> 2*hh = 1.1 -> hh = 0.55
            */}
        </RigidBody>
    );
};

export const Player = () => {
    const map = [
        { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
        { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
        { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
        { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
        { name: 'noclip', keys: ['c', 'C'] },
    ];

    return (
        <KeyboardControls map={map}>
            <PlayerController />
            <PointerLockControls />
        </KeyboardControls>
    );
};
