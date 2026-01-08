import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, OrbitControls, PointerLockControls, KeyboardControls } from '@react-three/drei';
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
    ORTHOGRAPHIC: {
        minZoom: 20,      // Furthest out (smaller number = wider view)
        maxZoom: 200      // Closest in (larger number = tighter view)
    }
};

export const PlannerCameraSystem = () => {
    const viewMode = useEditorStore(state => state.plannerViewMode);
    const orbitState = useEditorStore(state => state.orbitCameraState);
    const fpState = useEditorStore(state => state.firstPersonCameraState);
    const updateOrbitState = useEditorStore(state => state.updateOrbitCameraState);
    const updateFPState = useEditorStore(state => state.updateFirstPersonCameraState);
    const isDialogOpen = useEditorStore(state => state.isDialogOpen);

    const orthoRef = useRef<THREE.OrthographicCamera>(null);
    const perspRef = useRef<THREE.PerspectiveCamera>(null);
    const fpRef = useRef<THREE.PerspectiveCamera>(null);
    const orbitControlsRef = useRef<OrbitControlsImpl>(null);

    // Sync Orbit Cameras (Ortho <-> Persp)
    // Sync Orbit Cameras (Ortho <-> Persp)
    useEffect(() => {
        const target = new THREE.Vector3(...orbitState.target);
        
        if (viewMode === 'orthographic' && perspRef.current && orthoRef.current) {
            // Switching TO Ortho: Match position from Persp
            const dist = perspRef.current.position.distanceTo(target);
            const smartZoom = 40 / dist; // Heuristic: Zoom = Constant / Distance

            orthoRef.current.position.copy(perspRef.current.position);
            orthoRef.current.lookAt(target);
            orthoRef.current.zoom = smartZoom;
            orthoRef.current.updateProjectionMatrix();

            // Explicitly update store so controls pick it up immediately
            updateOrbitState({ zoom: smartZoom });

        } else if (viewMode === 'perspective' && orthoRef.current && perspRef.current) {
            // Switching TO Persp: Match position from Ortho
            // Inverse the formula: Distance = Constant / Zoom
            const currentZoom = Math.max(0.1, orthoRef.current.zoom); 
            const newDist = 40 / currentZoom;
            
            // Calculate new position based on direction from target
            const direction = new THREE.Vector3().subVectors(orthoRef.current.position, target).normalize();
            const newPos = target.clone().add(direction.multiplyScalar(newDist));

            perspRef.current.position.copy(newPos);
            perspRef.current.lookAt(target);
            perspRef.current.updateProjectionMatrix();

            updateOrbitState({ position: newPos.toArray() });
        }
    }, [viewMode]); // Removed orbitState deps to prevent loop, logic depends on transition only

    // Continuous State Update
    useFrame(() => {
        // Update store with current orbit camera state
        if ((viewMode === 'orthographic' || viewMode === 'perspective') && orbitControlsRef.current) {
            const cam = viewMode === 'orthographic' ? orthoRef.current : perspRef.current;
            if (cam) {
                updateOrbitState({
                    position: cam.position.toArray(),
                    target: orbitControlsRef.current.target.toArray(),
                    zoom: cam.zoom
                });
            }
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
            <OrthographicCamera
                ref={orthoRef}
                makeDefault={viewMode === 'orthographic'}
                position={orbitState.position}
                zoom={orbitState.zoom}
                near={0.1}
                far={1000}
            />

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

            {(viewMode === 'orthographic' || viewMode === 'perspective') && (
                <OrbitControls
                    ref={orbitControlsRef}
                    // Omitted camera prop; relies on default camera
                    target={new THREE.Vector3(...orbitState.target)}
                    enableDamping
                    dampingFactor={0.05}
                    
                    // Boundaries
                    minDistance={CAMERA_LIMITS.PERSPECTIVE.minDistance}
                    maxDistance={CAMERA_LIMITS.PERSPECTIVE.maxDistance}
                    minZoom={CAMERA_LIMITS.ORTHOGRAPHIC.minZoom}
                    maxZoom={CAMERA_LIMITS.ORTHOGRAPHIC.maxZoom}

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
