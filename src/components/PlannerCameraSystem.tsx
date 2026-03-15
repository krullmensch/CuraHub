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
    FIRST_PERSON: {
        minDistance: 1,
        maxDistance: 50,
    },
};

export const PlannerCameraSystem = () => {
    const viewMode = useEditorStore(state => state.plannerViewMode);
    const orbitState = useEditorStore(state => state.orbitCameraState);
    const fpState = useEditorStore(state => state.firstPersonCameraState);
    const updateOrbitState = useEditorStore(state => state.updateOrbitCameraState);
    const updateFPState = useEditorStore(state => state.updateFirstPersonCameraState);
    const isDialogOpen = useEditorStore(state => state.isDialogOpen);
    const isTransforming = useEditorStore(state => state.isTransforming);

    const focusTarget = useEditorStore(state => state.focusTarget);
    const setFocusTarget = useEditorStore(state => state.setFocusTarget);

    const perspRef = useRef<THREE.PerspectiveCamera>(null);
    const fpRef = useRef<THREE.PerspectiveCamera>(null);
    const orbitControlsRef = useRef<OrbitControlsImpl>(null);
    const lastOrbitTarget = useRef<THREE.Vector3>(new THREE.Vector3(...orbitState.target));
    
    // Imperative Camera State Initialization
    useEffect(() => {
        if (viewMode === 'perspective') {
            if (perspRef.current) perspRef.current.position.fromArray(orbitState.position);
            if (orbitControlsRef.current) {
                orbitControlsRef.current.target.fromArray(orbitState.target);
                orbitControlsRef.current.update();
            }
        } else if (viewMode === 'firstPerson') {
            if (fpRef.current) {
                fpRef.current.position.fromArray(fpState.position);
                fpRef.current.rotation.fromArray(fpState.rotation as any);
            }
        }
        // IMPORTANT: We only want to run this when toggling viewModes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode]);

    // Save FP and Perspective state on mode change (exit)
    useEffect(() => {
        const currentFpRef = fpRef.current;
        const currentPersp = perspRef.current;
        const targetToSave = lastOrbitTarget.current;
        
        return () => {
             if (viewMode === 'firstPerson' && currentFpRef) {
                 updateFPState({
                     position: currentFpRef.position.toArray(),
                     rotation: [currentFpRef.rotation.x, currentFpRef.rotation.y, currentFpRef.rotation.z]
                 });
             } else if (viewMode === 'perspective' && currentPersp) {
                 updateOrbitState({
                     position: currentPersp.position.toArray(),
                     target: targetToSave.toArray(),
                 });
             }
        };
    }, [viewMode, updateFPState, updateOrbitState]);

    // Listen for 'H' key to center room
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'h') {
                if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
                setFocusTarget({ target: [0, 0, 0], isHoming: true });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setFocusTarget]);

    // Continuous State Update & Animation
    useFrame((_, delta) => {
        if (viewMode === 'perspective' && orbitControlsRef.current && perspRef.current) {
            
            // Track the real orbit target to bypass React's reactive loop on unmount
            lastOrbitTarget.current.copy(orbitControlsRef.current.target);

            if (focusTarget) {
                const targetV = new THREE.Vector3(...focusTarget.target);
                const t = orbitControlsRef.current.target;
                const p = perspRef.current.position;
                const isHoming = focusTarget.isHoming;
                
                const dampFactor = 1 - Math.exp(-10 * delta);

                t.lerp(targetV, dampFactor);
                
                const distance = isHoming ? 15 : 3.5;
                const dir = new THREE.Vector3().subVectors(p, targetV);
                if (dir.lengthSq() === 0) dir.set(0, 0, 1);
                else dir.normalize();
                
                const desiredPos = new THREE.Vector3().copy(targetV).add(dir.multiplyScalar(distance));
                if (isHoming) desiredPos.y = Math.max(desiredPos.y, 10);

                p.lerp(desiredPos, dampFactor);
                
                if (t.distanceTo(targetV) < 0.1 && p.distanceTo(desiredPos) < 0.1) {
                    setFocusTarget(null);
                }
                
                orbitControlsRef.current.update();
            }
        }
    });

    return (
        <>
            <PerspectiveCamera
                ref={perspRef}
                makeDefault={viewMode === 'perspective'}
                fov={60}
                near={0.1}
                far={1000}
            />
            
            <PerspectiveCamera
                ref={fpRef}
                makeDefault={viewMode === 'firstPerson'}
                fov={75}
                near={0.1}
                far={1000}
            />

            {viewMode === 'perspective' && (
                <OrbitControls
                    ref={orbitControlsRef}
                    makeDefault
                    enableDamping
                    dampingFactor={0.05}
                    minDistance={CAMERA_LIMITS.PERSPECTIVE.minDistance}
                    maxDistance={CAMERA_LIMITS.PERSPECTIVE.maxDistance}
                    enableRotate={true}
                    enabled={!isTransforming}
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
