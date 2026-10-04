import { LiveHub, type HubDeps, type LiveConnection } from '../live/hub';
import { CLOSE, colorForUser, type ServerMessage } from '../live/protocol';
import { isLivePath, liveOriginAllowed } from '../live/origin';

const SESSION_A = '11111111-1111-4111-8111-111111111111';
const SESSION_B = '22222222-2222-4222-8222-222222222222';
const SESSION_V = '33333333-3333-4333-8333-333333333333';

const USERS: Record<number, string> = { 1: 'anna@hsbi.de', 2: 'ben@hsbi.de', 3: 'carla@hsbi.de' };

/** Exhibition 10 (versions 100, 101) is open to users 1 and 2; slug `open` is published as 10. */
const deps: HubDeps = {
    verifyToken: (token) => (token.startsWith('user-') ? { userId: Number(token.slice(5)), role: 'curator' } : null),
    loadUser: async (id) => (USERS[id] ? { id, email: USERS[id] } : null),
    canAccessExhibition: async (claims, exhibitionId, versionId) =>
        exhibitionId === 10 && claims.userId !== 3 && (versionId === null || versionId === 100 || versionId === 101),
    resolvePublicSlug: async (slug) => (slug === 'open' ? 10 : null),
    // Version 100 has instances 1–9, wall 5 and figure 2; version 101 has instance 50.
    keysInVersion: async (versionId, keys) => new Set(keys.filter((k) => {
        const [kind, raw] = k.split(':');
        const id = Number(raw);
        if (versionId === 100) return (kind === 'instance' && id < 10) || k === 'wall:5' || k === 'figure:2';
        return versionId === 101 && k === 'instance:50';
    })),
};

class FakeConn implements LiveConnection {
    sent: ServerMessage[] = [];
    closed: { code: number; reason: string } | null = null;
    send(msg: ServerMessage) { this.sent.push(msg); }
    close(code: number, reason: string) { this.closed = { code, reason }; }
    last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
        return [...this.sent].reverse().find((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
    }
}

const json = (msg: object) => JSON.stringify(msg);

async function connect(hub: LiveHub, session: string, token?: string) {
    const conn = new FakeConn();
    const handle = hub.attach(conn);
    await handle.onMessage(json({ t: 'hello', session, token }));
    return { conn, handle };
}

describe('LiveHub', () => {
    let hub: LiveHub;
    beforeEach(() => { hub = new LiveHub(deps, { helloTimeoutMs: 1000, graceMs: 5000 }); });
    afterEach(() => { hub.dispose(); jest.useRealTimers(); });

    it('welcomes a signed-in tab with name and colour', async () => {
        const { conn } = await connect(hub, SESSION_A, 'user-1');
        expect(conn.last('welcome')).toEqual({ t: 'welcome', session: SESSION_A, user: { id: 1, name: 'anna', color: colorForUser(1) } });
    });

    it('welcomes anonymous visitors without a user', async () => {
        const { conn } = await connect(hub, SESSION_V);
        expect(conn.last('welcome')?.user).toBeNull();
    });

    it('closes on a bad token', async () => {
        const { conn } = await connect(hub, SESSION_A, 'garbage');
        expect(conn.closed?.code).toBe(CLOSE.unauthorized);
        expect(hub.sessionCount).toBe(0);
    });

    it('requires hello first and within the timeout', async () => {
        jest.useFakeTimers();
        const conn = new FakeConn();
        hub.attach(conn);
        jest.advanceTimersByTime(1000);
        expect(conn.closed?.code).toBe(CLOSE.helloTimeout);

        const other = new FakeConn();
        await hub.attach(other).onMessage(json({ t: 'leave' }));
        expect(other.closed?.code).toBe(CLOSE.badMessage);
    });

    it('answers garbage with an error but keeps the socket', async () => {
        const { conn, handle } = await connect(hub, SESSION_A, 'user-1');
        await handle.onMessage('{nope');
        await handle.onMessage(json({ t: 'where', exhibitionId: -1, versionId: null, mode: 'orbit' }));
        expect(conn.sent.filter((m) => m.t === 'error')).toHaveLength(2);
        expect(conn.closed).toBeNull();
    });

    it('accepts a location sent right behind hello, before welcome', async () => {
        const conn = new FakeConn();
        const handle = hub.attach(conn);
        const hello = handle.onMessage(json({ t: 'hello', session: SESSION_A, token: 'user-1' }));
        const where = handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));
        await Promise.all([hello, where]);
        expect(conn.last('presence')?.members.map((m) => m.session)).toEqual([SESSION_A]);
    });

    it('lists everybody in the exhibition with version and mode', async () => {
        const a = await connect(hub, SESSION_A, 'user-1');
        const b = await connect(hub, SESSION_B, 'user-2');
        await a.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));
        await b.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 101, mode: 'firstPerson' }));

        const seenByA = a.conn.last('presence');
        expect(seenByA?.exhibitionId).toBe(10);
        expect(seenByA?.members).toEqual([
            { session: SESSION_A, userId: 1, name: 'anna', color: colorForUser(1), versionId: 100, mode: 'orbit' },
            { session: SESSION_B, userId: 2, name: 'ben', color: colorForUser(2), versionId: 101, mode: 'firstPerson' },
        ]);
        expect(b.conn.last('presence')).toEqual(seenByA);

        await b.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 101, mode: 'wallEditor' }));
        expect(a.conn.last('presence')?.members[1].mode).toBe('wallEditor');
    });

    it('refuses exhibitions without access and anonymous editors', async () => {
        const c = await connect(hub, SESSION_A, 'user-3');
        await c.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));
        expect(c.conn.last('error')?.code).toBe('forbidden');
        expect(hub.presenceOf(10)).toEqual([]);

        const v = await connect(hub, SESSION_V);
        await v.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));
        expect(v.conn.last('error')?.code).toBe('unauthorized');
    });

    it('refuses a version of another exhibition', async () => {
        const a = await connect(hub, SESSION_A, 'user-1');
        await a.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 999, mode: 'orbit' }));
        expect(a.conn.last('error')?.code).toBe('forbidden');
    });

    it('counts public visitors for visitors and editors', async () => {
        const a = await connect(hub, SESSION_A, 'user-1');
        await a.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));
        const v = await connect(hub, SESSION_V);
        await v.handle.onMessage(json({ t: 'visit', slug: 'open' }));
        const b = await connect(hub, SESSION_B, 'user-2');
        await b.handle.onMessage(json({ t: 'visit', slug: 'open' }));

        expect(v.conn.last('visitors')).toEqual({ t: 'visitors', count: 2 });
        expect(a.conn.last('presence')?.publicVisitors).toBe(2);
        // Visitors never receive the editors' presence.
        expect(v.conn.sent.some((m) => m.t === 'presence')).toBe(false);

        await b.handle.onMessage(json({ t: 'leave' }));
        expect(v.conn.last('visitors')?.count).toBe(1);
        expect(a.conn.last('presence')?.publicVisitors).toBe(1);
    });

    it('refuses unpublished slugs', async () => {
        const v = await connect(hub, SESSION_V);
        await v.handle.onMessage(json({ t: 'visit', slug: 'secret' }));
        expect(v.conn.last('error')?.code).toBe('not_public');
    });

    it('keeps a closed tab for the grace period and resumes it on reconnect', async () => {
        jest.useFakeTimers();
        const a = await connect(hub, SESSION_A, 'user-1');
        const b = await connect(hub, SESSION_B, 'user-2');
        await a.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));
        await b.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));

        b.handle.onClose();
        jest.advanceTimersByTime(4000);
        expect(hub.presenceOf(10)).toHaveLength(2);

        const again = await connect(hub, SESSION_B, 'user-2');
        // Still listed, and told the current state at once.
        expect(again.conn.last('presence')?.members).toHaveLength(2);
        jest.advanceTimersByTime(10_000);
        expect(hub.presenceOf(10)).toHaveLength(2);
    });

    it('drops a closed tab after the grace period and tells the others', async () => {
        jest.useFakeTimers();
        const a = await connect(hub, SESSION_A, 'user-1');
        const b = await connect(hub, SESSION_B, 'user-2');
        await a.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));
        await b.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));

        b.handle.onClose();
        jest.advanceTimersByTime(5000);
        expect(a.conn.last('presence')?.members.map((m) => m.userId)).toEqual([1]);
        expect(hub.sessionCount).toBe(1);
    });

    it('lets a reconnect replace a socket that still looked open', async () => {
        const first = await connect(hub, SESSION_A, 'user-1');
        const second = await connect(hub, SESSION_A, 'user-1');
        expect(first.conn.closed?.code).toBe(CLOSE.replaced);
        first.handle.onClose(); // must not detach the new socket
        await second.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));
        expect(second.conn.last('presence')?.members).toHaveLength(1);
        // Messages on the replaced socket are ignored.
        await first.handle.onMessage(json({ t: 'leave' }));
        expect(hub.presenceOf(10)).toHaveLength(1);
    });

    it('binds a session id to its first user', async () => {
        await connect(hub, SESSION_A, 'user-1');
        const thief = await connect(hub, SESSION_A, 'user-2');
        expect(thief.conn.closed?.code).toBe(CLOSE.sessionTaken);
        const anon = await connect(hub, SESSION_A);
        expect(anon.conn.closed?.code).toBe(CLOSE.sessionTaken);
    });

    it('handles a socket\'s messages in order, so the newest location wins', async () => {
        let release: (ok: boolean) => void = () => {};
        const slowDeps: HubDeps = {
            ...deps,
            canAccessExhibition: (claims, exhibitionId, versionId) =>
                versionId === 100 ? new Promise((resolve) => { release = resolve; }) : deps.canAccessExhibition(claims, exhibitionId, versionId),
        };
        const slowHub = new LiveHub(slowDeps);
        const a = await connect(slowHub, SESSION_A, 'user-1');
        const first = a.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));
        const second = a.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 101, mode: 'orbit' }));
        await new Promise((resolve) => setImmediate(resolve)); // first check is waiting now
        release(true);
        await Promise.all([first, second]);
        expect(slowHub.presenceOf(10).map((m) => m.versionId)).toEqual([101]);
        slowHub.dispose();
    });

    it('sends an empty presence when an editor leaves', async () => {
        const a = await connect(hub, SESSION_A, 'user-1');
        await a.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));
        await a.handle.onMessage(json({ t: 'leave' }));
        expect(a.conn.last('presence')).toEqual({ t: 'presence', exhibitionId: 10, members: [], publicVisitors: 0 });
    });
});

describe('live origin + path', () => {
    it('accepts same host, allowed origins and non-browser clients in production', () => {
        expect(liveOriginAllowed({ host: 'cura.example' }, [], true)).toBe(true);
        expect(liveOriginAllowed({ origin: 'https://cura.example', host: 'cura.example' }, [], true)).toBe(true);
        expect(liveOriginAllowed({ origin: 'https://cura.example', host: '127.0.0.1:3000', 'x-forwarded-host': 'cura.example' }, [], true)).toBe(true);
        expect(liveOriginAllowed({ origin: 'https://app.other', host: 'cura.example' }, ['https://app.other'], true)).toBe(true);
    });

    it('refuses foreign origins in production only', () => {
        expect(liveOriginAllowed({ origin: 'https://evil.example', host: 'cura.example' }, [], true)).toBe(false);
        expect(liveOriginAllowed({ origin: 'not a url', host: 'cura.example' }, [], true)).toBe(false);
        expect(liveOriginAllowed({ origin: 'http://localhost:5173', host: 'localhost:3000' }, [], false)).toBe(true);
    });

    it('matches both mount points', () => {
        expect(isLivePath('/api/live')).toBe(true);
        expect(isLivePath('/live?x=1')).toBe(true);
        expect(isLivePath('/api/live/x')).toBe(false);
        expect(isLivePath(undefined)).toBe(false);
    });
});

describe('LiveHub claims', () => {
    let hub: LiveHub;
    beforeEach(() => { hub = new LiveHub(deps, { graceMs: 5000 }); });
    afterEach(() => { hub.dispose(); jest.useRealTimers(); });

    async function editor(session: string, user: number, versionId = 100) {
        const tab = await connect(hub, session, `user-${user}`);
        await tab.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId, mode: 'orbit' }));
        return tab;
    }
    const claim = (tab: { handle: { onMessage(raw: string): Promise<void> } }, seq: number, groups: string[][]) =>
        tab.handle.onMessage(json({ t: 'claim', seq, groups }));

    it('grants free keys, refuses held ones and tells the version', async () => {
        const a = await editor(SESSION_A, 1);
        const b = await editor(SESSION_B, 2);
        await claim(a, 1, [['instance:1'], ['instance:2']]);
        expect(a.conn.last('claimed')).toEqual({ t: 'claimed', seq: 1, granted: ['instance:1', 'instance:2'], denied: [] });
        expect(b.conn.last('claims')?.entries.map((e) => [e.key, e.name])).toEqual([['instance:1', 'anna'], ['instance:2', 'anna']]);

        await claim(b, 7, [['instance:2'], ['instance:3']]);
        const answer = b.conn.last('claimed');
        expect(answer?.seq).toBe(7);
        expect(answer?.granted).toEqual(['instance:3']);
        expect(answer?.denied).toEqual([{ key: 'instance:2', holder: { session: SESSION_A, userId: 1, name: 'anna', color: colorForUser(1) } }]);
        expect(hub.holderOf('instance:2')?.session).toBe(SESSION_A);
        expect(hub.holderOf('instance:3')?.session).toBe(SESSION_B);
    });

    it('treats a claim as the full set: keys left out are released', async () => {
        const a = await editor(SESSION_A, 1);
        await claim(a, 1, [['instance:1'], ['instance:2']]);
        await claim(a, 2, [['instance:2']]);
        expect(hub.holderOf('instance:1')).toBeNull();
        await claim(a, 3, []);
        expect(hub.claimsOf(100)).toEqual([]);
        expect(a.conn.last('claims')?.entries).toEqual([]);
    });

    it('grants a group all or nothing', async () => {
        const a = await editor(SESSION_A, 1);
        const b = await editor(SESSION_B, 2);
        await claim(a, 1, [['instance:4']]);
        await claim(b, 1, [['wall:5', 'instance:3', 'instance:4']]);
        expect(b.conn.last('claimed')?.granted).toEqual([]);
        expect(hub.holderOf('wall:5')).toBeNull();
        expect(hub.holderOf('instance:3')).toBeNull();
    });

    it('keeps what a refused group already held', async () => {
        const a = await editor(SESSION_A, 1);
        const b = await editor(SESSION_B, 2);
        await claim(b, 1, [['wall:5', 'instance:3']]);
        await claim(a, 1, [['instance:4']]);
        // Instance 4 was hung on wall 5 meanwhile: b keeps the wall, a keeps the instance.
        await claim(b, 2, [['wall:5', 'instance:3', 'instance:4']]);
        expect(b.conn.last('claimed')?.granted.sort()).toEqual(['instance:3', 'wall:5']);
        expect(hub.holderOf('instance:4')?.session).toBe(SESSION_A);
    });

    it('only claims objects of the own version', async () => {
        const a = await editor(SESSION_A, 1);
        await claim(a, 1, [['instance:50'], ['figure:2'], ['instance:9999']]);
        expect(a.conn.last('claimed')?.granted).toEqual(['figure:2']);
    });

    it('refuses claims outside a version, from visitors, and oversized sets', async () => {
        const v = await connect(hub, SESSION_V);
        await v.handle.onMessage(json({ t: 'visit', slug: 'open' }));
        await claim(v, 1, [['instance:1']]);
        expect(v.conn.last('error')?.code).toBe('claim_refused');

        const a = await connect(hub, SESSION_A, 'user-1');
        await a.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: null, mode: 'orbit' }));
        await claim(a, 1, [['instance:1']]);
        expect(a.conn.last('error')?.code).toBe('claim_refused');

        const b = await editor(SESSION_B, 2);
        const huge = Array.from({ length: 1001 }, (_, i) => [`instance:${i + 1}`, `instance:${i + 5000}`]);
        await claim(b, 1, huge);
        expect(b.conn.last('error')?.code).toBe('claim_refused');
        expect(hub.claimsOf(100)).toEqual([]);
    });

    it('rejects malformed keys', async () => {
        const a = await editor(SESSION_A, 1);
        await claim(a, 1, [['instance:-1']]);
        await claim(a, 2, [['zone:1']]);
        expect(a.conn.sent.filter((m) => m.t === 'error').map((m) => m.t === 'error' && m.code)).toEqual(['bad_message', 'bad_message']);
    });

    it('handles a claim sent right behind its where', async () => {
        const a = await connect(hub, SESSION_A, 'user-1');
        const where = a.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'orbit' }));
        const claimed = claim(a, 1, [['instance:1']]);
        await Promise.all([where, claimed]);
        expect(a.conn.last('claimed')?.granted).toEqual(['instance:1']);
    });

    it('releases on version switch and leave, and shows a newcomer the version\'s claims', async () => {
        const a = await editor(SESSION_A, 1);
        await claim(a, 1, [['instance:1']]);
        const b = await editor(SESSION_B, 2);
        expect(b.conn.last('claims')?.entries.map((e) => e.key)).toEqual(['instance:1']);

        await a.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 101, mode: 'orbit' }));
        expect(hub.holderOf('instance:1')).toBeNull();
        expect(b.conn.last('claims')?.entries).toEqual([]);

        await claim(b, 1, [['instance:2']]);
        await b.handle.onMessage(json({ t: 'where', exhibitionId: 10, versionId: 100, mode: 'firstPerson' }));
        expect(hub.holderOf('instance:2')?.session).toBe(SESSION_B); // mode change keeps claims
        await b.handle.onMessage(json({ t: 'leave' }));
        expect(hub.holderOf('instance:2')).toBeNull();
    });

    it('keeps claims through a reconnect and drops them after the grace period', async () => {
        jest.useFakeTimers();
        const a = await editor(SESSION_A, 1);
        const b = await editor(SESSION_B, 2);
        await claim(b, 1, [['instance:1']]);
        b.handle.onClose();
        jest.advanceTimersByTime(4000);
        expect(hub.holderOf('instance:1')?.session).toBe(SESSION_B);

        const again = await connect(hub, SESSION_B, 'user-2');
        expect(again.conn.last('claims')?.entries.map((e) => e.key)).toEqual(['instance:1']);
        again.handle.onClose();
        jest.advanceTimersByTime(5000);
        expect(hub.holderOf('instance:1')).toBeNull();
        expect(a.conn.last('claims')?.entries).toEqual([]);
    });

    it('lets the same person\'s other tab be refused like anyone else', async () => {
        const first = await editor(SESSION_A, 1);
        const second = await editor(SESSION_B, 1);
        await claim(first, 1, [['instance:1']]);
        await claim(second, 1, [['instance:1']]);
        expect(second.conn.last('claimed')?.denied[0].holder.session).toBe(SESSION_A);
    });
});
