/** Lets code outside the Canvas (F key, panels) read the orbit camera's fov and aspect. */
export interface CameraInfo {
  fov: number;
  aspect: number;
}

export const cameraInfoBridge: { get: (() => CameraInfo | null) | null } = { get: null };
