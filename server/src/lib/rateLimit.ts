import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * In-memory fixed-window rate limits (single process, like lib/idempotency.ts).
 * With several server instances this needs a shared store (Redis/DB).
 */
export interface RateRule {
    windowMs: number;
    max: number;
    /** Returns null when the rule does not apply (e.g. no username in the body). */
    key: (ip: string, username: string) => string | null;
}

export interface RateLimiter {
    middleware: RequestHandler;
    clear(key: string): void;
}

interface Bucket {
    count: number;
    resetAt: number;
}

const allBuckets = new Set<Map<string, Bucket>>();

const pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const buckets of allBuckets) {
        for (const [key, bucket] of buckets) {
            if (bucket.resetAt <= now) buckets.delete(key);
        }
    }
}, 60_000);
pruneTimer.unref();

/**
 * Client address for rate limits. `trust proxy` (index.ts) makes req.ip the address Apache or
 * cloudflared forwarded. cf-connecting-ip is only honoured when the instance really sits behind
 * Cloudflare — otherwise any client could send the header and pick its own bucket.
 */
export function clientIp(req: Request, env: Record<string, string | undefined> = process.env): string {
    if (env.BEHIND_CLOUDFLARE === 'true') {
        const cfIp = req.headers['cf-connecting-ip'];
        if (typeof cfIp === 'string' && cfIp.length > 0) return cfIp;
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function normalizedUsername(req: Request): string {
    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null) return '';
    const username = (body as Record<string, unknown>).username;
    return typeof username === 'string' ? username.trim().toLowerCase().slice(0, 100) : '';
}

export function createRateLimit(rules: RateRule[], message: string): RateLimiter {
    const buckets = new Map<string, Bucket>();
    allBuckets.add(buckets);

    const middleware = (req: Request, res: Response, next: NextFunction) => {
        const now = Date.now();
        const ip = clientIp(req);
        const username = normalizedUsername(req);

        const matched: Bucket[] = [];
        for (const rule of rules) {
            const key = rule.key(ip, username);
            if (!key) continue;
            let bucket = buckets.get(key);
            if (!bucket || bucket.resetAt <= now) {
                bucket = { count: 0, resetAt: now + rule.windowMs };
                buckets.set(key, bucket);
            }
            if (bucket.count >= rule.max) {
                res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
                res.status(429).json({ error: message });
                return;
            }
            matched.push(bucket);
        }

        for (const bucket of matched) bucket.count++;
        next();
    };

    return { middleware, clear: (key) => { buckets.delete(key); } };
}
