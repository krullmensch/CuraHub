import { useSyncExternalStore } from 'react';

/**
 * „Is the visitor walking?" — pointer lock on desktop, the entered state in the touch viewer. Raycaster,
 * info overlay, entry overlay and book code ask this instead of `document.pointerLockElement`.
 */
let touchWalking = false;
const listeners = new Set<() => void>();
let lockListenerInstalled = false;

function notify(): void {
  for (const fn of listeners) fn();
}

function pointerLocked(): boolean {
  return typeof document !== 'undefined' && !!document.pointerLockElement;
}

export function isWalking(): boolean {
  return pointerLocked() || touchWalking;
}

export function isTouchWalking(): boolean {
  return touchWalking;
}

export function setTouchWalking(on: boolean): void {
  if (touchWalking === on) return;
  touchWalking = on;
  notify();
}

export function subscribeWalking(fn: () => void): () => void {
  if (!lockListenerInstalled && typeof document !== 'undefined') {
    document.addEventListener('pointerlockchange', notify);
    lockListenerInstalled = true;
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useWalking(): boolean {
  return useSyncExternalStore(subscribeWalking, isWalking, () => false);
}
