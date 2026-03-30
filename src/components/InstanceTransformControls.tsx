import { useRef, useCallback } from 'react';
import { TransformControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';

interface InstanceTransformControlsProps {
    /** Map of instance ID -> group ref */
    instanceRefs: React.MutableRefObject<Map<number, THREE.Group>>;
}

export const InstanceTransformControls = ({ instanceRefs }: InstanceTransformControlsProps) => {
    const selectedId = useEditorStore((state) => state.selectedInstanceId);
    const transformMode = useEditorStore((state) => state.transformMode);
    const transformAxisLock = useEditorStore((state) => state.transformAxisLock);
    const snapEnabled = useEditorStore((state) => state.snapEnabled);
    const setIsTransforming = useEditorStore((state) => state.setIsTransforming);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controlsRef = useRef<any>(null);

    const selectedGroup = selectedId ? instanceRefs.current.get(selectedId) ?? null : null;

    // Poll live transform every frame during drag
    useFrame(() => {
        if (!useEditorStore.getState().isTransforming) return;
        const id = useEditorStore.getState().selectedInstanceId;
        if (!id) return;
        const group = instanceRefs.current.get(id);
        if (!group) return;
        useEditorStore.getState().setLiveTransform({
            position: { x: group.position.x, y: group.position.y, z: group.position.z },
            rotation: { x: group.rotation.x, y: group.rotation.y, z: group.rotation.z },
            scale: { x: group.scale.x, y: group.scale.y, z: group.scale.z },
        });
    });

    // Persist transform to backend on mouse up
    const handleMouseUp = useCallback(async () => {
        setIsTransforming(false);
        useEditorStore.getState().setLiveTransform(null);

        const currentSelectedId = useEditorStore.getState().selectedInstanceId;
        const currentToken = useAuthStore.getState().token;
        if (!currentSelectedId || !currentToken) return;

        const group = instanceRefs.current.get(currentSelectedId);
        if (!group) return;

        const store = useEditorStore.getState();
        const currentMode = store.transformMode;
        const updatedInstances = store.localInstances.map(inst => {
            if (inst.id !== currentSelectedId) return inst;

            const updated = {
                ...inst,
                position_x: currentMode === 'translate' ? group.position.x : inst.position_x,
                position_y: currentMode === 'translate' ? group.position.y : inst.position_y,
                position_z: currentMode === 'translate' ? group.position.z : inst.position_z,
                rotation_x: currentMode === 'rotate' ? group.rotation.x : inst.rotation_x,
                rotation_y: currentMode === 'rotate' ? group.rotation.y : inst.rotation_y,
                rotation_z: currentMode === 'rotate' ? group.rotation.z : inst.rotation_z,
                scale_x: currentMode === 'scale' ? group.scale.x : inst.scale_x,
                scale_y: currentMode === 'scale' ? group.scale.y : inst.scale_y,
                scale_z: currentMode === 'scale' ? group.scale.z : inst.scale_z,
            };

            // Detach from wall if moved away from its surface
            if (updated.wallId && currentMode === 'translate') {
                const wall = store.localWalls.find(w => w.id === updated.wallId);
                if (wall) {
                    // Check distance from artwork to wall center plane (in wall-local space)
                    const dx = updated.position_x - wall.position_x;
                    const dz = updated.position_z - wall.position_z;
                    const cos = Math.cos(-wall.rotation_y);
                    const sin = Math.sin(-wall.rotation_y);
                    const localX = dx * cos - dz * sin;
                    const localZ = dx * sin + dz * cos;
                    const tolerance = wall.thickness / 2 + 0.15;
                    const halfW = wall.width / 2 + 0.15;
                    // If artwork is beyond the wall's thickness or width, detach
                    if (Math.abs(localZ) > tolerance || Math.abs(localX) > halfW) {
                        updated.wallId = null;
                    }
                }
            }

            return updated;
        });

        store.commitLocalChange(updatedInstances);
    }, [setIsTransforming, instanceRefs]);

    const handleMouseDown = useCallback(() => {
        setIsTransforming(true);
    }, [setIsTransforming]);

    // Attach event listeners to the TransformControls gizmo via props

    if (!selectedGroup) return null;

    return (
        <TransformControls
            ref={controlsRef}
            object={selectedGroup}
            mode={transformMode}
            size={0.75}
            showX={transformAxisLock === 'none' || transformAxisLock === 'x'}
            showY={transformAxisLock === 'none' || transformAxisLock === 'y'}
            showZ={transformAxisLock === 'none' || transformAxisLock === 'z'}
            translationSnap={snapEnabled ? 0.25 : undefined}
            rotationSnap={snapEnabled ? Math.PI / 12 : undefined}
            scaleSnap={snapEnabled ? 0.1 : undefined}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
        />
    );
};
