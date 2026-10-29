// Home pose of the orbit camera: where the editor starts, where a freshly opened project lands and
// where H flies to. One source, so the three never drift apart.
//
// Satellit's windows (Fenster.001 in the room model, and the street in lib/windowViewConfig) sit in
// the long wall at z = -3.65 and look towards -Z. The camera stands diagonally above the corner of
// that wall and the +X side wall (with its door) and looks at the room's centre: the window wall is
// the near wall on the right, the side wall the near wall on the left.

export type Vec3 = [number, number, number];

/** Orbit target of the home view: the centre of the room. */
export const CAMERA_HOME_TARGET: Vec3 = [0, 0, 0];
/** Distance between camera and target (H has always framed the room from 15 m). */
export const CAMERA_HOME_DISTANCE = 15;
/** Camera height above the floor (H never went below 10 m). */
export const CAMERA_HOME_HEIGHT = 10;
/** Horizontal direction from the target to the camera: halfway between +X and -Z (the window side). */
const HOME_AZIMUTH: [number, number] = [Math.SQRT1_2, -Math.SQRT1_2];

export interface CameraHomePose {
  position: Vec3;
  target: Vec3;
}

/** Fresh copy of the home pose: diagonally in front of the window wall, `CAMERA_HOME_DISTANCE` from the target. */
export function cameraHomePose(): CameraHomePose {
  const target: Vec3 = [...CAMERA_HOME_TARGET];
  const horizontal = Math.sqrt(CAMERA_HOME_DISTANCE ** 2 - CAMERA_HOME_HEIGHT ** 2);
  return {
    position: [
      target[0] + HOME_AZIMUTH[0] * horizontal,
      target[1] + CAMERA_HOME_HEIGHT,
      target[2] + HOME_AZIMUTH[1] * horizontal,
    ],
    target,
  };
}
