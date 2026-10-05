import {
    CLOSE,
    MAX_CLAIM_KEYS,
    colorForUser,
    nameForEmail,
    parseClientMessage,
    type ClaimEntry,
    type ClaimHolder,
    type ClientMessage,
    type EditorMode,
    type LiveChange,
    type LiveTransform,
    type LiveUser,
    type PresenceMember,
    type ServerMessage,
    type VersionEvent,
} from './protocol';

/**
 * In-memory state of the live channel: sessions (one per browser tab), where they are, who
 * sees whom and who holds which object (claims). No sockets in here — `ws` lives in
 * live/server.ts — so the whole protocol is testable with plain objects and fake timers.
 */

export interface LiveConnection {
    send(msg: ServerMessage): void;
    close(code: number, reason: string): void;
}

export interface TokenClaims {
    userId: number;
    role: string;
}

export interface HubDeps {
    verifyToken(token: string): TokenClaims | null;
    loadUser(userId: number): Promise<{ id: number; email: string } | null>;
    /** Exhibition visible to the user (owner, collaborator, admin) and, when given, the version belongs to it. */
    canAccessExhibition(claims: TokenClaims, exhibitionId: number, versionId: number | null): Promise<boolean>;
    /** Exhibition id behind a public slug, only while one of its versions is published. */
    resolvePublicSlug(slug: string): Promise<number | null>;
    /** The subset of claim keys whose objects belong to this version. */
    keysInVersion(versionId: number, keys: string[]): Promise<Set<string>>;
}

export interface HubOptions {
    helloTimeoutMs?: number;
    graceMs?: number;
}

type Location =
    | { kind: 'editor'; exhibitionId: number; versionId: number | null; mode: EditorMode }
    | { kind: 'public'; exhibitionId: number };

interface Session {
    id: string;
    user: LiveUser | null;
    claims: TokenClaims | null;
    conn: LiveConnection | null;
    location: Location | null;
    graceTimer: ReturnType<typeof setTimeout> | null;
    /** Bumped per location request so a slow access check can't overwrite a newer one. */
    locationSeq: number;
    /** Claim keys this tab holds; always objects of its current version. */
    claimKeys: Set<string>;
    /** Time of the last relayed drag (rate limit). */
    lastDragAt: number;
}

/** Drags faster than this are dropped (clients send ≤ 15 per second). */
const MIN_RELAY_INTERVAL_MS = 40;

export interface ConnectionHandle {
    onMessage(raw: string): Promise<void>;
    onClose(): void;
}

const DEFAULT_HELLO_TIMEOUT_MS = 5_000;
const DEFAULT_GRACE_MS = 10_000;

export class LiveHub {
    private readonly sessions = new Map<string, Session>();
    /** Claim key → session id. Keys are database ids, unique across versions. */
    private readonly claimOwners = new Map<string, string>();
    /** Number of the last change per version, so a tab can tell it missed one. */
    private readonly versionSeq = new Map<number, number>();
    private readonly helloTimeoutMs: number;
    private readonly graceMs: number;
    private disposed = false;

    constructor(private readonly deps: HubDeps, options: HubOptions = {}) {
        this.helloTimeoutMs = options.helloTimeoutMs ?? DEFAULT_HELLO_TIMEOUT_MS;
        this.graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
    }

    /** Registers a freshly opened socket. It must say `hello` before anything else. */
    attach(conn: LiveConnection): ConnectionHandle {
        let session: Session | null = null;
        // Set by the first `hello`; later messages wait for it, so a client may send its
        // location right behind the hello without waiting for `welcome`.
        let ready: Promise<Session | null> | null = null;
        let closed = false;
        const helloTimer = setTimeout(() => {
            if (!ready && !closed) conn.close(CLOSE.helloTimeout, 'hello expected');
        }, this.helloTimeoutMs);

        // Messages of one socket are handled one after the other: a `claim` sent right behind a
        // `where` must see the location that `where` sets after its database check.
        let queue: Promise<void> = Promise.resolve();
        const handleMessage = async (raw: string) => {
            if (closed) return;
            const msg = parseClientMessage(raw);
            if (!msg) {
                conn.send({ t: 'error', code: 'bad_message', message: 'Ungültige Nachricht' });
                return;
            }
            if (!ready) {
                if (msg.t !== 'hello') {
                    clearTimeout(helloTimer);
                    conn.close(CLOSE.badMessage, 'hello expected');
                    return;
                }
                clearTimeout(helloTimer);
                ready = this.hello(conn, msg.session, msg.token).then((s) => {
                    session = s;
                    // The socket may have closed while the user was loaded.
                    if (s && closed) this.detach(s, conn);
                    return s;
                });
                await ready;
                return;
            }
            const current = await ready;
            if (!current || closed || current.conn !== conn) return; // refused, or replaced by a newer socket of the same tab
            switch (msg.t) {
                case 'hello':
                    return;
                case 'where':
                    return this.where(current, msg.exhibitionId, msg.versionId, msg.mode);
                case 'visit':
                    return this.visit(current, msg.slug);
                case 'leave':
                    current.locationSeq++;
                    return this.moveTo(current, null);
                case 'claim':
                    return this.claim(current, msg);
                case 'drag':
                    return this.drag(current, msg.transforms);
            }
        };

        return {
            onMessage: (raw) => {
                const run = queue.then(() => handleMessage(raw));
                queue = run.catch(() => undefined);
                return run;
            },
            onClose: () => {
                closed = true;
                clearTimeout(helloTimer);
                if (session) this.detach(session, conn);
            },
        };
    }

    /** Presence list of an exhibition, as sent to its editors. */
    presenceOf(exhibitionId: number): PresenceMember[] {
        const members: PresenceMember[] = [];
        for (const s of this.sessions.values()) {
            const loc = s.location;
            if (!s.user || loc?.kind !== 'editor' || loc.exhibitionId !== exhibitionId) continue;
            members.push({
                session: s.id,
                userId: s.user.id,
                name: s.user.name,
                color: s.user.color,
                versionId: loc.versionId,
                mode: loc.mode,
            });
        }
        return members;
    }

    publicVisitorsOf(exhibitionId: number): number {
        let count = 0;
        for (const s of this.sessions.values()) {
            if (s.location?.kind === 'public' && s.location.exhibitionId === exhibitionId) count++;
        }
        return count;
    }

    /** Who holds this key, if anyone (REST guard, tests). */
    holderOf(key: string): ClaimHolder | null {
        const owner = this.claimOwners.get(key);
        const session = owner ? this.sessions.get(owner) : undefined;
        return session ? holderOfSession(session) : null;
    }

    /** All claims held in a version. */
    claimsOf(versionId: number): ClaimEntry[] {
        const entries: ClaimEntry[] = [];
        for (const [key, owner] of this.claimOwners) {
            const session = this.sessions.get(owner);
            if (session && versionOf(session) === versionId) entries.push({ key, ...holderOfSession(session) });
        }
        return entries;
    }

    /** True while any tab is in this version — routes skip building change payloads otherwise. */
    hasVersionListeners(versionId: number): boolean {
        for (const s of this.sessions.values()) {
            if (s.conn && versionOf(s) === versionId) return true;
        }
        return false;
    }

    /** Tells every tab in a version (including the one that made it) about a saved change. */
    publishChange(versionId: number, by: string | null, change: LiveChange): void {
        const seq = (this.versionSeq.get(versionId) ?? 0) + 1;
        this.versionSeq.set(versionId, seq);
        const msg = { t: 'changed', versionId, seq, by, ...change } as ServerMessage;
        for (const s of this.sessions.values()) {
            if (s.conn && versionOf(s) === versionId) s.conn.send(msg);
        }
    }

    /** Tells the editors of an exhibition that its versions changed. */
    publishVersionEvent(exhibitionId: number, by: string | null, event: VersionEvent, versionId: number, fallbackVersionId: number | null = null): void {
        if (event === 'deleted') this.versionSeq.delete(versionId);
        const msg: ServerMessage = { t: 'versions', exhibitionId, event, versionId, fallbackVersionId, by };
        for (const s of this.sessions.values()) {
            if (s.conn && s.location?.kind === 'editor' && s.location.exhibitionId === exhibitionId) s.conn.send(msg);
        }
    }

    get sessionCount(): number {
        return this.sessions.size;
    }

    /** Drops every session (server shutdown, tests). */
    dispose(): void {
        this.disposed = true;
        for (const s of this.sessions.values()) {
            if (s.graceTimer) clearTimeout(s.graceTimer);
        }
        this.sessions.clear();
        this.claimOwners.clear();
    }

    private async hello(conn: LiveConnection, sessionId: string, token: string | undefined): Promise<Session | null> {
        let claims: TokenClaims | null = null;
        let user: LiveUser | null = null;
        if (token) {
            claims = this.deps.verifyToken(token);
            const row = claims ? await this.deps.loadUser(claims.userId) : null;
            if (!claims || !row) {
                conn.close(CLOSE.unauthorized, 'invalid token');
                return null;
            }
            user = { id: row.id, name: nameForEmail(row.email), color: colorForUser(row.id) };
        }

        const existing = this.sessions.get(sessionId);
        // A session id is bound to whoever used it first: nobody can step into another person's
        // tab (and, later, its claims) by replaying the id.
        if (existing && (existing.user?.id ?? null) !== (user?.id ?? null)) {
            conn.close(CLOSE.sessionTaken, 'session belongs to someone else');
            return null;
        }

        let session: Session;
        if (existing) {
            session = existing;
            if (session.graceTimer) {
                clearTimeout(session.graceTimer);
                session.graceTimer = null;
            }
            // Reconnect while the old socket still looked open: the new one wins.
            if (session.conn && session.conn !== conn) session.conn.close(CLOSE.replaced, 'replaced');
            session.conn = conn;
            session.claims = claims;
        } else {
            session = {
                id: sessionId, user, claims, conn, location: null, graceTimer: null, locationSeq: 0,
                claimKeys: new Set(), lastDragAt: 0,
            };
            this.sessions.set(sessionId, session);
        }
        conn.send({ t: 'welcome', session: sessionId, user });
        // Resumed within the grace period: the others still list this tab and its claims are
        // kept; send it the current view.
        if (session.location) this.sendLocationState(session);
        return session;
    }

    private async where(session: Session, exhibitionId: number, versionId: number | null, mode: EditorMode) {
        const seq = ++session.locationSeq;
        if (!session.claims) {
            session.conn?.send({ t: 'error', code: 'unauthorized', message: 'Nicht angemeldet' });
            return;
        }
        const loc = session.location;
        const sameExhibition = loc?.kind === 'editor' && loc.exhibitionId === exhibitionId;
        // Mode changes within an already checked exhibition/version need no database round trip.
        const allowed = (sameExhibition && loc.versionId === versionId)
            || await this.deps.canAccessExhibition(session.claims, exhibitionId, versionId);
        if (seq !== session.locationSeq || !this.sessions.has(session.id)) return;
        if (!allowed) {
            session.conn?.send({ t: 'error', code: 'forbidden', message: 'Kein Zugriff auf diese Ausstellung' });
            this.moveTo(session, null);
            return;
        }
        this.moveTo(session, { kind: 'editor', exhibitionId, versionId, mode });
    }

    private async visit(session: Session, slug: string) {
        const seq = ++session.locationSeq;
        const exhibitionId = await this.deps.resolvePublicSlug(slug);
        if (seq !== session.locationSeq || !this.sessions.has(session.id)) return;
        if (exhibitionId === null) {
            session.conn?.send({ t: 'error', code: 'not_public', message: 'Diese Ausstellung ist nicht öffentlich' });
            this.moveTo(session, null);
            return;
        }
        this.moveTo(session, { kind: 'public', exhibitionId });
    }

    private moveTo(session: Session, next: Location | null) {
        const prev = session.location;
        const prevVersion = versionOf(session);
        session.location = next;
        const nextVersion = versionOf(session);
        if (prevVersion !== nextVersion) {
            // Claims belong to the version: whoever leaves it lets go.
            if (session.claimKeys.size > 0) {
                this.releaseAll(session);
                if (prevVersion !== null) this.broadcastClaims(prevVersion);
            }
            if (nextVersion !== null && session.conn) this.sendVersionState(session.conn, nextVersion);
        }
        const touched = new Set<number>();
        if (prev) touched.add(prev.exhibitionId);
        if (next) touched.add(next.exhibitionId);
        for (const exhibitionId of touched) this.broadcastExhibition(exhibitionId);
        // Leaving: the editor no longer receives that exhibition's presence; say so explicitly.
        if (prev?.kind === 'editor' && next?.kind !== 'editor') {
            session.conn?.send({ t: 'presence', exhibitionId: prev.exhibitionId, members: [], publicVisitors: 0 });
        }
    }

    private detach(session: Session, conn: LiveConnection) {
        if (session.conn !== conn || this.disposed) return;
        session.conn = null;
        if (session.graceTimer) clearTimeout(session.graceTimer);
        session.graceTimer = setTimeout(() => {
            session.graceTimer = null;
            if (session.conn) return;
            const version = versionOf(session);
            this.releaseAll(session);
            this.sessions.delete(session.id);
            if (version !== null) this.broadcastClaims(version);
            if (session.location) {
                const exhibitionId = session.location.exhibitionId;
                session.location = null;
                this.broadcastExhibition(exhibitionId);
            }
        }, this.graceMs);
    }

    private broadcastExhibition(exhibitionId: number) {
        const members = this.presenceOf(exhibitionId);
        const publicVisitors = this.publicVisitorsOf(exhibitionId);
        const presence: ServerMessage = { t: 'presence', exhibitionId, members, publicVisitors };
        const visitors: ServerMessage = { t: 'visitors', count: publicVisitors };
        for (const s of this.sessions.values()) {
            if (!s.conn || s.location?.exhibitionId !== exhibitionId) continue;
            s.conn.send(s.location.kind === 'editor' ? presence : visitors);
        }
    }

    private async claim(session: Session, msg: Extract<ClientMessage, { t: 'claim' }>) {
        const conn = session.conn;
        const versionId = versionOf(session);
        const total = msg.groups.reduce((n, g) => n + g.length, 0);
        if (versionId === null || !session.user || total > MAX_CLAIM_KEYS) {
            conn?.send({ t: 'error', code: 'claim_refused', message: 'Sperren nur innerhalb einer Version möglich' });
            return;
        }

        // Only objects of this version can be claimed; checked once per newly requested key.
        const fresh = [...new Set(msg.groups.flat())].filter((k) => !session.claimKeys.has(k));
        const valid = fresh.length > 0 ? await this.deps.keysInVersion(versionId, fresh) : new Set<string>();
        if (versionOf(session) !== versionId || !this.sessions.has(session.id)) return;

        const wanted = new Set<string>();
        const denied = new Map<string, ClaimHolder>();
        for (const group of msg.groups) {
            let ok = true;
            for (const key of group) {
                if (session.claimKeys.has(key)) continue;
                const owner = this.claimOwners.get(key);
                const holder = owner && owner !== session.id ? this.sessions.get(owner) : undefined;
                if (holder) {
                    denied.set(key, holderOfSession(holder));
                    ok = false;
                } else if (!valid.has(key)) {
                    ok = false;
                }
            }
            // A refused group still keeps what this tab already held in it — a wall stays claimed
            // when an artwork that someone else holds is hung on it later.
            for (const key of group) {
                if (ok || session.claimKeys.has(key)) wanted.add(key);
            }
        }

        let changed = false;
        for (const key of session.claimKeys) {
            if (!wanted.has(key)) {
                this.claimOwners.delete(key);
                changed = true;
            }
        }
        for (const key of wanted) {
            if (!session.claimKeys.has(key)) changed = true;
            this.claimOwners.set(key, session.id);
        }
        session.claimKeys = wanted;

        conn?.send({
            t: 'claimed',
            seq: msg.seq,
            granted: [...wanted],
            denied: [...denied].map(([key, holder]) => ({ key, holder })),
        });
        if (changed) this.broadcastClaims(versionId);
    }

    /** What a tab entering (or resuming in) a version needs first: change counter and claims. */
    private sendVersionState(conn: LiveConnection, versionId: number) {
        conn.send({ t: 'version', versionId, seq: this.versionSeq.get(versionId) ?? 0 });
        conn.send({ t: 'claims', versionId, entries: this.claimsOf(versionId) });
    }

    private drag(session: Session, transforms: LiveTransform[]) {
        const versionId = versionOf(session);
        const now = Date.now();
        if (versionId === null || now - session.lastDragAt < MIN_RELAY_INTERVAL_MS) return;
        session.lastDragAt = now;
        // Only objects this tab holds can be shown moving.
        const own = transforms.filter((t) => this.claimOwners.get(t.k) === session.id);
        this.sendToVersion(versionId, { t: 'drag', session: session.id, transforms: own }, session.id);
    }

    private sendToVersion(versionId: number, msg: ServerMessage, exceptSession: string | null) {
        for (const s of this.sessions.values()) {
            if (s.conn && s.id !== exceptSession && versionOf(s) === versionId) s.conn.send(msg);
        }
    }

    private releaseAll(session: Session) {
        for (const key of session.claimKeys) {
            if (this.claimOwners.get(key) === session.id) this.claimOwners.delete(key);
        }
        session.claimKeys = new Set();
    }

    private broadcastClaims(versionId: number) {
        const msg: ServerMessage = { t: 'claims', versionId, entries: this.claimsOf(versionId) };
        for (const s of this.sessions.values()) {
            if (s.conn && versionOf(s) === versionId) s.conn.send(msg);
        }
    }

    private sendLocationState(session: Session) {
        const loc = session.location;
        if (!loc || !session.conn) return;
        const version = versionOf(session);
        if (version !== null) this.sendVersionState(session.conn, version);
        const publicVisitors = this.publicVisitorsOf(loc.exhibitionId);
        session.conn.send(loc.kind === 'editor'
            ? { t: 'presence', exhibitionId: loc.exhibitionId, members: this.presenceOf(loc.exhibitionId), publicVisitors }
            : { t: 'visitors', count: publicVisitors });
    }
}

function versionOf(session: Session): number | null {
    const loc = session.location;
    return loc?.kind === 'editor' ? loc.versionId : null;
}

function holderOfSession(session: Session): ClaimHolder {
    const user = session.user;
    return { session: session.id, userId: user?.id ?? 0, name: user?.name ?? '', color: user?.color ?? '#888888' };
}
