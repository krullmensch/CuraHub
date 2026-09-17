import { createContext } from 'react';
import * as THREE from 'three';
import { composePartMatrix, getFramePartTransforms } from './modularFrameParts';

export interface FrameSlot {
    /** Empty group at the frame's position inside the artwork hierarchy. */
    anchor: THREE.Object3D;
    /** 4 corner + 4 edge matrices relative to the anchor. */
    locals: THREE.Matrix4[];
    lastWorld: THREE.Matrix4;
    /** Whether the anchor and all its ancestors were visible when the matrices were last written. */
    lastVisible: boolean;
    dirty: boolean;
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Instances ignore `visible` on the artwork's groups — check the anchor's ancestor chain instead. */
function isShown(object: THREE.Object3D): boolean {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
        if (!o.visible) return false;
    }
    return true;
}

/** RND-01: collects every placed picture frame so FrameInstancer can draw them instanced. */
export class FrameInstancerRegistry {
    readonly slots = new Set<FrameSlot>();
    /** Slot order changed — instance indices shift, so every matrix must be rewritten. */
    structureChanged = true;
    private listeners = new Set<() => void>();

    add(anchor: THREE.Object3D, width: number, height: number): FrameSlot {
        const slot: FrameSlot = {
            anchor,
            locals: Array.from({ length: 8 }, () => new THREE.Matrix4()),
            lastWorld: new THREE.Matrix4(),
            lastVisible: true,
            dirty: true,
        };
        this.writeLocals(slot, width, height);
        this.slots.add(slot);
        this.structureChanged = true;
        this.emit();
        return slot;
    }

    remove(slot: FrameSlot): void {
        if (!this.slots.delete(slot)) return;
        this.structureChanged = true;
        this.emit();
    }

    setSize(slot: FrameSlot, width: number, height: number): void {
        this.writeLocals(slot, width, height);
        slot.dirty = true;
        this.emit();
    }

    /**
     * Writes every frame's part matrices into the two instanced meshes (once per rendered
     * frame). Only uploads the instance buffers when something moved, resized or re-indexed.
     */
    writeInstances(corners: THREE.InstancedMesh, edges: THREE.InstancedMesh, scratch: THREE.Matrix4, meshesReplaced: boolean): void {
        const rebuild = this.structureChanged || meshesReplaced;
        this.structureChanged = false;

        const maxFrames = Math.floor(corners.instanceMatrix.count / 4);
        let index = 0;
        let changed = rebuild;
        for (const slot of this.slots) {
            if (index >= maxFrames) break;
            slot.anchor.updateWorldMatrix(true, false);
            const world = slot.anchor.matrixWorld;
            const visible = isShown(slot.anchor);
            if (rebuild || slot.dirty || visible !== slot.lastVisible || (visible && !world.equals(slot.lastWorld))) {
                slot.lastWorld.copy(world);
                slot.lastVisible = visible;
                slot.dirty = false;
                for (let k = 0; k < 4; k++) {
                    // Hidden frames (e.g. other walls in the 2D wall editor) collapse to a point.
                    corners.setMatrixAt(index * 4 + k, visible ? scratch.multiplyMatrices(world, slot.locals[k]) : HIDDEN);
                    edges.setMatrixAt(index * 4 + k, visible ? scratch.multiplyMatrices(world, slot.locals[4 + k]) : HIDDEN);
                }
                changed = true;
            }
            index++;
        }

        corners.count = index * 4;
        edges.count = index * 4;
        if (changed) {
            corners.instanceMatrix.needsUpdate = true;
            edges.instanceMatrix.needsUpdate = true;
        }
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private writeLocals(slot: FrameSlot, width: number, height: number): void {
        const { corners, edges } = getFramePartTransforms(width, height);
        [...corners, ...edges].forEach((part, i) => composePartMatrix(part, slot.locals[i]));
    }

    private emit(): void {
        for (const listener of this.listeners) listener();
    }
}

export const FrameInstancerContext = createContext<FrameInstancerRegistry | null>(null);
