// Home pose of the orbit camera: where the editor starts, where a freshly opened project lands and
// where H flies to. One source, so the three never drift apart.
//
// Satellit's windows (Fenster.001 in the room model, and the street in lib/windowViewConfig) sit in
// the wall at z = -3.65 and look towards -Z. The camera therefore stands on the -Z side, above the
// room, and looks at its centre: the window wall is the near wall and the windows are visible.

export type Vec3 = [number, number, number];

/** Orbit target of the home view: the centre of the room. */
export const CAMERA_HOME_TARGET: Vec3 = [0, 0, 0];
/** Distance between camera and target (H has always framed the room from 15 m). */
export const CAMERA_HOME_DISTANCE = 15;
/** Camera height above the floor (H never went below 10 m). */
export const CAMERA_HOME_HEIGHT = 10;

export interface CameraHomePose {
  position: Vec3;
  target: Vec3;
}

/** Fresh copy of the home pose: straight in front of the window wall (-Z), `CAMERA_HOME_DISTANCE` from the target. */
export function cameraHomePose(): CameraHomePose {
  const target: Vec3 = [...CAMERA_HOME_TARGET];
  const horizontal = Math.sqrt(CAMERA_HOME_DISTANCE ** 2 - CAMERA_HOME_HEIGHT ** 2);
  return {
    position: [target[0], target[1] + CAMERA_HOME_HEIGHT, target[2] - horizontal],
    target,
  };
}
