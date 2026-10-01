import express from 'express';
import request from 'supertest';
import { setupGate } from '../lib/setupGate';
import { resetSetupStateForTests, setSetupState } from '../lib/setupState';

function app() {
    const a = express();
    a.use(setupGate);
    a.use((_req, res) => res.status(200).send('through'));
    return a;
}

afterEach(() => resetSetupStateForTests());

describe('setupGate while setup is open', () => {
    beforeEach(() => setSetupState({ complete: false, publicUrl: null }));

    it.each(['/auth/login', '/api/projects', '/public/x', '/uploads/a.webp', '/api/uploads/a.webp', '/admin/users', '/exhibitions/3/versions'])(
        'blocks %s with 503', async (p) => {
            const res = await request(app()).get(p);
            expect(res.status).toBe(503);
            expect(res.body).toEqual({ error: 'setup_required' });
        });

    it.each(['/setup', '/setup/status', '/api/setup/status', '/health', '/api/health', '/', '/assets/index-abc.js', '/exhibition/yol', '/login'])(
        'lets %s through', async (p) => {
            expect((await request(app()).get(p)).status).toBe(200);
        });

    it('blocks writes to frontend-looking exhibition paths', async () => {
        expect((await request(app()).post('/exhibition/yol')).status).toBe(503);
    });
});

describe('setupGate after setup', () => {
    it('lets everything through', async () => {
        setSetupState({ complete: true, publicUrl: 'https://x.de' });
        expect((await request(app()).get('/api/projects')).status).toBe(200);
    });
});
