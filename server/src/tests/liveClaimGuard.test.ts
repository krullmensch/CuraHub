import express from 'express';
import request from 'supertest';
import { LiveHub, type HubDeps } from '../live/hub';
import { ensureNotClaimed } from '../live/claimGuard';
import { setLiveHub } from '../live/registry';

const deps: HubDeps = {
    verifyToken: () => ({ userId: 1, role: 'curator' }),
    loadUser: async () => ({ id: 1, email: 'anna@hsbi.de' }),
    canAccessExhibition: async () => true,
    resolvePublicSlug: async () => null,
    keysInVersion: async (_v, keys) => new Set(keys),
};

const SESSION = '66666666-6666-4666-8666-666666666666';

const app = express();
app.patch('/instances/:id', (req, res) => {
    if (!ensureNotClaimed(req, res, 'instance', Number(req.params.id))) return;
    res.json({ ok: true });
});

let hub: LiveHub;

beforeAll(async () => {
    hub = new LiveHub(deps);
    setLiveHub(hub);
    const handle = hub.attach({ send: () => {}, close: () => {} });
    await handle.onMessage(JSON.stringify({ t: 'hello', session: SESSION, token: 't' }));
    await handle.onMessage(JSON.stringify({ t: 'where', exhibitionId: 1, versionId: 2, mode: 'orbit' }));
    await handle.onMessage(JSON.stringify({ t: 'claim', seq: 1, groups: [['instance:7']] }));
});

afterAll(() => {
    setLiveHub(null);
    hub.dispose();
});

it('answers 423 to other tabs and requests without a session', async () => {
    const other = await request(app).patch('/instances/7').set('X-Live-Session', '77777777-7777-4777-8777-777777777777');
    expect(other.status).toBe(423);
    expect(other.body).toMatchObject({ code: 'claimed', error: 'Wird gerade von anna bearbeitet', holder: { name: 'anna' } });
    expect((await request(app).patch('/instances/7')).status).toBe(423);
});

it('lets the holder and unclaimed objects through', async () => {
    expect((await request(app).patch('/instances/7').set('X-Live-Session', SESSION)).status).toBe(200);
    expect((await request(app).patch('/instances/8')).status).toBe(200);
});

it('lets everything through without a hub', async () => {
    setLiveHub(null);
    expect((await request(app).patch('/instances/7')).status).toBe(200);
    setLiveHub(hub);
});
