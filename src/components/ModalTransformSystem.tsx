import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, artworkMinY } from '../store/editorStore';

export const ModalTransformSystem = () => {
    const activeObjectRef = useEditorStore(state => state.activeObjectRef);
    const modalTransformActive = useEditorStore(state => state.modalTransformActive);
    const setModalTransformActive = useEditorStore(state => state.setModalTransformActive);
    const transformMode = useEditorStore(state => state.transformMode);
    const transformAxisLock = useEditorStore(state => state.transformAxisLock);
    const commitActiveObjectTransform = useEditorStore(state => state.commitActiveObjectTransform);
    const { camera } = useThree();

    // Store initial transform when modal starts
    const initialTransform = useRef<{ position: THREE.Vector3, quaternion: THREE.Quaternion, scale: THREE.Vector3 } | null>(null);

    // Save initial state when entering modal transform
    useEffect(() => {
        if (modalTransformActive && activeObjectRef) {
            initialTransform.current = {
                position: activeObjectRef.position.clone(),
                quaternion: activeObjectRef.quaternion.clone(),
                scale: activeObjectRef.scale.clone(),
            };
        } else {
            initialTransform.current = null;
        }
    }, [modalTransformActive, activeObjectRef]);

    // Handle mouse movement and clicks during modal transform (no pointer lock)
    useEffect(() => {
        if (!modalTransformActive || !activeObjectRef) return;

        const onMouseMove = (e: MouseEvent) => {
            const deltaX = e.movementX;
            const deltaY = e.movementY;
            const translateFactor = 0.01;
            const scaleFactor = 0.01;
            const rotateFactor = 0.01;

            if (transformMode === 'translate') {
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
                const movement = right.multiplyScalar(deltaX * translateFactor).add(up.multiplyScalar(-deltaY * translateFactor));

                if (transformAxisLock === 'x') { movement.y = 0; movement.z = 0; }
                else if (transformAxisLock === 'y') { movement.x = 0; movement.z = 0; }
                else if (transformAxisLock === 'z') { movement.x = 0; movement.y = 0; }

                activeObjectRef.position.add(movement);

                // Clamp Y so the artwork bottom edge never dips below the floor
                const id = useEditorStore.getState().selectedInstanceId;
                const inst = id ? useEditorStore.getState().localInstances.find(i => i.id === id) : undefined;
                if (inst) {
                    activeObjectRef.position.y = Math.max(artworkMinY(inst, activeObjectRef.scale.y), activeObjectRef.position.y);
                }

            } else if (transformMode === 'scale') {
                const scaleDelta = (deltaX - deltaY) * scaleFactor;
                const change = new THREE.Vector3(scaleDelta, scaleDelta, scaleDelta);

                if (transformAxisLock === 'x') { change.y = 0; change.z = 0; }
                else if (transformAxisLock === 'y') { change.x = 0; change.z = 0; }
                else if (transformAxisLock === 'z') { change.x = 0; change.y = 0; }

                activeObjectRef.scale.add(change);

            } else if (transformMode === 'rotate') {
                const angle = deltaX * rotateFactor;

                let axis = new THREE.Vector3(0, 1, 0);
                if (transformAxisLock === 'x') axis = new THREE.Vector3(1, 0, 0);
                else if (transformAxisLock === 'z') axis = new THREE.Vector3(0, 0, 1);

                activeObjectRef.rotateOnWorldAxis(axis, angle);
            }
        };

        const onMouseDown = (e: MouseEvent) => {
             if (e.button === 0) { // Left click confirms
                 setModalTransformActive(false);
                 commitActiveObjectTransform();
             } else if (e.button === 2) { // Right click cancels
                 setModalTransformActive(false);
                 if (initialTransform.current) {
                     activeObjectRef.position.copy(initialTransform.current.position);
                     activeObjectRef.quaternion.copy(initialTransform.current.quaternion);
                     activeObjectRef.scale.copy(initialTransform.current.scale);
                 }
             }
        };

        // Prevent context menu during modal transform
        const onContextMenu = (e: Event) => e.preventDefault();

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('contextmenu', onContextMenu);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('contextmenu', onContextMenu);
        };
    }, [modalTransformActive, activeObjectRef, transformMode, transformAxisLock, camera, commitActiveObjectTransform, setModalTransformActive]);

    return null;
};
