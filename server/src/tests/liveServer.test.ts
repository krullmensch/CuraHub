import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { LiveHub, type HubDeps } from '../live/hub';
import { attachLiveServer } from '../live/server';
import type { ServerMessage } from '../live/protocol';
import { setSetupState } from '../lib/setupState';

const deps: HubDeps = {
    verifyToken: (token) => (token === 'ok' ? { userId: 7, role: 'curator' } : null),
    loadUser: async (id) => ({ id, email: 'dora@hsbi.de' }),
    canAccessExhibition: async () => true,
    resolvePublicSlug: async () => 5,
};

let server: http.Server;
let stop: () => void;
let base: string;

beforeEach(async () => {
    server = http.createServer((_req, res) => { res.statusCode = 404; res.end(); });
    stop = attachLiveServer(server, new LiveHub(deps));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
    stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    setSetupState({ complete: true, publicUrl: null });
});

function open(path: string): Promise<{ ws: WebSocket; next: () => Promise<ServerMessage> }> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(base + path);
        const queue: ServerMessage[] = [];
        const waiters: ((m: ServerMessage) => void)[] = [];
        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString()) as ServerMessage;
            const waiter = waiters.shift();
            if (waiter) waiter(msg);
            else queue.push(msg);
        });
        ws.on('open', () => resolve({
            ws,
            next: () => {
                const queued = queue.shift();
                return queued ? Promise.resolve(queued) : new Promise((r) => waiters.push(r));
            },
        }));
        ws.on('error', reject);
    });
}

function upgradeStatus(path: string): Promise<number | undefined> {
    return new Promise((resolve) => {
        const ws = new WebSocket(base + path);
        ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
        ws.on('error', () => resolve(undefined));
        ws.on('open', () => { ws.close(); resolve(101); });
    });
}

it('runs hello → where → presence over a real socket on both mount points', async () => {
    for (const path of ['/api/live', '/live']) {
        const { ws, next } = await open(path);
        ws.send(JSON.stringify({ t: 'hello', session: '44444444-4444-4444-8444-444444444444', token: 'ok' }));
        ws.send(JSON.stringify({ t: 'where', exhibitionId: 3, versionId: 9, mode: 'orbit' }));
        expect(await next()).toMatchObject({ t: 'welcome', user: { id: 7, name: 'dora' } });
        expect(await next()).toMatchObject({ t: 'presence', exhibitionId: 3, members: [{ userId: 7, versionId: 9 }] });
        ws.close();
    }
});

it('refuses other paths and an instance that is not set up', async () => {
    expect(await upgradeStatus('/socket')).toBe(404);
    setSetupState({ complete: false, publicUrl: null });
    expect(await upgradeStatus('/api/live')).toBe(503);
});
