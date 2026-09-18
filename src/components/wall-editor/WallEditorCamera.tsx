import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import { wallToWorld } from '@/lib/wallEditor/geometry';
import { openFaceOf } from '@/lib/wallEditor/faces';
import { WALL_CAMERA_DISTANCE, wallEditorBridge } from '@/lib/wallEditor/bridge';

/**
 * Orthographic camera of the 2D wall editor. It looks straight at the open wall face and follows
 * the pan/zoom state of useWallEditorView, so one metre on the wall is exactly `pxPerM` CSS pixels —
 * the DOM overlay (WallEditorOverlay) uses the same mapping and lines up pixel-perfectly.
 * It becomes the default camera once the fly-in (PlannerCameraSystem) has landed.
 */
export const WallEditorCamera = () => {
    const phase = useWallEditorView((s) => s.phase);
    const face = useEditorStore(openFaceOf);
    const invalidate = useThree((s) => s.invalidate);
    const get = useThree((s) => s.get);
    const cameraRef = useRef<THREE.OrthographicCamera>(null);

    useEffect(() => {
        wallEditorBridge.invalidate = invalidate;
        wallEditorBridge.getCameraPosition = () => get().camera.position;
        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        wallEditorBridge.pick = (clientX, clientY) => {
            const { camera, scene, gl } = get();
            const rect = gl.domElement.getBoundingClientRect();
            ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
            raycaster.setFromCamera(ndc, camera);
            for (const hit of raycaster.intersectObjects(scene.children, true)) {
                let visible = true;
                for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
                    if (!o.visible || o.name === '__ghost__') { visible = false; break; }
                }
                if (!visible) continue;
                const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null;
                return { object: hit.object, point: hit.point, normal };
            }
            return null;
        };
        return () => {
            wallEditorBridge.invalidate = () => {};
            wallEditorBridge.getCameraPosition = () => null;
            wallEditorBridge.pick = () => null;
        };
    }, [invalidate, get]);

    useEffect(() => {
        if (!face) return;
        const { frame } = face;
        const lookAt = new THREE.Vector3();
        const apply = () => {
            const camera = cameraRef.current;
            if (!camera) return;
            const view = useWallEditorView.getState();
            wallToWorld(frame, view.centerU, view.centerV, WALL_CAMERA_DISTANCE, camera.position);
            wallToWorld(frame, view.centerU, view.centerV, 0, lookAt);
            camera.up.set(0, 1, 0);
            camera.lookAt(lookAt);
            camera.zoom = view.pxPerM;
            camera.updateProjectionMatrix();
            camera.updateMatrixWorld();
            invalidate();
        };
        apply();
        return useWallEditorView.subscribe((state, prev) => {
            if (state.centerU !== prev.centerU || state.centerV !== prev.centerV || state.pxPerM !== prev.pxPerM || state.phase !== prev.phase) {
                apply();
            }
        });
    }, [face, invalidate]);

    return (
        <OrthographicCamera
            ref={cameraRef}
            makeDefault={phase === 'active'}
            near={0.05}
            far={WALL_CAMERA_DISTANCE + 60}
        />
    );
};
