import express from 'express';
import request from 'supertest';
import { LiveHub, type HubDeps, type LiveConnection } from '../live/hub';
import { hasLiveListeners, publishChange, publishVersionEvent } from '../live/broadcast';
import { setLiveHub } from '../live/registry';
import type { ServerMessage } from '../live/protocol';

const deps: HubDeps = {
    verifyToken: () => ({ userId: 1, role: 'curator' }),
    loadUser: async () => ({ id: 1, email: 'anna@hsbi.de' }),
    canAccessExhibition: async () => true,
    resolvePublicSlug: async () => null,
    keysInVersion: async (_v, keys) => new Set(keys),
};

const sent: ServerMessage[] = [];
const conn: LiveConnection = { send: (m) => sent.push(m), close: () => {} };

const app = express();
app.post('/change', (req, res) => {
    publishChange(req, 2, { kind: 'figure', op: 'delete', data: { id: 4 } });
    publishVersionEvent(req, 1, 'published', 2);
    res.json({ ok: true });
});

afterEach(() => setLiveHub(null));

it('publishes with the requesting tab as `by`, and does nothing without a hub', async () => {
    expect(hasLiveListeners(2)).toBe(false);
    await request(app).post('/change').expect(200);

    const hub = new LiveHub(deps);
    setLiveHub(hub);
    const handle = hub.attach(conn);
    await handle.onMessage(JSON.stringify({ t: 'hello', session: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', token: 't' }));
    await handle.onMessage(JSON.stringify({ t: 'where', exhibitionId: 1, versionId: 2, mode: 'orbit' }));
    expect(hasLiveListeners(2)).toBe(true);

    await request(app).post('/change').set('X-Live-Session', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb').expect(200);
    expect(sent.filter((m) => m.t === 'changed' || m.t === 'versions')).toEqual([
        { t: 'changed', versionId: 2, seq: 1, by: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', kind: 'figure', op: 'delete', data: { id: 4 } },
        { t: 'versions', exhibitionId: 1, event: 'published', versionId: 2, fallbackVersionId: null, by: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    ]);
    hub.dispose();
});
