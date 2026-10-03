import type { LiveHub } from './hub';

/** The running hub, for REST routes (claims, change broadcasts). Set once at startup (index.ts). */
let hub: LiveHub | null = null;

export function setLiveHub(next: LiveHub | null): void {
    hub = next;
}

export function getLiveHub(): LiveHub | null {
    return hub;
}
