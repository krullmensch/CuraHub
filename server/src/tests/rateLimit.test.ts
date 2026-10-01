import type { Request, Response } from 'express';
import { clientIp, createRateLimit } from '../lib/rateLimit';

function fakeReq(ip: string, headers: Record<string, string> = {}, body: unknown = {}): Request {
    return { ip, headers, body, socket: {} } as unknown as Request;
}
function fakeRes() {
    const res = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string> };
    return Object.assign(res, {
        status(code: number) { res.statusCode = code; return this; },
        json(b: unknown) { res.body = b; return this; },
        setHeader(k: string, v: string) { res.headers[k] = v; },
    }) as unknown as Response & typeof res;
}

describe('clientIp', () => {
    it('ignores cf-connecting-ip unless BEHIND_CLOUDFLARE=true', () => {
        const req = fakeReq('10.0.0.1', { 'cf-connecting-ip': '1.2.3.4' });
        expect(clientIp(req, {})).toBe('10.0.0.1');
        expect(clientIp(req, { BEHIND_CLOUDFLARE: 'true' })).toBe('1.2.3.4');
    });
});

describe('createRateLimit', () => {
    it('answers 429 with Retry-After once the rule is exhausted', () => {
        const limiter = createRateLimit([{ windowMs: 60_000, max: 2, key: (ip) => `t:${ip}` }], 'Zu viele.');
        const next = jest.fn();
        for (let i = 0; i < 2; i++) limiter.middleware(fakeReq('9.9.9.9'), fakeRes(), next);
        const res = fakeRes();
        limiter.middleware(fakeReq('9.9.9.9'), res, next);
        expect(next).toHaveBeenCalledTimes(2);
        expect(res.statusCode).toBe(429);
        expect(res.body).toEqual({ error: 'Zu viele.' });
        expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
    });
    it('clear() resets one bucket', () => {
        const limiter = createRateLimit([{ windowMs: 60_000, max: 1, key: (ip) => `c:${ip}` }], 'x');
        const next = jest.fn();
        limiter.middleware(fakeReq('8.8.8.8'), fakeRes(), next);
        limiter.clear('c:8.8.8.8');
        limiter.middleware(fakeReq('8.8.8.8'), fakeRes(), next);
        expect(next).toHaveBeenCalledTimes(2);
    });
});
