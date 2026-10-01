import express from 'express';
import request from 'supertest';
import { createSetupRouter, type SetupRouterDeps } from '../routes/setup';
import { authenticate } from '../lib/middleware';
import { ensureSetupSecrets, getSetupState, resetSetupStateForTests, setSetupState } from '../lib/setupState';
import type { Check } from '../lib/systemChecks';

const okChecks: Check[] = [{ id: 'database', label: 'Datenbank', status: 'ok', detail: 'ok' }];

type TestDeps = SetupRouterDeps & { completeSetup: jest.Mock };

function makeDeps(over: Partial<SetupRouterDeps> = {}): TestDeps {
    return {
        runChecks: async () => okChecks,
        validateHSBI: async () => true,
        hashPassword: async (pw: string) => `hashed:${pw}`,
        completeSetup: jest.fn(async () => {}),
        ...over,
    } as TestDeps;
}

function makeApp(deps: SetupRouterDeps) {
    const app = express();
    app.use(express.json());
    app.use('/api/setup', createSetupRouter(deps));
    app.get('/api/protected', authenticate, (_req, res) => res.json({ ok: true }));
    // Stands in for the SPA fallback / JSON 404 of index.ts.
    app.use((_req, res) => res.status(404).json({ error: 'fallthrough' }));
    return app;
}

const body = {
    publicUrl: 'https://curahub.hsbi.de/',
    localAdmin: { username: 'notfall', password: 'sehr-geheim-123' },
};

let code: string;
beforeEach(() => {
    resetSetupStateForTests();
    setSetupState({ complete: false, publicUrl: null });
    code = ensureSetupSecrets().code;
});
afterAll(() => setSetupState({ complete: true, publicUrl: null }));

async function token(app: express.Express): Promise<string> {
    const res = await request(app).post('/api/setup/verify-code').send({ code: code.toLowerCase() });
    expect(res.status).toBe(200);
    return res.body.token;
}

describe('setup API', () => {
    it('reports the status', async () => {
        const res = await request(makeApp(makeDeps())).get('/api/setup/status');
        expect(res.body).toEqual({ complete: false });
    });

    it('rejects a wrong code', async () => {
        const res = await request(makeApp(makeDeps())).post('/api/setup/verify-code').send({ code: 'AAAA-AAAA-AAAA' });
        expect(res.status).toBe(401);
    });

    it('requires the setup token', async () => {
        expect((await request(makeApp(makeDeps())).get('/api/setup/checks')).status).toBe(401);
    });

    it('never lets a setup token through authenticate', async () => {
        const app = makeApp(makeDeps());
        const t = await token(app);
        const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${t}`);
        expect(res.status).toBe(401);
    });

    it('returns checks and a suggested URL', async () => {
        const app = makeApp(makeDeps());
        const res = await request(app).get('/api/setup/checks').set('Authorization', `Bearer ${await token(app)}`).set('Host', 'x.de');
        expect(res.status).toBe(200);
        expect(res.body.checks).toEqual(okChecks);
        expect(res.body.suggestedPublicUrl).toBe('http://x.de');
    });

    it('reports an HSBI check result without storing anything', async () => {
        const deps = makeDeps({ validateHSBI: async () => false });
        const app = makeApp(deps);
        const res = await request(app).post('/api/setup/hsbi-check').set('Authorization', `Bearer ${await token(app)}`)
            .send({ username: 'mmuster', password: 'x' });
        expect(res.body).toEqual({ ok: false, reason: 'HSBI hat die Anmeldedaten abgelehnt.' });
        expect(deps.completeSetup).not.toHaveBeenCalled();
    });

    it('reports an unreachable hsbi.de', async () => {
        const app = makeApp(makeDeps({ validateHSBI: async () => { throw new Error('fetch failed'); } }));
        const res = await request(app).post('/api/setup/hsbi-check').set('Authorization', `Bearer ${await token(app)}`)
            .send({ username: 'mmuster2', password: 'x' });
        expect(res.body).toEqual({ ok: false, reason: 'www.hsbi.de ist vom Server aus nicht erreichbar.' });
    });

    it('rejects an invalid body with 400', async () => {
        const app = makeApp(makeDeps());
        const res = await request(app).post('/api/setup/complete').set('Authorization', `Bearer ${await token(app)}`)
            .send({ ...body, publicUrl: 'http://curahub.hsbi.de' });
        expect(res.status).toBe(400);
    });

    it('refuses to complete while a check fails', async () => {
        const deps = makeDeps({ runChecks: async () => [{ id: 'ffmpeg', label: 'ffmpeg', status: 'fail', detail: 'fehlt' }] });
        const app = makeApp(deps);
        const res = await request(app).post('/api/setup/complete').set('Authorization', `Bearer ${await token(app)}`).send(body);
        expect(res.status).toBe(409);
        expect(deps.completeSetup).not.toHaveBeenCalled();
    });

    it('writes nothing when the HSBI admin is rejected', async () => {
        const deps = makeDeps({ validateHSBI: async () => false });
        const app = makeApp(deps);
        const res = await request(app).post('/api/setup/complete').set('Authorization', `Bearer ${await token(app)}`)
            .send({ ...body, hsbiAdmin: { username: 'mmuster', password: 'x' } });
        expect(res.status).toBe(422);
        expect(deps.completeSetup).not.toHaveBeenCalled();
        expect(getSetupState()?.complete).toBe(false);
    });

    it('completes, then locks every setup route but status', async () => {
        const deps = makeDeps();
        const app = makeApp(deps);
        const t = await token(app);
        const res = await request(app).post('/api/setup/complete').set('Authorization', `Bearer ${t}`)
            .send({ ...body, hsbiAdmin: { username: 'MMuster', password: 'x' } });
        expect(res.status).toBe(200);
        expect(deps.completeSetup).toHaveBeenCalledWith({
            publicUrl: 'https://curahub.hsbi.de',
            localAdmin: { username: 'notfall', passwordHash: 'hashed:sehr-geheim-123' },
            hsbiEmail: 'mmuster@hsbi.de',
        });
        expect(getSetupState()).toEqual({ complete: true, publicUrl: 'https://curahub.hsbi.de' });
        expect((await request(app).get('/api/setup/status')).body).toEqual({ complete: true });
        expect((await request(app).get('/api/setup/checks').set('Authorization', `Bearer ${t}`)).status).toBe(404);
        expect((await request(app).post('/api/setup/verify-code').send({ code })).status).toBe(404);
    });

    it('hands requests to the next handler once set up (so GET /setup reaches the SPA)', async () => {
        setSetupState({ complete: true, publicUrl: 'https://curahub.hsbi.de' });
        const res = await request(makeApp(makeDeps())).get('/api/setup');
        expect(res.body).toEqual({ error: 'fallthrough' });
    });

    // Keep last: exhausts the per-IP code limit for this router.
    it('rate-limits code guessing', async () => {
        const app = makeApp(makeDeps());
        let last = 0;
        for (let i = 0; i < 6; i++) {
            last = (await request(app).post('/api/setup/verify-code').send({ code: 'BBBB-BBBB-BBBB' })).status;
        }
        expect(last).toBe(429);
    });
});
