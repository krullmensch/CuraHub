import type { Request } from 'express';
import { liveSessionOf } from './claimGuard';
import { getLiveHub } from './registry';
import type { LiveChange, VersionEvent } from './protocol';

/**
 * REST routes tell the live channel what they saved (step 3 of the live collaboration spec).
 * Without a hub (tests, scripts) every call is a no-op.
 */

/** True if any tab is in the version — skip building a payload (extra query) otherwise. */
export function hasLiveListeners(versionId: number): boolean {
    return getLiveHub()?.hasVersionListeners(versionId) ?? false;
}

export function publishChange(req: Request, versionId: number, change: LiveChange): void {
    getLiveHub()?.publishChange(versionId, liveSessionOf(req), change);
}

export function publishVersionEvent(
    req: Request,
    exhibitionId: number,
    event: VersionEvent,
    versionId: number,
    fallbackVersionId: number | null = null,
): void {
    getLiveHub()?.publishVersionEvent(exhibitionId, liveSessionOf(req), event, versionId, fallbackVersionId);
}
