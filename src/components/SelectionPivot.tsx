import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { artworkMinY, instanceRefMap, useEditorStore, type TransformMode } from '../store/editorStore';
import { instanceWorldBounds } from '../lib/instanceBounds';
import { applyGroupDelta, floorDeltaLimit } from '../lib/selectionTransform';

interface Member {
    /** Id at the start of the drag — resolve it with resolveInstanceId when committing. */
    id: number;
    group: THREE.Group;
    /** World matrix at the start of the drag. */
    start: THREE.Matrix4;
    /** Lowest centre height allowed (artworkMinY) and the height at the start of the drag. */
    minY: number;
    y0: number;
}

export interface SelectionPivot {
    /** Invisible object at the centre of the selection — the transform gizmo drives it. */
    pivot: THREE.Object3D;
    /** Remembers the start matrices of the pivot and every member. */
    begin: () => void;
    /** Carries all members along with the pivot; call every frame while dragging. */
    apply: (mode: TransformMode) => void;
    /**
     * The dragged artwork groups by their id at the start of the drag. Auto-sync may swap a
     * temporary id for the database id mid-drag (the slot then remounts with a new group) — resolve
     * the id with resolveInstanceId and take the transform from the group held here.
     */
    members: () => Map<number, THREE.Group>;
}

/** Keeps the pivot at or above a height (the lowest point the rigid group may reach). */
function keepAbove(pivot: THREE.Object3D, minY: number): void {
    pivot.position.y = Math.max(pivot.position.y, minY);
}

const _world = new THREE.Matrix4();
const _parentInverse = new THREE.Matrix4();
const _bounds = new THREE.Box3();
const _union = new THREE.Box3();

/**
 * Pivot for transforming a multi-selection as one rigid group: sits at the centre of the
 * selection's bounds while nothing is dragged, and moves the artworks' groups directly during a
 * drag (no store writes per frame — the caller commits once on mouse-up).
 */
export function useSelectionPivot(): SelectionPivot {
    const pivot = useMemo(() => {
        const object = new THREE.Object3D();
        object.name = 'selection-pivot';
        return object;
    }, []);
    const ids = useEditorStore(useShallow((state) => state.selectedInstanceIds));
    const localInstances = useEditorStore((state) => state.localInstances);
    const isTransforming = useEditorStore((state) => state.isTransforming);
    const invalidate = useThree((state) => state.invalidate);
    const drag = useRef<{ pivotStart: THREE.Matrix4; members: Member[] } | null>(null);

    // Re-centre on the selection whenever it (or an artwork in it) changes outside a drag.
    useEffect(() => {
        if (isTransforming) return;
        _union.makeEmpty();
        for (const inst of localInstances) {
            if (ids.includes(inst.id)) _union.union(instanceWorldBounds(inst, _bounds));
        }
        if (_union.isEmpty()) return;
        _union.getCenter(pivot.position);
        pivot.quaternion.identity();
        pivot.scale.set(1, 1, 1);
        pivot.updateMatrixWorld(true);
        invalidate();
    }, [ids, localInstances, isTransforming, pivot, invalidate]);

    const begin = useCallback(() => {
        const state = useEditorStore.getState();
        pivot.updateMatrixWorld(true);
        const members: Member[] = [];
        for (const id of state.selectedInstanceIds) {
            const group = instanceRefMap.get(id);
            const inst = state.localInstances.find((i) => i.id === id);
            if (!group || !inst) continue;
            group.updateWorldMatrix(true, false);
            members.push({
                id,
                group,
                start: group.matrixWorld.clone(),
                minY: artworkMinY(inst, group.scale.y),
                y0: group.position.y,
            });
        }
        drag.current = { pivotStart: pivot.matrixWorld.clone(), members };
    }, [pivot]);

    const apply = useCallback((mode: TransformMode) => {
        const current = drag.current;
        if (!current) return;
        if (mode === 'translate') {
            // The group stays rigid: stop it where its lowest member would go through the floor.
            const startY = new THREE.Vector3().setFromMatrixPosition(current.pivotStart).y;
            const limit = floorDeltaLimit(current.members.map((m) => m.minY), current.members.map((m) => m.y0));
            keepAbove(pivot, startY + limit);
        }
        pivot.updateMatrixWorld(true);
        for (const member of current.members) {
            applyGroupDelta(member.start, current.pivotStart, pivot.matrixWorld, mode, _world);
            const parent = member.group.parent;
            if (parent) {
                parent.updateWorldMatrix(true, false);
                _world.premultiply(_parentInverse.copy(parent.matrixWorld).invert());
            }
            _world.decompose(member.group.position, member.group.quaternion, member.group.scale);
        }
    }, [pivot]);

    const members = useCallback(() => new Map((drag.current?.members ?? []).map((m) => [m.id, m.group])), []);

    return { pivot, begin, apply, members };
}
