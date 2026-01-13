import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls, PointerLockControls, KeyboardControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useEditorStore } from '../store/editorStore';
import { PlayerController } from './Player';

// --- CONFIGURATION ---
const CAMERA_LIMITS = {
    PERSPECTIVE: {
        minDistance: 1,  // Closest you can get (meters)
        maxDistance: 50, // Furthest you can orbit (meters)
    },
    PERSPECTIVE: {
        minDistance: 1,  // Closest you can get (meters)
        maxDistance: 50, // Furthest you can orbit (meters)
    },
};

export const PlannerCameraSystem = () => {
    const viewMode = useEditorStore(state => state.plannerViewMode);
    const orbitState = useEditorStore(state => state.orbitCameraState);
    const fpState = useEditorStore(state => state.firstPersonCameraState);
    const updateOrbitState = useEditorStore(state => state.updateOrbitCameraState);
    const updateFPState = useEditorStore(state => state.updateFirstPersonCameraState);
    const isDialogOpen = useEditorStore(state => state.isDialogOpen);

    const perspRef = useRef<THREE.PerspectiveCamera>(null);
    const fpRef = useRef<THREE.PerspectiveCamera>(null);
    const orbitControlsRef = useRef<OrbitControlsImpl>(null);


    // Continuous State Update
    useFrame(() => {
        // Update store with current orbit camera state
        if (viewMode === 'perspective' && orbitControlsRef.current && perspRef.current) {
             updateOrbitState({
                 position: perspRef.current.position.toArray(),
                 target: orbitControlsRef.current.target.toArray(),
                 // zoom not needed for perspective
             });
        }
    });
    
    // Save FP state on mode change (exit)
    useEffect(() => {
        const currentFpRef = fpRef.current;
        return () => {
             if (viewMode === 'firstPerson' && currentFpRef) {
                 updateFPState({
                     position: currentFpRef.position.toArray(),
                     rotation: [currentFpRef.rotation.x, currentFpRef.rotation.y, currentFpRef.rotation.z]
                 });
             }
        };
    }, [viewMode, updateFPState]);


    return (
        <>

            <PerspectiveCamera
                ref={perspRef}
                makeDefault={viewMode === 'perspective'}
                position={orbitState.position}
                fov={60}
                near={0.1}
                far={1000}
            />
            
            <PerspectiveCamera
                ref={fpRef}
                makeDefault={viewMode === 'firstPerson'}
                position={fpState.position}
                rotation={fpState.rotation}
                fov={75}
                near={0.1}
                far={1000}
            />

            {viewMode === 'perspective' && (
                <OrbitControls
                    ref={orbitControlsRef}
                    // Omitted camera prop; relies on default camera
                    target={new THREE.Vector3(...orbitState.target)}
                    enableDamping
                    dampingFactor={0.05}
                    
                    // Boundaries
                    minDistance={CAMERA_LIMITS.PERSPECTIVE.minDistance}
                    maxDistance={CAMERA_LIMITS.PERSPECTIVE.maxDistance}

                    enableRotate={true} 
                    mouseButtons={{
                        LEFT: THREE.MOUSE.ROTATE,
                        MIDDLE: THREE.MOUSE.ROTATE,
                        RIGHT: THREE.MOUSE.PAN
                    }}
                />
            )}

            {viewMode === 'firstPerson' && (
                <>
                    <PointerLockControls selector="#root" /> 
                    {/* Omitted camera prop; relies on default camera */}
                    <KeyboardControls
                        map={[
                            { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
                            { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
                            { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
                            { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
                            { name: 'jump', keys: ['Space'] },
                            { name: 'run', keys: ['Shift'] },
                        ]}
                    >
                         <PlayerController paused={isDialogOpen} />
                    </KeyboardControls>
                </>
            )}
        </>
    );
};
