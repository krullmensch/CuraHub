import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveClient, type LiveStatus, type SocketLike } from './liveClient';
import { CLOSE, parseServerMessage, type ServerMessage } from './protocol';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: unknown[] = [];
  closedWith: number | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close(code = 1000) { this.closedWith = code; this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.({}); }
  drop(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
  receive(msg: object) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

const WHERE = { t: 'where', exhibitionId: 4, versionId: 8, mode: 'orbit' } as const;

describe('LiveClient', () => {
  let sockets: FakeSocket[];
  let statuses: LiveStatus[];
  let messages: ServerMessage[];
  let sessionCounter: number;
  let token: string | null;
  let client: LiveClient;

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    statuses = [];
    messages = [];
    sessionCounter = 0;
    token = 'jwt';
    client = new LiveClient({
      createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
      getToken: () => token,
      newSessionId: () => `session-${++sessionCounter}`,
      onMessage: (m) => messages.push(m),
      onStatus: (s) => statuses.push(s),
      random: () => 0.5,
    });
  });
  afterEach(() => vi.useRealTimers());

  it('connects only once it has a location, then says hello and where', () => {
    expect(sockets).toHaveLength(0);
    client.setLocation(WHERE);
    expect(sockets).toHaveLength(1);
    sockets[0].open();
    expect(sockets[0].sent).toEqual([{ t: 'hello', session: 'session-1', token: 'jwt' }, WHERE]);
    expect(statuses).toEqual(['connecting', 'open']);
  });

  it('sends hello without a token for anonymous visitors', () => {
    token = null;
    client.setLocation({ t: 'visit', slug: 'licht' });
    sockets[0].open();
    expect(sockets[0].sent[0]).toEqual({ t: 'hello', session: 'session-1' });
  });

  it('sends location changes on the open socket, but not repeats', () => {
    client.setLocation(WHERE);
    sockets[0].open();
    client.setLocation({ ...WHERE });
    client.setLocation({ ...WHERE, mode: 'firstPerson' });
    expect(sockets[0].sent).toHaveLength(3);
    expect(sockets).toHaveLength(1);
  });

  it('says leave and closes when the location goes away', () => {
    client.setLocation(WHERE);
    sockets[0].open();
    client.setLocation(null);
    expect(sockets[0].sent.at(-1)).toEqual({ t: 'leave' });
    expect(sockets[0].closedWith).toBe(1000);
    expect(statuses.at(-1)).toBe('idle');
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('reconnects with backoff and resumes the same session and location', () => {
    client.setLocation(WHERE);
    sockets[0].open();
    sockets[0].drop();
    expect(statuses.at(-1)).toBe('offline');
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    sockets[1].drop();
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    sockets[2].open();
    expect(sockets[2].sent).toEqual([{ t: 'hello', session: 'session-1', token: 'jwt' }, WHERE]);
  });

  it('starts a fresh session when the server says the id is taken', () => {
    client.setLocation(WHERE);
    sockets[0].open();
    sockets[0].drop(CLOSE.sessionTaken);
    vi.advanceTimersByTime(1000);
    sockets[1].open();
    expect(sockets[1].sent[0]).toMatchObject({ session: 'session-2' });
  });

  it('gives up on a rejected token until the next location', () => {
    client.setLocation(WHERE);
    sockets[0].open();
    sockets[0].drop(CLOSE.unauthorized);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    client.setLocation(WHERE);
    expect(sockets).toHaveLength(2);
  });

  it('passes valid server messages on and ignores the rest', () => {
    client.setLocation(WHERE);
    sockets[0].open();
    sockets[0].receive({ t: 'visitors', count: 3 });
    sockets[0].receive({ t: 'from-the-future' });
    sockets[0].onmessage?.({ data: 'not json' });
    expect(messages).toEqual([{ t: 'visitors', count: 3 }]);
  });
});

describe('parseServerMessage', () => {
  it('reads presence lists', () => {
    const msg = parseServerMessage(JSON.stringify({
      t: 'presence', exhibitionId: 1, publicVisitors: 0,
      members: [{ session: 's', userId: 2, name: 'anna', color: '#fff', versionId: null, mode: 'wallEditor' }],
    }));
    expect(msg?.t).toBe('presence');
  });

  it('rejects malformed members and non-strings', () => {
    expect(parseServerMessage(JSON.stringify({ t: 'presence', exhibitionId: 1, publicVisitors: 0, members: [{ mode: 'x' }] }))).toBeNull();
    expect(parseServerMessage(42)).toBeNull();
  });
});
