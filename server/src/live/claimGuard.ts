import type { Request, Response } from 'express';
import { getLiveHub } from './registry';
import type { ClaimKind } from './protocol';

/**
 * REST side of the claims: a PATCH/DELETE on an object another tab holds answers 423. The tab
 * that sends a change names itself in `X-Live-Session`; requests without it (old tabs, scripts)
 * may only touch unclaimed objects.
 */

export const LIVE_SESSION_HEADER = 'x-live-session';

/**
 * Sends 423 and returns false when `kind:id` is held by a tab other than the requester's.
 * Call it after the access check, so nobody learns about objects they cannot see.
 */
export function ensureNotClaimed(req: Request, res: Response, kind: ClaimKind, id: number): boolean {
    const holder = getLiveHub()?.holderOf(`${kind}:${id}`);
    if (!holder) return true;
    const session = liveSessionOf(req);
    if (session && session === holder.session) return true;
    res.status(423).json({
        error: `Wird gerade von ${holder.name} bearbeitet`,
        code: 'claimed',
        holder: { name: holder.name, color: holder.color },
    });
    return false;
}

/** The tab a REST request comes from, if it said so. */
export function liveSessionOf(req: Request): string | null {
    return req.get(LIVE_SESSION_HEADER) || null;
}
