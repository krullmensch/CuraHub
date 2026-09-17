import type { Object3D, Vector3 } from 'three';

/**
 * Lets the DOM overlay of the 2D wall editor request frames from the R3F canvas
 * (frameloop="demand") after moving Three.js objects directly during a drag.
 */
export interface CanvasPick {
    object: Object3D;
    point: Vector3;
    /** World-space normal of the hit face. */
    normal: Vector3 | null;
}

export const wallEditorBridge: {
    invalidate: () => void;
    /** World position of the camera currently rendering the editor (null outside the canvas). */
    getCameraPosition: () => { x: number; y: number; z: number } | null;
    /** First visible object under a screen point of the editor canvas. */
    pick: (clientX: number, clientY: number) => CanvasPick | null;
} = {
    invalidate: () => {},
    getCameraPosition: () => null,
    pick: () => null,
};

/** Distance of the orthographic wall camera in front of the wall face (metres). */
export const WALL_CAMERA_DISTANCE = 20;
