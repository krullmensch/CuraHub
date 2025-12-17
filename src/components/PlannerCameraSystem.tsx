import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, OrbitControls, PointerLockControls, KeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { useEditorStore } from '../store/editorStore';
import { PlayerController } from './Player';

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
    const orbitControlsRef = useRef<any>(null);

    // Sync Orbit Cameras (Ortho <-> Persp)
    useEffect(() => {
        if (viewMode === 'orthographic' && perspRef.current && orthoRef.current) {
            // Switching TO Ortho: Match position from Persp
            orthoRef.current.position.copy(perspRef.current.position);
            orthoRef.current.lookAt(new THREE.Vector3(...orbitState.target));
            orthoRef.current.zoom = orbitState.zoom;
            orthoRef.current.updateProjectionMatrix();
        } else if (viewMode === 'perspective' && orthoRef.current && perspRef.current) {
            // Switching TO Persp: Match position from Ortho
            perspRef.current.position.copy(orthoRef.current.position);
            perspRef.current.lookAt(new THREE.Vector3(...orbitState.target));
            perspRef.current.updateProjectionMatrix();
        }
    }, [viewMode, orbitState.target, orbitState.zoom]);

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
                    minDistance={1}
                    maxDistance={50}
                    mouseButtons={{
                        LEFT: undefined, // Free for selection
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
