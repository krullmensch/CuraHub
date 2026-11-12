import express from 'express';
import request from 'supertest';
import { CONTENT_SECURITY_POLICY, cspMode, securityHeaders, type CspMode } from '../lib/securityHeaders';

const appWith = (mode: CspMode) => {
    const app = express();
    app.use(securityHeaders(mode));
    app.get('/', (_req, res) => res.send('ok'));
    return app;
};

describe('securityHeaders', () => {
    it('sets the policy and the hardening headers', async () => {
        const res = await request(appWith('enforce')).get('/');
        expect(res.headers['content-security-policy']).toBe(CONTENT_SECURITY_POLICY);
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
        expect(res.headers['referrer-policy']).toBe('same-origin');
        expect(res.headers['permissions-policy']).toContain('camera=()');
        expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    });

    it('only reports in report-only mode', async () => {
        const res = await request(appWith('report-only')).get('/');
        expect(res.headers['content-security-policy']).toBeUndefined();
        expect(res.headers['content-security-policy-report-only']).toBe(CONTENT_SECURITY_POLICY);
    });

    it('drops only the policy when off', async () => {
        const res = await request(appWith('off')).get('/');
        expect(res.headers['content-security-policy']).toBeUndefined();
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('never allows eval or foreign hosts', () => {
        expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
        expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:/);
    });
});

describe('cspMode', () => {
    it('defaults to enforce', () => {
        expect(cspMode(undefined)).toBe('enforce');
        expect(cspMode('quatsch')).toBe('enforce');
    });
    it('reads report-only and off', () => {
        expect(cspMode(' Report-Only ')).toBe('report-only');
        expect(cspMode('off')).toBe('off');
    });
});
