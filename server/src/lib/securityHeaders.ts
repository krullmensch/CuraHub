import type { RequestHandler } from 'express';

/**
 * Security headers on every response (Art. 32 DSGVO: state-of-the-art protection of the data
 * curators upload). Set by the app itself, so a Docker install without the Apache snippet has
 * them too.
 *
 * Content-Security-Policy — everything CuraHub runs comes from its own origin:
 * - `'wasm-unsafe-eval'`: Rapier (physics), Spark and the Draco decoder compile WebAssembly.
 *   No `'unsafe-eval'`: nothing calls eval / new Function.
 * - `blob:` workers: Spark and three's DRACOLoader start workers from blob URLs.
 * - `blob:` / `data:` images, media and fetches: generated textures, splats, AR files.
 * - `style-src 'unsafe-inline'`: React `style` attributes and model-viewer's shadow DOM.
 * - `connect-src 'self'` covers the live channel (ws/wss on the same host).
 * - `frame-ancestors 'self'`: no foreign page can frame the editor (clickjacking).
 *
 * `CSP_MODE=report-only` sends the policy as Content-Security-Policy-Report-Only (the browser only
 * logs violations), `CSP_MODE=off` drops it — for operators who need to diagnose a blocked feature.
 */
export const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
].join('; ');

/** Browser features CuraHub never uses; WebXR (AR) and fullscreen stay allowed for our own origin. */
export const PERMISSIONS_POLICY = [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'browsing-topics=()',
].join(', ');

export type CspMode = 'enforce' | 'report-only' | 'off';

export function cspMode(value: string | undefined): CspMode {
    const v = value?.trim().toLowerCase();
    return v === 'report-only' || v === 'off' ? v : 'enforce';
}

export function securityHeaders(mode: CspMode = cspMode(process.env.CSP_MODE)): RequestHandler {
    return (_req, res, next) => {
        if (mode === 'enforce') res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
        else if (mode === 'report-only') res.setHeader('Content-Security-Policy-Report-Only', CONTENT_SECURITY_POLICY);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        // Exhibition and project addresses never leak to other sites through links.
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        next();
    };
}
