import { useRef, useCallback } from 'react';
import { TransformControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, artworkMinY, resolveInstanceId } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { finalizeGroupMember, finalizeInstanceTransform, movesInWallPlane } from '../lib/instanceTransform';
import { useSelectionPivot } from './SelectionPivot';
import { suppressNextClick } from '../lib/selectionBridge';

// RND-07: the PropertiesPanel readout re-renders on every liveTransform update — 10 Hz is
// plenty for numbers, the 3D object itself still moves every frame.
const LIVE_TRANSFORM_INTERVAL_MS = 100;

const readTransform = (group: THREE.Object3D) => ({
    position: { x: group.position.x, y: group.position.y, z: group.position.z },
    rotation: { x: group.rotation.x, y: group.rotation.y, z: group.rotation.z },
    scale: { x: group.scale.x, y: group.scale.y, z: group.scale.z },
});

interface InstanceTransformControlsProps {
    /** Map of instance ID -> group ref */
    instanceRefs: React.MutableRefObject<Map<number, THREE.Group>>;
}

export const InstanceTransformControls = ({ instanceRefs }: InstanceTransformControlsProps) => {
    const selectedId = useEditorStore((state) => state.selectedInstanceId);
    // More than one artwork: the gizmo drives the selection pivot and the group follows it.
    const isGroup = useEditorStore((state) => state.selectedInstanceIds.length > 1);
    const monitorInSelection = useEditorStore((state) =>
        state.localInstances.some(i => i.medium === 'monitor' && state.selectedInstanceIds.includes(i.id)));
    const transformMode = useEditorStore((state) => state.transformMode);
    const transformAxisLock = useEditorStore((state) => state.transformAxisLock);
    // A single wall-hung artwork moves along its wall only: local axes, no handle along the normal.
    const inWallPlane = useEditorStore((state) => {
        if (state.selectedInstanceIds.length !== 1) return false;
        const inst = state.localInstances.find(i => i.id === state.selectedInstanceId);
        return !!inst && movesInWallPlane(inst);
    });
    const setIsTransforming = useEditorStore((state) => state.setIsTransforming);
    const invalidate = useThree((state) => state.invalidate);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controlsRef = useRef<any>(null);
    const lastLiveUpdate = useRef(-Infinity);
    const selectionPivot = useSelectionPivot();
    // A monitor keeps the size of its model — a group containing one cannot be scaled.
    const groupMode = isGroup && monitorInSelection && transformMode === 'scale' ? 'translate' : transformMode;

    const selectedGroup = selectedId ? instanceRefs.current.get(selectedId) ?? null : null;

    // Poll live transform every frame during drag
    useFrame(() => {
        const store = useEditorStore.getState();
        if (!store.isTransforming) return;

        if (store.selectedInstanceIds.length > 1) {
            selectionPivot.apply(groupMode);
            invalidate();
            return;
        }

        const id = store.selectedInstanceId;
        if (!id) return;
        const group = instanceRefs.current.get(id);
        if (!group) return;

        // Clamp Y live during translate so the artwork never visually passes through the floor
        if (store.transformMode === 'translate') {
            const inst = store.localInstances.find(i => i.id === id);
            if (inst) {
                group.position.y = Math.max(artworkMinY(inst, group.scale.y), group.position.y);
            }
        }

        const now = performance.now();
        if (now - lastLiveUpdate.current >= LIVE_TRANSFORM_INTERVAL_MS) {
            lastLiveUpdate.current = now;
            store.setLiveTransform(readTransform(group));
        }

        // RND-02: the Y-clamp above mutates the object directly (bypassing JSX props), and
        // the PropertiesPanel's live readout depends on setLiveTransform — keep requesting
        // frames under frameloop="demand" for the duration of the drag.
        invalidate();
    });

    // Persist transform to backend on mouse up
    const handleMouseUp = useCallback(async () => {
        setIsTransforming(false);
        const store = useEditorStore.getState();
        const currentToken = useAuthStore.getState().token;

        if (store.selectedInstanceIds.length > 1) {
            // The pointer-up usually ends on an artwork of the group, which moved along — its
            // click must not shrink the selection to that one artwork.
            suppressNextClick();
            selectionPivot.apply(groupMode);
            const groups = new Map([...selectionPivot.members()].map(([id, group]) => [resolveInstanceId(id), group]));
            if (!currentToken || groups.size === 0) return;
            // One commit for the whole group → one undo step.
            store.commitLocalChange(store.localInstances.map(inst => {
                const group = groups.get(inst.id);
                return group ? finalizeGroupMember(inst, group, store.localWalls, groupMode) : inst;
            }));
            return;
        }

        const currentSelectedId = store.selectedInstanceId;
        const group = currentSelectedId ? instanceRefs.current.get(currentSelectedId) : undefined;
        // The throttled live value can lag up to LIVE_TRANSFORM_INTERVAL_MS behind the object.
        // PropertiesPanel keeps the last live value when it is cleared, so publish the exact
        // final transform first and clear it in a separate render.
        if (group) store.setLiveTransform(readTransform(group));
        setTimeout(() => useEditorStore.getState().setLiveTransform(null), 0);

        if (!currentSelectedId || !currentToken || !group) return;

        const currentMode = store.transformMode;
        store.commitLocalChange(store.localInstances.map(inst =>
            inst.id === currentSelectedId ? finalizeInstanceTransform(inst, group, currentMode, store.localWalls) : inst
        ));
    }, [setIsTransforming, instanceRefs, selectionPivot, groupMode]);

    const handleMouseDown = useCallback(() => {
        if (useEditorStore.getState().selectedInstanceIds.length > 1) selectionPivot.begin();
        setIsTransforming(true);
    }, [setIsTransforming, selectionPivot]);

    // Attach event listeners to the TransformControls gizmo via props

    const target = isGroup ? selectionPivot.pivot : selectedGroup;
    const wallPlaneMove = !isGroup && inWallPlane && transformMode === 'translate';

    return (
        <>
            <primitive object={selectionPivot.pivot} />
            {target && (
                <TransformControls
                    ref={controlsRef}
                    object={target}
                    mode={isGroup ? groupMode : transformMode}
                    size={0.75}
                    space={wallPlaneMove ? 'local' : 'world'}
                    showX={transformAxisLock === 'none' || transformAxisLock === 'x'}
                    showY={transformAxisLock === 'none' || transformAxisLock === 'y'}
                    showZ={!wallPlaneMove && (transformAxisLock === 'none' || transformAxisLock === 'z')}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                />
            )}
        </>
    );
};
