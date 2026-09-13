import * as THREE from 'three';

/**
 * Companion map to `modelBBoxMap` (editorStore.ts) — that map only stores the
 * unscaled bounding-box *size* of each model instance. PhysicsLayer also needs
 * the bounding-box *center* (in the model's local space) to position the
 * CuboidCollider identically to how it used to be nested inside ModelInstance's
 * own <group>. editorStore.ts is read-only for this work package, so this is
 * kept as a small sibling map populated by ModelInstance.tsx.
 */
export const modelBBoxCenterMap = new Map<number, THREE.Vector3>();
