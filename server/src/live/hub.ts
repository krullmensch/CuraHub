import {
    CLOSE,
    colorForUser,
    nameForEmail,
    parseClientMessage,
    type EditorMode,
    type LiveUser,
    type PresenceMember,
    type ServerMessage,
} from './protocol';

/**
 * In-memory state of the live channel: sessions (one per browser tab), where they are and who
 * sees whom. No sockets in here — `ws` lives in live/server.ts — so the whole protocol is testable
 * with plain objects and fake timers.
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
}

export interface ConnectionHandle {
    onMessage(raw: string): Promise<void>;
    onClose(): void;
}

const DEFAULT_HELLO_TIMEOUT_MS = 5_000;
const DEFAULT_GRACE_MS = 10_000;

export class LiveHub {
    private readonly sessions = new Map<string, Session>();
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

        return {
            onMessage: async (raw) => {
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
                }
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
            session = { id: sessionId, user, claims, conn, location: null, graceTimer: null, locationSeq: 0 };
            this.sessions.set(sessionId, session);
        }
        conn.send({ t: 'welcome', session: sessionId, user });
        // Resumed within the grace period: the others still list this tab; send it the current view.
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
        session.location = next;
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
            this.sessions.delete(session.id);
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

    private sendLocationState(session: Session) {
        const loc = session.location;
        if (!loc || !session.conn) return;
        const publicVisitors = this.publicVisitorsOf(loc.exhibitionId);
        session.conn.send(loc.kind === 'editor'
            ? { t: 'presence', exhibitionId: loc.exhibitionId, members: this.presenceOf(loc.exhibitionId), publicVisitors }
            : { t: 'visitors', count: publicVisitors });
    }
}
