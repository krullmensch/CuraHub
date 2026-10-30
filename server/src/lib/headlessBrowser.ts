import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable, Writable } from 'stream';
import { StringDecoder } from 'string_decoder';

export interface BrowserSession {
    open(url: string): Promise<void>;
    pageErrors(): string[];
    /** Resolves when the browser process ends, whatever the reason (a crash included). */
    exited(): Promise<void>;
    close(): Promise<void>;
}

export interface HeadlessBrowser {
    available(): Promise<boolean>;
    launch(): Promise<BrowserSession>;
}

// WebGL without a GPU: Alpine's chromium has no SwiftShader, so ANGLE runs on Vulkan and Mesa's
// software driver (lavapipe, package mesa-vulkan-swrast) draws.
export function chromiumArgs(userDataDir?: string): string[] {
    return [
        '--headless=new',
        '--use-angle=vulkan',
        '--enable-features=Vulkan',
        '--ignore-gpu-blocklist',
        ...(userDataDir ? [`--user-data-dir=${userDataDir}`] : []),
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--remote-debugging-pipe',
        '--no-first-run',
        '--mute-audio',
        'about:blank',
    ];
}

const CANDIDATES = ['/usr/bin/chromium', '/usr/bin/chromium-browser'];

export function chromiumBinary(): string {
    if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
    return CANDIDATES.find((p) => fs.existsSync(p)) ?? CANDIDATES[0];
}

/** One CDP message on the pipe: JSON followed by a NUL byte. */
export function encodeCdp(msg: unknown): Buffer {
    return Buffer.from(JSON.stringify(msg) + '\0');
}

/** Collects pipe chunks and returns the complete messages; the rest waits for the next chunk. */
export class CdpDecoder {
    private rest = '';
    // Keeps the bytes of a multi-byte character that a chunk boundary cut in two.
    private readonly utf8 = new StringDecoder('utf8');

    push(chunk: string | Buffer): unknown[] {
        this.rest += typeof chunk === 'string' ? chunk : this.utf8.write(chunk);
        const parts = this.rest.split('\0');
        this.rest = parts.pop() ?? '';
        return parts.filter((p) => p.length > 0).map((p) => JSON.parse(p) as unknown);
    }
}

export function decodeCdpChunks(chunks: Array<string | Buffer>): unknown[] {
    const decoder = new CdpDecoder();
    return chunks.flatMap((c) => decoder.push(c));
}

interface CdpMessage {
    id?: number;
    method?: string;
    sessionId?: string;
    result?: Record<string, unknown>;
    error?: { message?: string };
    params?: Record<string, unknown>;
}

const KILL_AFTER_MS = 2000;

class CdpSession implements BrowserSession {
    private nextId = 1;
    private pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>();
    private errors: string[] = [];
    private sessionId: string | null = null;
    private ended = false;
    private readonly exitPromise: Promise<void>;

    constructor(
        private readonly proc: ChildProcess,
        private readonly toBrowser: Writable,
        fromBrowser: Readable,
        private readonly profileDir: string,
    ) {
        const decoder = new CdpDecoder();
        fromBrowser.on('data', (chunk: Buffer) => {
            let messages: unknown[];
            try {
                messages = decoder.push(chunk);
            } catch {
                return;
            }
            for (const m of messages) this.handle(m as CdpMessage);
        });
        // A broken pipe must not crash the server; the exit handler fails the pending requests.
        toBrowser.on('error', () => {});
        fromBrowser.on('error', () => {});
        this.exitPromise = new Promise((resolve) => {
            proc.once('exit', () => {
                this.ended = true;
                for (const p of this.pending.values()) p.reject(new Error('Chromium wurde beendet'));
                this.pending.clear();
                // A SIGKILLed run leaves its profile (and lock files) behind; it is never reused.
                fs.promises.rm(this.profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
                resolve();
            });
        });
    }

    private handle(msg: CdpMessage): void {
        if (typeof msg.id === 'number') {
            const p = this.pending.get(msg.id);
            if (!p) return;
            this.pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message ?? 'CDP-Fehler'));
            else p.resolve(msg.result ?? {});
            return;
        }
        if (msg.sessionId !== this.sessionId) return;
        if (msg.method === 'Runtime.exceptionThrown') {
            const details = msg.params?.exceptionDetails as
                | { text?: string; exception?: { description?: string } }
                | undefined;
            this.errors.push(details?.exception?.description ?? details?.text ?? 'Exception');
        } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
            const args = (msg.params.args as Array<{ value?: unknown; description?: string }> | undefined) ?? [];
            this.errors.push(args.map((a) => (a.value !== undefined ? String(a.value) : a.description ?? '')).join(' '));
        }
    }

    send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
        if (this.ended) return Promise.reject(new Error('Chromium wurde beendet'));
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.toBrowser.write(encodeCdp({ id, method, params, ...(sessionId ? { sessionId } : {}) }), (err) => {
                if (err && this.pending.delete(id)) reject(err);
            });
        });
    }

    async open(url: string): Promise<void> {
        const { targetId } = (await this.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
        const attached = (await this.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
        this.sessionId = attached.sessionId;
        await this.send('Runtime.enable', {}, this.sessionId);
        await this.send('Page.enable', {}, this.sessionId);
        const nav = await this.send('Page.navigate', { url }, this.sessionId);
        if (typeof nav.errorText === 'string' && nav.errorText) throw new Error(`Seite konnte nicht geladen werden: ${nav.errorText}`);
    }

    exited(): Promise<void> {
        return this.exitPromise;
    }

    pageErrors(): string[] {
        return [...this.errors];
    }

    async close(): Promise<void> {
        if (this.ended) return;
        const timer = setTimeout(() => this.proc.kill('SIGKILL'), KILL_AFTER_MS);
        try {
            // Browser.close may be answered or the pipe may close first; either way wait for the exit.
            await this.send('Browser.close').catch(() => {});
            await this.exitPromise;
        } finally {
            clearTimeout(timer);
        }
    }
}

export const chromiumBrowser: HeadlessBrowser = {
    async available() {
        try {
            await fs.promises.access(chromiumBinary(), fs.constants.X_OK);
            return true;
        } catch {
            return false;
        }
    },

    async launch() {
        const profileDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'curahub-chromium-'));
        const proc = spawn(chromiumBinary(), chromiumArgs(profileDir), { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
        // Drain stderr so Chromium can never block on a full pipe.
        proc.stderr?.resume();
        try {
            await new Promise<void>((resolve, reject) => {
                proc.once('spawn', () => resolve());
                proc.once('error', reject);
            });
        } catch (err) {
            await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
            throw err;
        }
        return new CdpSession(proc, proc.stdio[3] as Writable, proc.stdio[4] as Readable, profileDir);
    },
};
