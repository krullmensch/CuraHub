import { createContext } from 'react';
import * as THREE from 'three';
import { composePartMatrix, getFramePartTransforms } from './modularFrameParts';

export interface FrameSlot {
    /** Empty group at the frame's position inside the artwork hierarchy. */
    anchor: THREE.Object3D;
    /** 4 corner + 4 edge matrices relative to the anchor. */
    locals: THREE.Matrix4[];
    lastWorld: THREE.Matrix4;
    dirty: boolean;
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
            if (rebuild || slot.dirty || !world.equals(slot.lastWorld)) {
                slot.lastWorld.copy(world);
                slot.dirty = false;
                for (let k = 0; k < 4; k++) {
                    corners.setMatrixAt(index * 4 + k, scratch.multiplyMatrices(world, slot.locals[k]));
                    edges.setMatrixAt(index * 4 + k, scratch.multiplyMatrices(world, slot.locals[4 + k]));
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
