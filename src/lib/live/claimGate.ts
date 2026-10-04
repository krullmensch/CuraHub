import type { ClaimHolder } from './protocol';

/**
 * What editorStore asks before it selects something: is that object held by another tab?
 * liveConnection keeps the map current; editorStore only reads it, so the store needs no
 * import of the live channel (and works unchanged without one — nothing is held then).
 */

let held = new Map<string, ClaimHolder>();
let notify: (holders: ClaimHolder[]) => void = () => {};

export function setHeldClaims(next: Map<string, ClaimHolder>): void {
  held = next;
}

export function setClaimNotifier(fn: (holders: ClaimHolder[]) => void): void {
  notify = fn;
}

export const heldBy = (key: string): ClaimHolder | undefined => held.get(key);

/** Tells the user why something was not selected (after the store update, never inside it). */
export function reportHeld(holders: ClaimHolder[]): void {
  if (holders.length === 0) return;
  queueMicrotask(() => notify(holders));
}
