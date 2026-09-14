import type { Request, Response, NextFunction } from 'express';

/**
 * SEC-06: in-memory rate limit for POST /auth/login, which forwards credentials to the HSBI
 * SSO. Without a limit CuraHub could be used as a brute-force proxy against HSBI accounts.
 *
 * Single-process only (like lib/idempotency.ts). With several server instances this needs a
 * shared store (Redis/DB).
 */

interface Rule {
    windowMs: number;
    max: number;
    /** Returns null when the rule does not apply (e.g. no username in the body). */
    key: (ip: string, username: string) => string | null;
}

const RULES: Rule[] = [
    // Typos are fine, scripted guessing is not.
    { windowMs: 60_000, max: 5, key: (ip, username) => (username ? `ip-user:${ip}:${username}` : null) },
    // Caps guessing on one account from rotating IPs.
    { windowMs: 15 * 60_000, max: 20, key: (_ip, username) => (username ? `user:${username}` : null) },
    // Caps one IP spraying many accounts (a whole lecture hall behind one NAT stays well below).
    { windowMs: 15 * 60_000, max: 100, key: (ip) => `ip:${ip}` },
];

interface Bucket {
    count: number;
    resetAt: number;
}

const buckets = new Map<string, Bucket>();

const pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }
}, 60_000);
pruneTimer.unref();

/** Behind Cloudflare the socket address is the tunnel; CF sets the real client address. */
function clientIp(req: Request): string {
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.length > 0) return cfIp;
    return req.ip || req.socket.remoteAddress || 'unknown';
}

function normalizedUsername(req: Request): string {
    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null) return '';
    const username = (body as Record<string, unknown>).username;
    return typeof username === 'string' ? username.trim().toLowerCase().slice(0, 100) : '';
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    const ip = clientIp(req);
    const username = normalizedUsername(req);

    const matched: Bucket[] = [];
    for (const rule of RULES) {
        const key = rule.key(ip, username);
        if (!key) continue;
        let bucket = buckets.get(key);
        if (!bucket || bucket.resetAt <= now) {
            bucket = { count: 0, resetAt: now + rule.windowMs };
            buckets.set(key, bucket);
        }
        if (bucket.count >= rule.max) {
            res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
            return res.status(429).json({ error: 'Zu viele Anmeldeversuche. Bitte in einigen Minuten erneut versuchen.' });
        }
        matched.push(bucket);
    }

    for (const bucket of matched) bucket.count++;
    next();
}

/** A successful login clears the short per-IP/user window so a few typos don't linger. */
export function resetLoginAttempts(req: Request): void {
    const username = normalizedUsername(req);
    if (username) buckets.delete(`ip-user:${clientIp(req)}:${username}`);
}
