import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { instanceRefMap, useEditorStore } from '../store/editorStore';
import { instanceWorldBounds } from '../lib/instanceBounds';
import { rectsOverlap, screenRectOfBox } from '../lib/marquee';
import { selectionBridge } from '../lib/selectionBridge';

/** A hit this much closer than the artwork's centre still counts as the artwork (its frame). */
const OCCLUSION_TOLERANCE_M = 0.05;

const isShown = (object: THREE.Object3D) => {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
        if (!o.visible || o.name === '__ghost__') return false;
    }
    return true;
};

/** The transform gizmo is in the scene too — it must not hide artworks from the marquee. */
const isGizmo = (object: THREE.Object3D) => {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
        const flags = o as THREE.Object3D & { isTransformControlsGizmo?: boolean; isTransformControlsPlane?: boolean };
        if (flags.isTransformControlsGizmo || flags.isTransformControlsPlane) return true;
    }
    return false;
};

const belongsTo = (object: THREE.Object3D, id: number) => {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
        if (o.userData.instanceId === id) return true;
    }
    return false;
};

/**
 * Registers the marquee hit test with `selectionBridge`: artworks whose projected bounds overlap
 * the rectangle and that are not hidden behind a wall (a ray from the camera to their centre
 * reaches them first).
 */
export const SelectionBridge = () => {
    const get = useThree((state) => state.get);

    useEffect(() => {
        const raycaster = new THREE.Raycaster();
        const box = new THREE.Box3();
        const center = new THREE.Vector3();
        const direction = new THREE.Vector3();

        selectionBridge.marqueeHits = (rect) => {
            const { camera, scene, gl } = get();
            const canvas = gl.domElement.getBoundingClientRect();
            const marquee = { x: rect.left - canvas.left, y: rect.top - canvas.top, w: rect.right - rect.left, h: rect.bottom - rect.top };
            const viewport = { width: canvas.width, height: canvas.height };
            camera.updateMatrixWorld();
            raycaster.camera = camera;

            const hits: number[] = [];
            for (const inst of useEditorStore.getState().localInstances) {
                const group = instanceRefMap.get(inst.id);
                if (!group || !isShown(group)) continue;
                instanceWorldBounds(inst, box);
                const onScreen = screenRectOfBox(box, camera, viewport);
                if (!onScreen || !rectsOverlap(onScreen, marquee)) continue;

                box.getCenter(center);
                direction.subVectors(center, camera.position);
                const distance = direction.length();
                raycaster.set(camera.position, direction.normalize());
                raycaster.far = distance + OCCLUSION_TOLERANCE_M;
                const blocker = raycaster.intersectObjects(scene.children, true)
                    .find((hit) => isShown(hit.object) && !isGizmo(hit.object));
                const visible = !blocker
                    || belongsTo(blocker.object, inst.id)
                    || blocker.distance >= distance - OCCLUSION_TOLERANCE_M;
                if (visible) hits.push(inst.id);
            }
            return hits;
        };
        return () => {
            selectionBridge.marqueeHits = () => [];
        };
    }, [get]);

    return null;
};
