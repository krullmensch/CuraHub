import type { Request, Response } from 'express';
import type { LiveHub } from './hub';
import type { ClaimKind } from './protocol';

/**
 * REST side of the claims: a PATCH/DELETE on an object another tab holds answers 423. The tab
 * that sends a change names itself in `X-Live-Session`; requests without it (old tabs, scripts)
 * may only touch unclaimed objects.
 */

let hub: LiveHub | null = null;

/** Set once at startup (index.ts); without a hub nothing is claimed. */
export function setLiveHub(next: LiveHub | null): void {
    hub = next;
}

export const LIVE_SESSION_HEADER = 'x-live-session';

/**
 * Sends 423 and returns false when `kind:id` is held by a tab other than the requester's.
 * Call it after the access check, so nobody learns about objects they cannot see.
 */
export function ensureNotClaimed(req: Request, res: Response, kind: ClaimKind, id: number): boolean {
    const holder = hub?.holderOf(`${kind}:${id}`);
    if (!holder) return true;
    const session = req.get(LIVE_SESSION_HEADER);
    if (session && session === holder.session) return true;
    res.status(423).json({
        error: `Wird gerade von ${holder.name} bearbeitet`,
        code: 'claimed',
        holder: { name: holder.name, color: holder.color },
    });
    return false;
}
