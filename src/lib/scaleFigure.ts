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
/** Distance kept from a wall the view ray hits (figure half-span 0.34 m plus a margin). */
const WALL_CLEARANCE = 0.45;

/** Server limits (server/src/routes/scaleFigures.ts): figures per version, |x|, |z| in metres. */
export const MAX_SCALE_FIGURES_PER_VERSION = 50;
const MAX_FIGURE_COORDINATE = 500;

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

/**
 * Where a new figure goes when the view ray hits the scene at `point` (world normal `normal`,
 * facing the camera): on a floor right there, in front of a wall a figure's half-width plus a
 * margin away from it. Null for anything else (ceiling, tops of walls), so the caller keeps
 * looking further along the ray.
 */
export function spawnPoseFromHit(cameraPosition: Vec3, point: Vec3, normal: Vec3): FigurePose | null {
    let x: number;
    let z: number;
    if (normal.y > 0.85 && point.y < 0.1) {
        x = point.x;
        z = point.z;
    } else if (Math.abs(normal.y) < 0.3 && point.y < 2) {
        const length = Math.hypot(normal.x, normal.z) || 1;
        x = point.x + (normal.x / length) * WALL_CLEARANCE;
        z = point.z + (normal.z / length) * WALL_CLEARANCE;
    } else {
        return null;
    }
    return { position_x: x, position_z: z, rotation_y: Math.atan2(cameraPosition.x - x, cameraPosition.z - z) };
}

/**
 * Keeps a figure's values inside what the server accepts (server/src/routes/scaleFigures.ts):
 * |x|, |z| clamped to 500 m, yaw wrapped to (−π, π]. Returns only the given values that are
 * finite — a non-finite one is dropped, so it can't turn into a JSON null the server rejects.
 */
export function sanitiseFigurePose(pose: Partial<FigurePose>): Partial<FigurePose> {
    const out: Partial<FigurePose> = {};
    const clamp = (v: number) => Math.min(MAX_FIGURE_COORDINATE, Math.max(-MAX_FIGURE_COORDINATE, v));
    if (pose.position_x !== undefined && Number.isFinite(pose.position_x)) out.position_x = clamp(pose.position_x);
    if (pose.position_z !== undefined && Number.isFinite(pose.position_z)) out.position_z = clamp(pose.position_z);
    if (pose.rotation_y !== undefined && Number.isFinite(pose.rotation_y)) {
        out.rotation_y = Math.atan2(Math.sin(pose.rotation_y), Math.cos(pose.rotation_y));
    }
    return out;
}

/** Lets the editor toolbar (outside the canvas) ask the canvas where a new figure goes. */
export const scaleFigureBridge: { spawnPose: () => FigurePose | null } = {
    spawnPose: () => null,
};
