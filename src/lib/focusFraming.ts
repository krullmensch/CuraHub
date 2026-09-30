/** Pure framing maths for the editor's "focus selection" (F key / Focus button). */

type Vec3 = [number, number, number];

/**
 * Distance from the target at which a sphere of `radius` fits the smaller of the vertical and
 * horizontal field of view, times `margin`, but never closer than `min`.
 */
export function focusDistance(radius: number, fovDeg: number, aspect: number, margin = 1.25, min = 1.2): number {
  if (!(radius > 0) || !(fovDeg > 0) || !(aspect > 0)) return min;
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const half = Math.min(vHalf, hHalf);
  return Math.max(min, (radius / Math.sin(half)) * margin);
}

/** Centre and bounding-sphere radius (half the diagonal) of a box; an empty box gives origin/0. */
export function boundsFocus(box: { min: Vec3; max: Vec3 }): { center: Vec3; radius: number } {
  const { min, max } = box;
  if (min.some((v, i) => !Number.isFinite(v) || !Number.isFinite(max[i]) || v > max[i])) {
    return { center: [0, 0, 0], radius: 0 };
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  return { center, radius };
}
