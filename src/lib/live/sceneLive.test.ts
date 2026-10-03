import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DragTracker, transformOf } from './sceneSync';
import { poseMoved } from './cameraPose';
import { avatarLabelHeight, avatarPlacement } from './avatarPlacement';
import { outlineGroups, pathBounds } from './remoteOutlines';
import {
  previewCount, receiveDrag, release, releaseAll, releaseSessions, RELEASE_GRACE_MS, stepPreviews, syncWithClaims,
} from './remotePreviews';
import { avatarSessions, clearAvatarPoses, keepAvatarSessions, onAvatarPose, onAvatarSessionsChanged, setAvatarPose } from './avatarPoses';

describe('drag sender', () => {
  it('records an object first, then sends only what moved', () => {
    const obj = new THREE.Group();
    const objects = new Map([['instance:1', obj]]);
    const tracker = new DragTracker();
    expect(tracker.tick(['instance:1'], (k) => objects.get(k))).toEqual([]);
    expect(tracker.tick(['instance:1'], (k) => objects.get(k))).toEqual([]);
    obj.position.set(1, 2, 3);
    const sent = tracker.tick(['instance:1'], (k) => objects.get(k));
    expect(sent).toEqual([{ k: 'instance:1', p: [1, 2, 3], q: [0, 0, 0, 1], s: [1, 1, 1] }]);
    expect(tracker.tick(['instance:1'], (k) => objects.get(k))).toEqual([]);
  });

  it('forgets objects it no longer holds, and ignores sub-millimetre noise', () => {
    const obj = new THREE.Group();
    const tracker = new DragTracker();
    tracker.tick(['wall:2'], () => obj);
    obj.position.x = 0.00001;
    expect(tracker.tick(['wall:2'], () => obj)).toEqual([]);
    tracker.tick([], () => obj);
    obj.position.x = 5;
    expect(tracker.tick(['wall:2'], () => obj)).toEqual([]); // seen anew: recorded only
    expect(transformOf('wall:2', obj).p[0]).toBe(5);
  });
});

describe('remote previews', () => {
  afterEach(() => releaseAll());
  const t = (k: string, x: number) => ({ k, p: [x, 0, 0] as [number, number, number], q: [0, 0, 0, 1] as [number, number, number, number], s: [1, 1, 1] as [number, number, number] });

  it('eases the object to the preview and puts it back on release', () => {
    const obj = new THREE.Group();
    obj.position.set(-1, 0, 0);
    receiveDrag('anna', [t('instance:1', 4)]);
    for (let i = 0; i < 60; i++) stepPreviews(1 / 30, () => obj);
    expect(obj.position.x).toBeCloseTo(4, 3);
    release('instance:1');
    expect(obj.position.x).toBe(-1);
    expect(previewCount()).toBe(0);
  });

  it('ends a preview a moment after its holder let go, and at once when the holder leaves', () => {
    const obj = new THREE.Group();
    receiveDrag('anna', [t('instance:1', 2)]);
    stepPreviews(1, () => obj, 0);
    syncWithClaims(() => undefined, 1000);
    expect(stepPreviews(0.01, () => obj, 1000 + RELEASE_GRACE_MS - 1)).toBe(true);
    stepPreviews(0.01, () => obj, 1000 + RELEASE_GRACE_MS);
    expect(previewCount()).toBe(0);
    expect(obj.position.x).toBe(0);

    receiveDrag('ben', [t('wall:3', 1)]);
    releaseSessions((s) => s !== 'ben');
    expect(previewCount()).toBe(0);
  });

  it('keeps a preview while the holder still holds it', () => {
    receiveDrag('anna', [t('figure:5', 1)]);
    syncWithClaims((k) => (k === 'figure:5' ? 'anna' : undefined), 0);
    stepPreviews(0.1, () => new THREE.Group(), 10_000);
    expect(previewCount()).toBe(1);
  });
});

describe('avatars', () => {
  afterEach(() => clearAvatarPoses());

  it('places the figure on the floor below the eye and the camera marker at the camera', () => {
    const pose = { p: [1, 1.62, -2] as [number, number, number], yaw: 0.4, pitch: -0.3 };
    expect(avatarPlacement(pose, true)).toEqual({ position: [1, 0, -2], yaw: 0.4, pitch: 0 });
    expect(avatarPlacement(pose, false)).toEqual({ position: [1, 1.62, -2], yaw: 0.4, pitch: -0.3 });
    expect(avatarLabelHeight(true)).toBeGreaterThan(1.73);
  });

  it('sends a pose only after a real move or turn', () => {
    const a = { p: [0, 1, 0] as [number, number, number], yaw: 0, pitch: 0 };
    expect(poseMoved(null, a)).toBe(true);
    expect(poseMoved(a, { ...a, p: [0.01, 1, 0] })).toBe(false);
    expect(poseMoved(a, { ...a, p: [0.05, 1, 0] })).toBe(true);
    expect(poseMoved(a, { ...a, yaw: 0.02 })).toBe(true);
  });

  it('tracks who has a pose and tells about new ones', () => {
    let listChanges = 0;
    let poses = 0;
    const off1 = onAvatarSessionsChanged(() => listChanges++);
    const off2 = onAvatarPose(() => poses++);
    setAvatarPose('b', { p: [0, 0, 0], yaw: 0, pitch: 0 });
    setAvatarPose('a', { p: [0, 0, 0], yaw: 0, pitch: 0 });
    setAvatarPose('a', { p: [1, 0, 0], yaw: 0, pitch: 0 });
    expect(avatarSessions()).toEqual(['a', 'b']);
    keepAvatarSessions((s) => s === 'a');
    expect(avatarSessions()).toEqual(['a']);
    expect([listChanges, poses]).toEqual([3, 3]);
    off1();
    off2();
  });
});

describe('remote outlines', () => {
  it('groups other tabs\' claims per tab', () => {
    const claims = [
      { key: 'instance:1', session: 's1', userId: 1, name: 'anna', color: '#f00' },
      { key: 'wall:2', session: 's1', userId: 1, name: 'anna', color: '#f00' },
      { key: 'instance:3', session: 'me', userId: 2, name: 'ben', color: '#0f0' },
    ];
    expect(outlineGroups(claims, 'me')).toEqual([{ session: 's1', name: 'anna', color: '#f00', keys: ['instance:1', 'wall:2'] }]);
  });

  it('finds the top-left of a path', () => {
    expect(pathBounds('M10.0 20.5L30.0 5.0M-4.0 8.0L1.0 2.0')).toEqual({ minX: -4, minY: 2 });
    expect(pathBounds('')).toBeNull();
  });
});
