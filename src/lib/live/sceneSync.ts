import type * as THREE from 'three';
import { currentCameraPose, poseMoved, type CameraPose } from './cameraPose';
import type { ClientMessage, LiveTransform } from './protocol';

/**
 * Sends what others should see of this tab's scene: the camera (avatar) and objects it holds
 * while they move. The drag sender compares each held object's actual Three.js pose with what
 * it sent last — so gizmo, group transform, wall editor and modal moves all show up without
 * knowing about each other. The first look at an object only records it.
 */

export const DRAG_INTERVAL_MS = 66;
export const POSE_INTERVAL_MS = 100;
export const POSE_HEARTBEAT_MS = 5000;

const round = (v: number) => Math.round(v * 1e4) / 1e4;

export function transformOf(key: string, object: THREE.Object3D): LiveTransform {
  const { position: p, quaternion: q, scale: s } = object;
  return {
    k: key,
    p: [round(p.x), round(p.y), round(p.z)],
    q: [round(q.x), round(q.y), round(q.z), round(q.w)],
    s: [round(s.x), round(s.y), round(s.z)],
  };
}

const sameTransform = (a: LiveTransform, b: LiveTransform) =>
  a.p.every((v, i) => v === b.p[i]) && a.q.every((v, i) => v === b.q[i]) && a.s.every((v, i) => v === b.s[i]);

/** Drag sender state: what was sent per key. Returns the transforms to send now (maybe none). */
export class DragTracker {
  private readonly sent = new Map<string, LiveTransform>();

  tick(keys: string[], lookup: (key: string) => THREE.Object3D | undefined): LiveTransform[] {
    const changed: LiveTransform[] = [];
    const held = new Set(keys);
    for (const key of [...this.sent.keys()]) if (!held.has(key)) this.sent.delete(key);
    for (const key of keys) {
      const object = lookup(key);
      if (!object) continue;
      const now = transformOf(key, object);
      const last = this.sent.get(key);
      this.sent.set(key, now);
      if (last && !sameTransform(last, now)) changed.push(now);
    }
    return changed;
  }
}

export interface SceneSyncDeps {
  send(msg: Extract<ClientMessage, { t: 'pose' } | { t: 'drag' }>): void;
  /** Claim keys this tab holds right now. */
  ownKeys(): string[];
  lookup(key: string): THREE.Object3D | undefined;
  now?: () => number;
}

export function startSceneSync(deps: SceneSyncDeps): () => void {
  const tracker = new DragTracker();
  const dragTimer = setInterval(() => {
    const transforms = tracker.tick(deps.ownKeys(), deps.lookup);
    if (transforms.length > 0) deps.send({ t: 'drag', transforms });
  }, DRAG_INTERVAL_MS);

  let lastPose: CameraPose | null = null;
  let lastPoseAt = 0;
  const poseTimer = setInterval(() => {
    const pose = currentCameraPose();
    if (!pose) return;
    const now = (deps.now ?? Date.now)();
    if (!poseMoved(lastPose, pose) && now - lastPoseAt < POSE_HEARTBEAT_MS) return;
    lastPose = pose;
    lastPoseAt = now;
    deps.send({ t: 'pose', p: pose.p, yaw: pose.yaw, pitch: pose.pitch });
  }, POSE_INTERVAL_MS);

  return () => {
    clearInterval(dragTimer);
    clearInterval(poseTimer);
  };
}
