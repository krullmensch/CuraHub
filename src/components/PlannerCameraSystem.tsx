import { useRef, useEffect, useCallback, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls, PointerLockControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useEditorStore, type WallEditorTarget } from '../store/editorStore';
import { firstPersonTransition } from '../lib/cameraTransition';
import { measureViewportInsets, useWallEditorView } from '../store/wallEditorViewStore';
import { getWallFrame, wallToWorld } from '../lib/wallEditor/geometry';
import { WallEditorCamera } from './wall-editor/WallEditorCamera';

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

/** Camera flight between the orbit view and the first-person pose (both directions). */
const CAMERA_TRANSITION_MS = 900;
/** Camera flight between the orbit view and the 2D wall editor (both directions). */
const WALL_TRANSITION_MS = 750;
const FP_FOV = 75;
const ORBIT_FOV = 60;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface OrbitTransition {
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toPos: THREE.Vector3;
    toTarget: THREE.Vector3;
    start: number;
    fromFov?: number;
    toFov?: number;
    duration?: number;
    /** Runs once the flight has landed. */
    onDone?: () => void;
}

/**
 * Perspective pose that shows the wall face exactly like the 2D editor's orthographic view
 * (same centre, same scale in the wall plane).
 */
function wallViewPose(wall: Parameters<typeof getWallFrame>[0], target: WallEditorTarget, fov: number) {
    const view = useWallEditorView.getState();
    const frame = getWallFrame(wall, target.side);
    const distance = Math.max(
        CAMERA_LIMITS.PERSPECTIVE.minDistance,
        view.viewportH / (2 * view.pxPerM * Math.tan(THREE.MathUtils.degToRad(fov) / 2)),
    );
    return {
        target: wallToWorld(frame, view.centerU, view.centerV, 0),
        position: wallToWorld(frame, view.centerU, view.centerV, distance),
    };
}

interface FirstPersonTransitionState {
    fromPos: THREE.Vector3;
    fromQuat: THREE.Quaternion;
    fromFov: number;
    toPos: THREE.Vector3;
    toQuat: THREE.Quaternion;
    toRotation: [number, number, number];
    start: number;
}

export const PlannerCameraSystem = () => {
    const viewMode = useEditorStore(state => state.plannerViewMode);
    const orbitState = useEditorStore(state => state.orbitCameraState);
    const fpState = useEditorStore(state => state.firstPersonCameraState);
    const updateOrbitState = useEditorStore(state => state.updateOrbitCameraState);
    const updateFPState = useEditorStore(state => state.updateFirstPersonCameraState);
    const isTransforming = useEditorStore(state => state.isTransforming);

    const focusTarget = useEditorStore(state => state.focusTarget);
    const setFocusTarget = useEditorStore(state => state.setFocusTarget);
    const invalidate = useThree(state => state.invalidate);
    const setEvents = useThree(state => state.setEvents);
    const setPlannerViewMode = useEditorStore(state => state.setPlannerViewMode);
    const wallEditor = useEditorStore(state => state.wallEditor);
    const wallPhase = useWallEditorView(state => state.phase);
    const gl = useThree(state => state.gl);

    const perspRef = useRef<THREE.PerspectiveCamera>(null);
    // OrbitControls must always drive the orbit camera. Without an explicit camera it binds to the
    // current default camera — right after leaving first person that is still the FP camera, and
    // the OrbitControls constructor's update() turned it to look at the orbit target before its
    // pose was saved (wrong view on the next V, wrong start direction of the fly-back).
    const [perspCamera, setPerspCamera] = useState<THREE.PerspectiveCamera | null>(null);
    const attachPerspCamera = useCallback((camera: THREE.PerspectiveCamera | null) => {
        perspRef.current = camera;
        setPerspCamera(camera);
    }, []);
    const fpRef = useRef<THREE.PerspectiveCamera>(null);
    const orbitControlsRef = useRef<OrbitControlsImpl>(null);
    const lastOrbitTarget = useRef<THREE.Vector3>(new THREE.Vector3(...orbitState.target));
    const prevViewMode = useRef(viewMode);
    const orbitTransition = useRef<OrbitTransition | null>(null);
    const fpTransition = useRef<FirstPersonTransitionState | null>(null);
    // 2D wall editor: the face that is open and the orbit pose to return to
    const openWall = useRef<WallEditorTarget | null>(null);
    const orbitPoseBeforeWall = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
    
    // Imperative Camera State Initialization
    useEffect(() => {
        const fp = fpRef.current;
        if (viewMode !== 'firstPerson' && fpTransition.current) {
            // Left first person mid-flight (the save effect already stored the flight's target).
            fpTransition.current = null;
            firstPersonTransition.active = false;
        }
        if (viewMode === 'perspective' && prevViewMode.current === 'firstPerson' && fp && perspRef.current && orbitControlsRef.current) {
            // Start at the player's eye point, looking where the player looked, then fly back.
            const fromPos = fp.position.clone();
            const fromTarget = fromPos.clone().add(fp.getWorldDirection(new THREE.Vector3()).multiplyScalar(2));
            perspRef.current.position.copy(fromPos);
            perspRef.current.fov = FP_FOV;
            perspRef.current.updateProjectionMatrix();
            orbitControlsRef.current.target.copy(fromTarget);
            orbitControlsRef.current.enabled = false;
            orbitControlsRef.current.update();
            orbitTransition.current = {
                fromPos,
                fromTarget,
                toPos: new THREE.Vector3(...orbitState.position),
                toTarget: new THREE.Vector3(...orbitState.target),
                start: performance.now(),
            };
            invalidate();
        } else if (viewMode === 'perspective') {
            if (perspRef.current) perspRef.current.position.fromArray(orbitState.position);
            if (orbitControlsRef.current) {
                orbitControlsRef.current.target.fromArray(orbitState.target);
                orbitControlsRef.current.update();
            }
        } else if (viewMode === 'firstPerson' && fp) {
            const persp = perspRef.current;
            if (prevViewMode.current === 'perspective' && persp) {
                // Fly from the current orbit view to the saved first-person pose; the player takes
                // over the camera once the flight has landed.
                orbitTransition.current = null;
                const toRotation: [number, number, number] = [fpState.rotation[0], fpState.rotation[1], fpState.rotation[2]];
                fpTransition.current = {
                    fromPos: persp.position.clone(),
                    fromQuat: persp.quaternion.clone(),
                    fromFov: persp.fov,
                    toPos: new THREE.Vector3(...fpState.position),
                    toQuat: new THREE.Quaternion().setFromEuler(new THREE.Euler(...toRotation)),
                    toRotation,
                    start: performance.now(),
                };
                fp.position.copy(persp.position);
                fp.quaternion.copy(persp.quaternion);
                fp.fov = persp.fov;
                fp.updateProjectionMatrix();
                firstPersonTransition.active = true;
            } else {
                fp.position.fromArray(fpState.position);
                fp.rotation.fromArray(fpState.rotation as any);
            }
        }
        prevViewMode.current = viewMode;
        // IMPORTANT: We only want to run this when toggling viewModes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode]);

    // 2D wall editor: fly to the wall face (perspective), then hand over to WallEditorCamera;
    // on close, fly back from the 2D view to the orbit pose the editor was opened from.
    useEffect(() => {
        const persp = perspRef.current;
        const controls = orbitControlsRef.current;
        const view = useWallEditorView.getState();
        const previous = openWall.current;

        if (wallEditor) {
            const wall = useEditorStore.getState().localWalls.find(w => w.id === wallEditor.wallId);
            if (!wall) return;
            const sameFace = previous && previous.wallId === wallEditor.wallId && previous.side === wallEditor.side;
            if (sameFace) return;
            openWall.current = wallEditor;
            if (!previous || previous.wallId !== wallEditor.wallId) view.resetForWall();

            const container = gl.domElement.parentElement ?? gl.domElement;
            view.fitRect(
                { x: 0, y: Math.min(0, wall.position_y - wall.height / 2), w: wall.width, h: wall.height },
                measureViewportInsets(container),
                { w: container.clientWidth, h: container.clientHeight },
            );

            // Switching the face (or the wall) inside the 2D editor: no flight, the orthographic
            // camera follows the new view directly.
            if (previous && view.phase === 'active') return;
            if (!persp || !controls) {
                view.setPhase('active');
                return;
            }
            if (!orbitPoseBeforeWall.current) {
                // Re-opened while still flying back: return to where that flight was heading.
                const flyingBack = view.phase === 'leaving' ? orbitTransition.current : null;
                orbitPoseBeforeWall.current = flyingBack
                    ? { position: flyingBack.toPos.clone(), target: flyingBack.toTarget.clone() }
                    : { position: persp.position.clone(), target: controls.target.clone() };
            }
            const pose = wallViewPose(wall, wallEditor, ORBIT_FOV);
            controls.enabled = false;
            orbitTransition.current = {
                fromPos: persp.position.clone(),
                fromTarget: controls.target.clone(),
                toPos: pose.position,
                toTarget: pose.target,
                fromFov: persp.fov,
                toFov: ORBIT_FOV,
                duration: WALL_TRANSITION_MS,
                start: performance.now(),
                onDone: () => {
                    if (useEditorStore.getState().wallEditor) useWallEditorView.getState().setPhase('active');
                },
            };
            view.setPhase('entering');
            invalidate();
            return;
        }

        if (!previous) return;
        openWall.current = null;
        const saved = orbitPoseBeforeWall.current;
        orbitPoseBeforeWall.current = null;
        if (!persp || !controls) {
            view.setPhase('idle');
            return;
        }
        // Start where the 2D view was (it may have been panned/zoomed) …
        const wall = useEditorStore.getState().localWalls.find(w => w.id === previous.wallId);
        if (wall && view.phase === 'active') {
            const pose = wallViewPose(wall, previous, ORBIT_FOV);
            persp.position.copy(pose.position);
            persp.fov = ORBIT_FOV;
            persp.updateProjectionMatrix();
            controls.target.copy(pose.target);
            controls.update();
        }
        // … and fly back to the orbit view the editor was opened from.
        const state = useEditorStore.getState().orbitCameraState;
        controls.enabled = false;
        orbitTransition.current = {
            fromPos: persp.position.clone(),
            fromTarget: controls.target.clone(),
            toPos: saved?.position ?? new THREE.Vector3(...state.position),
            toTarget: saved?.target ?? new THREE.Vector3(...state.target),
            fromFov: persp.fov,
            toFov: ORBIT_FOV,
            duration: WALL_TRANSITION_MS,
            start: performance.now(),
            onDone: () => {
                if (!useEditorStore.getState().wallEditor) useWallEditorView.getState().setPhase('idle');
            },
        };
        view.setPhase('leaving');
        invalidate();
    }, [wallEditor, gl, invalidate]);

    // First person is a walk-through preview: no selecting objects by clicking.
    useEffect(() => {
        setEvents({ enabled: viewMode !== 'firstPerson' });
    }, [viewMode, setEvents]);

    // Browsers consume the Esc that releases pointer lock (no keydown reaches the page), so a
    // released pointer lock is the Esc in first person: return to the orbit view right away.
    const handlePointerUnlock = useCallback(() => {
        const state = useEditorStore.getState();
        if (state.plannerViewMode === 'firstPerson' && !state.isDialogOpen) {
            setPlannerViewMode('perspective');
        }
    }, [setPlannerViewMode]);

    // Save FP and Perspective state on mode change (exit)
    useEffect(() => {
        const currentFpRef = fpRef.current;
        const currentPersp = perspRef.current;
        const targetToSave = lastOrbitTarget.current;
        
        return () => {
             // Mid-flight the camera isn't at a meaningful pose yet — keep the flight's target.
             const entering = fpTransition.current;
             const leaving = orbitTransition.current;
             if (viewMode === 'firstPerson' && currentFpRef) {
                 updateFPState(entering
                     ? { position: entering.toPos.toArray(), rotation: entering.toRotation }
                     : {
                         position: currentFpRef.position.toArray(),
                         rotation: [currentFpRef.rotation.x, currentFpRef.rotation.y, currentFpRef.rotation.z]
                     });
             } else if (viewMode === 'perspective' && currentPersp) {
                 updateOrbitState(leaving
                     ? { position: leaving.toPos.toArray(), target: leaving.toTarget.toArray() }
                     : {
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
                if (useEditorStore.getState().wallEditor) return; // H = hand tool in the 2D wall editor
                setFocusTarget({ target: [0, 0, 0], isHoming: true });
                // RND-02: the store change alone doesn't touch any r3f-managed prop, so under
                // frameloop="demand" nothing would kick off the homing animation below.
                invalidate();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setFocusTarget, invalidate]);

    // Continuous State Update & Animation
    useFrame((_, delta) => {
        const entering = fpTransition.current;
        if (entering && viewMode === 'firstPerson' && fpRef.current) {
            const t = Math.min(1, (performance.now() - entering.start) / CAMERA_TRANSITION_MS);
            const eased = easeInOutCubic(t);
            const camera = fpRef.current;
            camera.position.lerpVectors(entering.fromPos, entering.toPos, eased);
            camera.quaternion.slerpQuaternions(entering.fromQuat, entering.toQuat, eased);
            camera.fov = entering.fromFov + (FP_FOV - entering.fromFov) * eased;
            camera.updateProjectionMatrix();
            if (t >= 1) {
                camera.position.copy(entering.toPos);
                camera.rotation.set(entering.toRotation[0], entering.toRotation[1], entering.toRotation[2]);
                fpTransition.current = null;
                firstPersonTransition.active = false;
            }
            return;
        }

        const transition = orbitTransition.current;
        if (transition && viewMode === 'perspective' && orbitControlsRef.current && perspRef.current) {
            const t = Math.min(1, (performance.now() - transition.start) / (transition.duration ?? CAMERA_TRANSITION_MS));
            const eased = easeInOutCubic(t);
            const fromFov = transition.fromFov ?? FP_FOV;
            const toFov = transition.toFov ?? ORBIT_FOV;
            perspRef.current.position.lerpVectors(transition.fromPos, transition.toPos, eased);
            orbitControlsRef.current.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
            perspRef.current.fov = fromFov + (toFov - fromFov) * eased;
            perspRef.current.updateProjectionMatrix();
            orbitControlsRef.current.update();
            lastOrbitTarget.current.copy(orbitControlsRef.current.target);
            if (t >= 1) {
                orbitTransition.current = null;
                orbitControlsRef.current.enabled = !isTransforming && !useEditorStore.getState().wallEditor;
                transition.onDone?.();
            }
            // frameloop="demand": keep frames coming until the flight ends.
            invalidate();
            return;
        }

        if (viewMode === 'perspective' && orbitControlsRef.current && perspRef.current && wallPhase === 'idle') {
            
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

                // RND-02: keep requesting frames for the duration of the homing/focus lerp
                // under frameloop="demand" (OrbitControls.update() also invalidates when it
                // detects a real change, but this guarantees the animation completes).
                invalidate();
            }
        }
    });

    return (
        <>
            <PerspectiveCamera
                ref={attachPerspCamera}
                makeDefault={viewMode === 'perspective' && wallPhase !== 'active'}
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
                    camera={perspCamera ?? undefined}
                    makeDefault
                    enableDamping
                    dampingFactor={0.05}
                    minDistance={CAMERA_LIMITS.PERSPECTIVE.minDistance}
                    maxDistance={CAMERA_LIMITS.PERSPECTIVE.maxDistance}
                    enableRotate={true}
                    enabled={!isTransforming && wallPhase === 'idle'}
                    mouseButtons={{
                        LEFT: THREE.MOUSE.ROTATE,
                        MIDDLE: THREE.MOUSE.ROTATE,
                        RIGHT: THREE.MOUSE.PAN
                    }}
                />
            )}

            {/* 2D wall editor (orthographic, default camera while the editor is open) */}
            {viewMode === 'perspective' && <WallEditorCamera />}

            {/* Player body + keyboard movement: physics/PhysicsWorld.tsx, mounted by EditorPage (RND-08) */}
            {viewMode === 'firstPerson' && <PointerLockControls selector="#root" onUnlock={handlePointerUnlock} />}
        </>
    );
};
