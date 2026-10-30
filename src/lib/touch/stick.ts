/** Joystick maths of the touch viewer (pure). */

/** Fraction of the stick radius that gives no input, so a resting thumb doesn't drift. */
export const STICK_DEAD_ZONE = 0.12;
/** Look speed in degrees per second at full deflection of the right stick. */
export const LOOK_RATE = 140;
/** Up/down look limit in degrees. */
export const PITCH_LIMIT_DEG = 80;
/** A tap moves at most this far … */
export const TAP_MAX_MOVE_PX = 10;
/** … and lifts within this time. */
export const TAP_MAX_MS = 300;

export interface StickValue {
  x: number;
  y: number;
}

/**
 * Finger offset from the stick centre (screen px, y down) → stick value in the unit circle, y up
 * (= forward / look up). The dead zone is cut out and the rest rescaled, so the value starts at 0
 * just outside it and reaches 1 at the rim.
 */
export function stickVector(dx: number, dy: number, radius: number): StickValue {
  const length = Math.hypot(dx, dy) / radius;
  if (length <= STICK_DEAD_ZONE) return { x: 0, y: 0 };
  const scaled = Math.min(1, (length - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE));
  const factor = scaled / (length * radius);
  return { x: dx * factor, y: -dy * factor };
}

const DEG = Math.PI / 180;

/** Turns the view by the right stick: x turns right (yaw decreases), y looks up; pitch is clamped. */
export function applyLook(yaw: number, pitch: number, look: StickValue, dt: number): { yaw: number; pitch: number } {
  if (look.x === 0 && look.y === 0) return { yaw, pitch };
  const step = LOOK_RATE * DEG * dt;
  const limit = PITCH_LIMIT_DEG * DEG;
  return {
    yaw: yaw - look.x * step,
    pitch: Math.max(-limit, Math.min(limit, pitch + look.y * step)),
  };
}

export interface PointerSample {
  x: number;
  y: number;
  t: number;
}

export function isTap(start: PointerSample, end: PointerSample): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) <= TAP_MAX_MOVE_PX && end.t - start.t <= TAP_MAX_MS;
}
