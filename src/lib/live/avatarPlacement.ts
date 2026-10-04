import { SCALE_FIGURE_HEIGHT } from '../scaleFigure';
import type { AvatarPose } from './avatarPoses';
import type { Vec3 } from './protocol';

/**
 * Where another tab's avatar goes. In first person the pose is the eye: the scale figure stands
 * on the floor below it and only turns (yaw). In the orbit view the pose is the camera itself:
 * a small marker there, turned and tilted like the camera.
 */
export function avatarPlacement(pose: AvatarPose, firstPerson: boolean): { position: Vec3; yaw: number; pitch: number } {
  if (firstPerson) return { position: [pose.p[0], 0, pose.p[2]], yaw: pose.yaw, pitch: 0 };
  return { position: pose.p, yaw: pose.yaw, pitch: pose.pitch };
}

/** Name label height above the avatar's origin: over the figure's head, or just above the marker. */
export const avatarLabelHeight = (firstPerson: boolean): number => (firstPerson ? SCALE_FIGURE_HEIGHT + 0.2 : 0.22);
