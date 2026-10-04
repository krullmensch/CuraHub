import { CLOSE, parseServerMessage, type ClientMessage, type ServerMessage } from './protocol';

/**
 * One WebSocket per tab to `/api/live`. Opens while the tab has a location (editor or public
 * visit), says `hello` + the location on every (re)connect and reconnects with backoff.
 * No React and no stores in here — `liveConnection.ts` wires it up — so it runs under Vitest
 * with a fake socket.
 */

export type LiveLocation =
  | Extract<ClientMessage, { t: 'where' }>
  | Extract<ClientMessage, { t: 'visit' }>;

export type LiveStatus = 'idle' | 'connecting' | 'open' | 'offline';

/** The part of the browser WebSocket the client uses. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface LiveClientDeps {
  createSocket(): SocketLike;
  getToken(): string | null;
  newSessionId(): string;
  onMessage(msg: ServerMessage): void;
  onStatus(status: LiveStatus): void;
  random?: () => number;
}

const OPEN = 1;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];

export class LiveClient {
  private socket: SocketLike | null = null;
  private location: LiveLocation | null = null;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private session: string;
  private claimGroups: string[][] = [];
  private claimSeq = 0;
  private readonly deps: LiveClientDeps;

  constructor(deps: LiveClientDeps) {
    this.deps = deps;
    this.session = deps.newSessionId();
  }

  get sessionId(): string {
    return this.session;
  }

  /** Sequence number of the newest claim request; older `claimed` answers are stale. */
  get latestClaimSeq(): number {
    return this.claimSeq;
  }

  /**
   * The full set of claims this tab wants (groups, see lib/live/claims.ts). Kept and sent again
   * after every reconnect; only meaningful while the location is an editor version.
   */
  setClaims(groups: string[][]): number {
    this.claimGroups = groups;
    this.claimSeq++;
    if (this.location?.t === 'where') this.send({ t: 'claim', seq: this.claimSeq, groups });
    return this.claimSeq;
  }

  /** Where this tab is; null closes the connection. Repeated equal locations are not re-sent. */
  setLocation(location: LiveLocation | null): void {
    if (sameLocation(this.location, location)) return;
    this.location = location;
    if (!location) {
      this.claimGroups = [];
      this.send({ t: 'leave' });
      this.disconnect();
      return;
    }
    if (this.socket?.readyState === OPEN) this.send(location);
    else this.connect();
  }

  private connect() {
    if (this.socket || this.retryTimer) return;
    this.deps.onStatus('connecting');
    const socket = this.deps.createSocket();
    this.socket = socket;

    socket.onopen = () => {
      this.retries = 0;
      const token = this.deps.getToken();
      this.send({ t: 'hello', session: this.session, ...(token ? { token } : {}) });
      if (this.location) this.send(this.location);
      if (this.location?.t === 'where' && this.claimGroups.length > 0) {
        this.send({ t: 'claim', seq: ++this.claimSeq, groups: this.claimGroups });
      }
      this.deps.onStatus('open');
    };
    socket.onmessage = (ev) => {
      const msg = parseServerMessage(ev.data);
      if (msg) this.deps.onMessage(msg);
    };
    socket.onerror = () => { /* followed by onclose */ };
    socket.onclose = (ev) => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (!this.location) {
        this.deps.onStatus('idle');
        return;
      }
      this.deps.onStatus('offline');
      // Another person's session id (e.g. logged out in this tab): start a fresh one.
      if (ev.code === CLOSE.sessionTaken) this.session = this.deps.newSessionId();
      // A bad token won't get better by retrying; the next location change tries again.
      if (ev.code === CLOSE.unauthorized) {
        this.location = null;
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    const base = BACKOFF_MS[Math.min(this.retries, BACKOFF_MS.length - 1)];
    const jitter = 0.8 + 0.4 * (this.deps.random ?? Math.random)();
    this.retries++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.location) this.connect();
    }, base * jitter);
  }

  private disconnect() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retries = 0;
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'leave');
    this.deps.onStatus('idle');
  }

  private send(msg: ClientMessage) {
    if (this.socket?.readyState === OPEN) this.socket.send(JSON.stringify(msg));
  }
}

function sameLocation(a: LiveLocation | null, b: LiveLocation | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.t === 'visit' && b.t === 'visit') return a.slug === b.slug;
  if (a.t === 'where' && b.t === 'where') {
    return a.exhibitionId === b.exhibitionId && a.versionId === b.versionId && a.mode === b.mode;
  }
  return false;
}
