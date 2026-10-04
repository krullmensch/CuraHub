import type { IncomingHttpHeaders } from 'http';

/**
 * Origin check for the live channel's upgrade. Auth travels in the first message (not in a
 * cookie), so a foreign page gains nothing from opening a socket — this is defence in depth:
 * same host (Apache keeps Host with ProxyPreserveHost), an allowed CORS origin, or a
 * non-production server (Vite's dev proxy rewrites Host but not Origin).
 */
export function liveOriginAllowed(
    headers: IncomingHttpHeaders,
    allowed: string[],
    production: boolean,
): boolean {
    const origin = headers.origin;
    if (!origin) return true; // not a browser
    if (!production) return true;
    if (allowed.includes(origin)) return true;
    let originHost: string;
    try {
        originHost = new URL(origin).host;
    } catch {
        return false;
    }
    const forwarded = headers['x-forwarded-host'];
    const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || headers.host;
    return originHost === host;
}

/** `/api/live` in production, `/live` behind Vite's dev proxy (which strips `/api`). */
export function isLivePath(url: string | undefined): boolean {
    if (!url) return false;
    const path = url.split('?')[0];
    return path === '/live' || path === '/api/live';
}
