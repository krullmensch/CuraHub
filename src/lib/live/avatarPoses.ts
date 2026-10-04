import type { Vec3 } from './protocol';

/**
 * Other tabs' camera poses (`pose` messages). Kept outside React: avatars read them every frame.
 * `onSessionsChanged` fires only when a session appears or goes, so the avatar list re-renders
 * rarely.
 */

export interface AvatarPose { p: Vec3; yaw: number; pitch: number }

const poses = new Map<string, AvatarPose>();
const listeners = new Set<() => void>();
const poseListeners = new Set<() => void>();
let sessions: string[] = [];

function changed() {
  sessions = [...poses.keys()].sort();
  for (const l of listeners) l();
}

export function setAvatarPose(session: string, pose: AvatarPose): void {
  const known = poses.has(session);
  poses.set(session, pose);
  if (!known) changed();
  for (const l of poseListeners) l();
}

/** Every new pose (the editor renders on demand: avatars need a frame to move). */
export function onAvatarPose(listener: () => void): () => void {
  poseListeners.add(listener);
  return () => { poseListeners.delete(listener); };
}

/** Drops poses of tabs that are no longer here. */
export function keepAvatarSessions(present: (session: string) => boolean): void {
  let removed = false;
  for (const session of [...poses.keys()]) {
    if (!present(session)) {
      poses.delete(session);
      removed = true;
    }
  }
  if (removed) changed();
}

export function clearAvatarPoses(): void {
  if (poses.size === 0) return;
  poses.clear();
  changed();
}

export const avatarPose = (session: string): AvatarPose | undefined => poses.get(session);
export const avatarSessions = (): string[] => sessions;

export function onAvatarSessionsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
