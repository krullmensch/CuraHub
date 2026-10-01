import type { Request } from 'express';
import { clientIp, createRateLimit, normalizedUsername } from './rateLimit';

/**
 * SEC-06: rate limit for POST /auth/login, which forwards credentials to the HSBI SSO.
 * Without a limit CuraHub could be used as a brute-force proxy against HSBI accounts.
 */
const loginLimiter = createRateLimit([
    // Typos are fine, scripted guessing is not.
    { windowMs: 60_000, max: 5, key: (ip, username) => (username ? `ip-user:${ip}:${username}` : null) },
    // Caps guessing on one account from rotating IPs.
    { windowMs: 15 * 60_000, max: 20, key: (_ip, username) => (username ? `user:${username}` : null) },
    // Caps one IP spraying many accounts (a whole lecture hall behind one NAT stays well below).
    { windowMs: 15 * 60_000, max: 100, key: (ip) => `ip:${ip}` },
], 'Zu viele Anmeldeversuche. Bitte in einigen Minuten erneut versuchen.');

export const loginRateLimit = loginLimiter.middleware;

/** A successful login clears the short per-IP/user window so a few typos don't linger. */
export function resetLoginAttempts(req: Request): void {
    const username = normalizedUsername(req);
    if (username) loginLimiter.clear(`ip-user:${clientIp(req)}:${username}`);
}
