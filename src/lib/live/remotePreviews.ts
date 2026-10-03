import * as THREE from 'three';
import type { LiveTransform } from './protocol';

/**
 * Other tabs' objects while they move them (`drag` messages, not saved yet). The object's own
 * pose is kept as `rest` before the first preview and put back when the preview ends:
 * - the saved change arrives (`changed`): released right before the store update, so React's
 *   new props land on the restored pose;
 * - the holder lets go of the object (claims) without a change: released after a grace period
 *   (the change may still be on its way);
 * - the holder leaves.
 * Previews are eased towards their target every frame (RemotePreviewApplier).
 */

interface Pose { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }

interface Preview {
  session: string;
  object: THREE.Object3D | null;
  target: Pose;
  rest: Pose | null;
  releaseAt: number | null;
}

export const RELEASE_GRACE_MS = 1500;
/** Approach rate of the easing (per second); ~95 % of the way in 0.2 s. */
const EASE_RATE = 15;

const previews = new Map<string, Preview>();
let invalidate: () => void = () => {};

export function setPreviewInvalidator(fn: (() => void) | null): void {
  invalidate = fn ?? (() => {});
}

const poseOf = (o: THREE.Object3D): Pose => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });

function restore(preview: Preview) {
  const { object, rest } = preview;
  if (!object || !rest) return;
  object.position.copy(rest.p);
  object.quaternion.copy(rest.q);
  object.scale.copy(rest.s);
}

export function receiveDrag(session: string, transforms: LiveTransform[]): void {
  for (const t of transforms) {
    const target: Pose = {
      p: new THREE.Vector3(...t.p),
      q: new THREE.Quaternion(...t.q).normalize(),
      s: new THREE.Vector3(...t.s),
    };
    const known = previews.get(t.k);
    if (known && known.session === session) {
      known.target = target;
      known.releaseAt = null;
    } else {
      if (known) release(t.k);
      previews.set(t.k, { session, object: null, target, rest: null, releaseAt: null });
    }
  }
  if (transforms.length > 0) invalidate();
}

/** The preview of `key` ends now (its saved state follows through the store). */
export function release(key: string): void {
  const preview = previews.get(key);
  if (!preview) return;
  restore(preview);
  previews.delete(key);
  invalidate();
}

/** Ends previews whose holder no longer holds the object (after RELEASE_GRACE_MS). */
export function syncWithClaims(holderOf: (key: string) => string | undefined, now = Date.now()): void {
  for (const [key, preview] of previews) {
    if (holderOf(key) === preview.session) preview.releaseAt = null;
    else if (preview.releaseAt === null) preview.releaseAt = now + RELEASE_GRACE_MS;
  }
}

/** Ends every preview of tabs that left. */
export function releaseSessions(present: (session: string) => boolean): void {
  for (const [key, preview] of previews) {
    if (!present(preview.session)) release(key);
  }
}

export function releaseAll(): void {
  for (const key of [...previews.keys()]) release(key);
}

/**
 * One frame: finds objects, remembers their rest pose, eases them towards the target and ends
 * expired previews. Returns true while something still moves (keep rendering).
 */
export function stepPreviews(
  dt: number,
  lookup: (key: string) => THREE.Object3D | undefined,
  now = Date.now(),
): boolean {
  let moving = false;
  const k = 1 - Math.exp(-EASE_RATE * Math.max(dt, 0));
  for (const [key, preview] of previews) {
    if (preview.releaseAt !== null && now >= preview.releaseAt) {
      release(key);
      continue;
    }
    const object = lookup(key);
    if (!object) continue;
    if (preview.object !== object) {
      // First frame (or the object was remounted): its current pose is the saved one.
      preview.object = object;
      preview.rest = poseOf(object);
    }
    const { p, q, s } = preview.target;
    object.position.lerp(p, k);
    object.quaternion.slerp(q, k);
    object.scale.lerp(s, k);
    if (object.position.distanceToSquared(p) > 1e-8 || object.quaternion.angleTo(q) > 1e-4 || object.scale.distanceToSquared(s) > 1e-8) {
      moving = true;
    }
  }
  return moving || [...previews.values()].some((pv) => pv.releaseAt !== null);
}

/** For tests. */
export const previewCount = (): number => previews.size;
