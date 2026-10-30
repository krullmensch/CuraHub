import crypto from 'crypto';

/**
 * One-job tokens for the headless AR export page. The export job signs one per run and hands it
 * to the page (URL fragment, sent as a Bearer header). Signed with an in-memory secret, never
 * with JWT_SECRET, so a token can't pass `authenticate`, and it dies with the process.
 */
export const AR_TOKEN_TTL_MS = 10 * 60 * 1000;

const secret = crypto.randomBytes(32);

const hmac = (body: string): Buffer => crypto.createHmac('sha256', secret).update(body).digest();

export function signArJobToken(versionId: number, jobId: string, now: number = Date.now()): string {
    const body = Buffer.from(JSON.stringify({ v: versionId, j: jobId, exp: now + AR_TOKEN_TTL_MS })).toString('base64url');
    return `${body}.${hmac(body).toString('base64url')}`;
}

export function verifyArJobToken(
    token: string,
    versionId: number,
    now: number = Date.now(),
): { jobId: string } | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;

    const expected = hmac(body);
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

    let payload: unknown;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (typeof payload !== 'object' || payload === null) return null;
    const { v, j, exp } = payload as { v?: unknown; j?: unknown; exp?: unknown };
    if (v !== versionId || typeof j !== 'string' || typeof exp !== 'number') return null;
    if (now > exp) return null;
    return { jobId: j };
}
