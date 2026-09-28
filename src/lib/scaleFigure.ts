import { PLAYER_STATURE } from './playerDimensions';

/** The scale figure is as tall as the first-person player. */
export const SCALE_FIGURE_HEIGHT = PLAYER_STATURE;
export const SCALE_FIGURE_URL = '/models/scale-figure.glb';
/** Name of the mesh node in scale-figure.glb. */
export const SCALE_FIGURE_MESH = 'ScaleFigure';

/** Farthest floor point a new figure is put on (metres from the camera). */
const MAX_SPAWN_DISTANCE = 100;
/** Distance in front of the camera when the view doesn't reach the floor. */
const FALLBACK_SPAWN_DISTANCE = 3;

export interface FigurePose {
    position_x: number;
    position_z: number;
    rotation_y: number;
}

type Vec3 = { x: number; y: number; z: number };

/**
 * Where a new figure goes: where the view ray through the screen centre meets the floor
 * (y = 0), else a few metres in front of the camera. The model faces +Z; it is turned to
 * face the camera.
 */
export function spawnPoseFromCamera(position: Vec3, direction: Vec3): FigurePose {
    let x: number;
    let z: number;
    const t = direction.y < -1e-3 ? -position.y / direction.y : Infinity;
    if (t > 0 && t <= MAX_SPAWN_DISTANCE) {
        x = position.x + direction.x * t;
        z = position.z + direction.z * t;
    } else {
        const length = Math.hypot(direction.x, direction.z) || 1;
        x = position.x + (direction.x / length) * FALLBACK_SPAWN_DISTANCE;
        z = position.z + (direction.z / length) * FALLBACK_SPAWN_DISTANCE;
    }
    return { position_x: x, position_z: z, rotation_y: Math.atan2(position.x - x, position.z - z) };
}

/** Lets the editor toolbar (outside the canvas) ask the canvas where a new figure goes. */
export const scaleFigureBridge: { spawnPose: () => FigurePose | null } = {
    spawnPose: () => null,
};
