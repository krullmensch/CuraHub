/** The desktop viewer's vertical field of view (degrees). */
export const DESKTOP_VFOV = 60;
/** On a phone the visitor should see at least this much sideways (degrees)… */
export const TOUCH_MIN_HFOV = 75;
/** …without the vertical view getting so wide that the room bends (degrees). */
export const TOUCH_MAX_VFOV = 100;

const DEG = Math.PI / 180;

/**
 * Vertical FOV for the touch viewer: 60° vertical leaves only ~30° sideways on a portrait phone, so
 * the vertical FOV grows until the horizontal one reaches TOUCH_MIN_HFOV, capped at TOUCH_MAX_VFOV.
 * Landscape screens are already wide enough and keep the desktop value.
 */
export function touchFov(aspect: number): number {
  const needed = (2 * Math.atan(Math.tan((TOUCH_MIN_HFOV * DEG) / 2) / aspect)) / DEG;
  return Math.min(TOUCH_MAX_VFOV, Math.max(DESKTOP_VFOV, needed));
}
