import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import { getWallFrame, wallToWorld } from '@/lib/wallEditor/geometry';
import { WALL_CAMERA_DISTANCE, wallEditorBridge } from '@/lib/wallEditor/bridge';

/**
 * Orthographic camera of the 2D wall editor. It looks straight at the open wall face and follows
 * the pan/zoom state of useWallEditorView, so one metre on the wall is exactly `pxPerM` CSS pixels —
 * the DOM overlay (WallEditorOverlay) uses the same mapping and lines up pixel-perfectly.
 * It becomes the default camera once the fly-in (PlannerCameraSystem) has landed.
 */
export const WallEditorCamera = () => {
    const phase = useWallEditorView((s) => s.phase);
    const wallEditor = useEditorStore((s) => s.wallEditor);
    const wall = useEditorStore((s) => (s.wallEditor ? s.localWalls.find((w) => w.id === s.wallEditor!.wallId) : undefined));
    const invalidate = useThree((s) => s.invalidate);
    const get = useThree((s) => s.get);
    const cameraRef = useRef<THREE.OrthographicCamera>(null);

    useEffect(() => {
        wallEditorBridge.invalidate = invalidate;
        wallEditorBridge.getCameraPosition = () => get().camera.position;
        return () => {
            wallEditorBridge.invalidate = () => {};
            wallEditorBridge.getCameraPosition = () => null;
        };
    }, [invalidate, get]);

    useEffect(() => {
        if (!wall || !wallEditor) return;
        const frame = getWallFrame(wall, wallEditor.side);
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
    }, [wall, wallEditor, invalidate]);

    return (
        <OrthographicCamera
            ref={cameraRef}
            makeDefault={phase === 'active'}
            near={0.05}
            far={WALL_CAMERA_DISTANCE + 60}
        />
    );
};
