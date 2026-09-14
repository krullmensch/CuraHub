import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * VID-03: resumable chunked uploads. Cloudflare limits a request body to 100 MB, so large
 * videos/models are sent as a series of PUTs of at most CHUNK_MAX_BYTES each and assembled in
 * `<uploads>/.partial/<id>` (dot-directory, never served by express.static).
 *
 * Sessions live in memory (single process, like idempotency.ts): a server restart drops them
 * and the client has to start over. Idle sessions are removed after SESSION_IDLE_TTL_MS.
 */

/** Chunk size the client is told to use. */
export const CHUNK_SIZE_BYTES = 16 * 1024 * 1024;
/** Hard limit per PUT (headroom above CHUNK_SIZE_BYTES, still far below Cloudflare's 100 MB). */
export const CHUNK_MAX_BYTES = 32 * 1024 * 1024;

const SESSION_IDLE_TTL_MS = 6 * 60 * 60 * 1000;
/** Completed sessions keep their result so a retried `complete` (lost response) gets the same answer. */
const COMPLETED_TTL_MS = 15 * 60 * 1000;
const MAX_OPEN_SESSIONS_PER_USER = 6;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export interface ChunkedUploadResult {
    status: number;
    body: unknown;
}

export interface ChunkedUploadSession {
    id: string;
    userId: number;
    originalname: string;
    mimetype: string;
    size: number;
    /** Final filename inside the uploads dir once assembled. */
    storedFilename: string;
    partialPath: string;
    received: number;
    fields: Record<string, string>;
    busy: boolean;
    updatedAt: number;
    result?: ChunkedUploadResult;
}

export class ChunkedUploadStore {
    private readonly sessions = new Map<string, ChunkedUploadSession>();
    private readonly partialDir: string;

    constructor(uploadDir: string) {
        this.partialDir = path.join(uploadDir, '.partial');
        // Sessions don't survive a restart, so leftovers are unreachable.
        fs.rmSync(this.partialDir, { recursive: true, force: true });
        fs.mkdirSync(this.partialDir, { recursive: true });
        setInterval(() => this.sweep(), SWEEP_INTERVAL_MS).unref();
    }

    /** Returns null when the user already has too many open uploads. */
    create(init: Omit<ChunkedUploadSession, 'id' | 'partialPath' | 'received' | 'busy' | 'updatedAt' | 'result'>): ChunkedUploadSession | null {
        const open = [...this.sessions.values()].filter((s) => s.userId === init.userId && !s.result).length;
        if (open >= MAX_OPEN_SESSIONS_PER_USER) return null;

        const id = crypto.randomUUID();
        const session: ChunkedUploadSession = {
            ...init,
            id,
            partialPath: path.join(this.partialDir, id),
            received: 0,
            busy: false,
            updatedAt: Date.now(),
        };
        fs.writeFileSync(session.partialPath, '');
        this.sessions.set(id, session);
        return session;
    }

    get(id: string, userId: number): ChunkedUploadSession | undefined {
        const session = this.sessions.get(id);
        return session && session.userId === userId ? session : undefined;
    }

    remove(id: string) {
        const session = this.sessions.get(id);
        if (!session) return;
        this.sessions.delete(id);
        fs.rmSync(session.partialPath, { force: true });
    }

    private sweep() {
        const now = Date.now();
        for (const session of this.sessions.values()) {
            const ttl = session.result ? COMPLETED_TTL_MS : SESSION_IDLE_TTL_MS;
            if (!session.busy && now - session.updatedAt > ttl) this.remove(session.id);
        }
    }
}
