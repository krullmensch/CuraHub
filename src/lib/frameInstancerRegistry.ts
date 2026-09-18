import { createContext } from 'react';
import * as THREE from 'three';
import { composePartMatrix, getFramePartTransforms } from './modularFrameParts';
import type { FrameStyleId } from './frameStyles';

export interface FrameSlot {
    /** Empty group at the frame's position inside the artwork hierarchy. */
    anchor: THREE.Object3D;
    /** Which instanced mesh pair this frame is drawn by. */
    style: FrameStyleId;
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

/**
 * RND-01: collects every placed picture frame so FrameInstancer can draw them instanced.
 *
 * Frames are grouped by style, because each style needs its own material and therefore its own
 * pair of instanced meshes. A room using three frame styles costs six draw calls, not six per
 * artwork.
 */
export class FrameInstancerRegistry {
    private readonly byStyle = new Map<FrameStyleId, Set<FrameSlot>>();
    /** Styles whose slot order changed — instance indices shift, so every matrix is rewritten. */
    private readonly needsRebuild = new Set<FrameStyleId>();
    private listeners = new Set<() => void>();

    add(anchor: THREE.Object3D, style: FrameStyleId, width: number, height: number): FrameSlot {
        const slot: FrameSlot = {
            anchor,
            style,
            locals: Array.from({ length: 8 }, () => new THREE.Matrix4()),
            lastWorld: new THREE.Matrix4(),
            lastVisible: true,
            dirty: true,
        };
        this.writeLocals(slot, width, height);
        this.slotsOf(style).add(slot);
        this.needsRebuild.add(style);
        this.emit();
        return slot;
    }

    remove(slot: FrameSlot): void {
        const slots = this.byStyle.get(slot.style);
        if (!slots || !slots.delete(slot)) return;
        if (slots.size === 0) this.byStyle.delete(slot.style);
        this.needsRebuild.add(slot.style);
        this.emit();
    }

    setSize(slot: FrameSlot, width: number, height: number): void {
        this.writeLocals(slot, width, height);
        slot.dirty = true;
        this.emit();
    }

    /** Moves a frame to another style's instanced meshes (both sides re-index). */
    setStyle(slot: FrameSlot, style: FrameStyleId, width: number, height: number): void {
        if (slot.style === style) return;
        const previous = this.byStyle.get(slot.style);
        if (previous) {
            previous.delete(slot);
            if (previous.size === 0) this.byStyle.delete(slot.style);
        }
        this.needsRebuild.add(slot.style);
        slot.style = style;
        this.writeLocals(slot, width, height);
        slot.dirty = true;
        this.slotsOf(style).add(slot);
        this.needsRebuild.add(style);
        this.emit();
    }

    /** Styles with at least one frame, in a stable order so React keys don't churn. */
    activeStyles(): FrameStyleId[] {
        return [...this.byStyle.keys()].sort();
    }

    slotCount(style: FrameStyleId): number {
        return this.byStyle.get(style)?.size ?? 0;
    }

    /**
     * Writes one style's part matrices into its two instanced meshes (once per rendered frame).
     * Only uploads the instance buffers when something moved, resized or re-indexed.
     */
    writeInstances(
        style: FrameStyleId,
        corners: THREE.InstancedMesh,
        edges: THREE.InstancedMesh,
        scratch: THREE.Matrix4,
        meshesReplaced: boolean,
    ): void {
        const rebuild = this.needsRebuild.delete(style) || meshesReplaced;
        const slots = this.byStyle.get(style);

        const maxFrames = Math.floor(corners.instanceMatrix.count / 4);
        let index = 0;
        let changed = rebuild;
        if (slots) {
            for (const slot of slots) {
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

    private slotsOf(style: FrameStyleId): Set<FrameSlot> {
        let slots = this.byStyle.get(style);
        if (!slots) {
            slots = new Set<FrameSlot>();
            this.byStyle.set(style, slots);
        }
        return slots;
    }

    private writeLocals(slot: FrameSlot, width: number, height: number): void {
        const { corners, edges } = getFramePartTransforms(width, height, slot.style);
        [...corners, ...edges].forEach((part, i) => composePartMatrix(part, slot.locals[i]));
    }

    private emit(): void {
        for (const listener of this.listeners) listener();
    }
}

export const FrameInstancerContext = createContext<FrameInstancerRegistry | null>(null);
