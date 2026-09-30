import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import type { Request } from 'express';
import type { PrismaClient } from '@prisma/client';

/** Health of an installation — shown by the setup wizard and on the admin page. */
export type CheckStatus = 'ok' | 'warn' | 'fail';
export interface Check { id: string; label: string; status: CheckStatus; detail: string }
export interface CheckRequestInfo { forwarded: boolean; protocol: string }

export interface CheckDeps {
    pingDb(): Promise<void>;
    migrationRows(): Promise<{ finished: number; failed: number }>;
    migrationFolderCount(): number;
    uploadsDir: string;
    writeProbe(dir: string): Promise<void>;
    run(cmd: string, args: string[]): Promise<void>;
    freeBytes(dir: string): Promise<number>;
    reachHsbi(): Promise<void>;
    timeoutMs?: number;
}

export const MIN_FREE_BYTES = 10 * 1024 ** 3;
const DEFAULT_TIMEOUT_MS = 6_000;

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new TimeoutError()), ms);
        p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
}

function reason(err: unknown): string {
    if (err instanceof TimeoutError) return 'Zeitüberschreitung';
    return err instanceof Error ? err.message : String(err);
}

const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

export async function runSystemChecks(deps: CheckDeps, info: CheckRequestInfo): Promise<Check[]> {
    const ms = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const attempt = async (
        id: string, label: string, onError: CheckStatus,
        body: () => Promise<{ status: CheckStatus; detail: string }>,
    ): Promise<Check> => {
        try {
            return { id, label, ...(await withTimeout(body(), ms)) };
        } catch (err) {
            return { id, label, status: onError, detail: reason(err) };
        }
    };

    const proxyLabel = 'Reverse Proxy (Apache)';
    const proxy: Check = !info.forwarded
        ? { id: 'proxy', label: proxyLabel, status: 'warn', detail: 'Anfrage kam direkt an die App, nicht über Apache.' }
        : info.protocol !== 'https'
            ? { id: 'proxy', label: proxyLabel, status: 'warn', detail: 'Apache leitet weiter, aber nicht per HTTPS (X-Forwarded-Proto fehlt).' }
            : { id: 'proxy', label: proxyLabel, status: 'ok', detail: 'Über Apache per HTTPS erreicht.' };

    const checks = await Promise.all([
        attempt('database', 'Datenbank', 'fail', async () => {
            await deps.pingDb();
            return { status: 'ok', detail: 'Verbindung steht.' };
        }),
        attempt('migrations', 'Datenbank-Migrationen', 'fail', async () => {
            const { finished, failed } = await deps.migrationRows();
            const expected = deps.migrationFolderCount();
            if (failed > 0) return { status: 'fail', detail: `${failed} Migration(en) fehlgeschlagen.` };
            if (finished < expected) return { status: 'fail', detail: `${finished} von ${expected} Migrationen angewendet.` };
            return { status: 'ok', detail: `${finished} Migrationen angewendet.` };
        }),
        attempt('uploads', 'Upload-Ordner beschreibbar', 'fail', async () => {
            await deps.writeProbe(deps.uploadsDir);
            return { status: 'ok', detail: deps.uploadsDir };
        }),
        attempt('ffmpeg', 'ffmpeg (Videos)', 'fail', async () => {
            await deps.run('ffmpeg', ['-version']);
            return { status: 'ok', detail: 'Vorhanden.' };
        }),
        attempt('poppler', 'poppler (PDF-Bücher)', 'fail', async () => {
            await deps.run('pdfinfo', ['-v']);
            await deps.run('pdftoppm', ['-v']);
            return { status: 'ok', detail: 'pdfinfo und pdftoppm vorhanden.' };
        }),
        attempt('disk', 'Freier Speicher', 'warn', async () => {
            const free = await deps.freeBytes(deps.uploadsDir);
            return free < MIN_FREE_BYTES
                ? { status: 'warn', detail: `Nur ${gb(free)} frei (empfohlen: mindestens 10 GB).` }
                : { status: 'ok', detail: `${gb(free)} frei.` };
        }),
        attempt('hsbi', 'HSBI-Login erreichbar', 'warn', async () => {
            await deps.reachHsbi();
            return { status: 'ok', detail: 'www.hsbi.de antwortet.' };
        }),
    ]);

    return [...checks, proxy];
}

export function requestInfo(req: Request): CheckRequestInfo {
    return { forwarded: typeof req.headers['x-forwarded-for'] === 'string', protocol: req.protocol };
}

export function defaultCheckDeps(prisma: PrismaClient, uploadsDir: string): CheckDeps {
    const migrationsDir = path.join(__dirname, '../../prisma/migrations');
    return {
        pingDb: async () => { await prisma.$queryRaw`SELECT 1`; },
        migrationRows: async () => {
            const rows = await prisma.$queryRaw<{ finished: unknown; failed: unknown }[]>`
                SELECT
                    SUM(finished_at IS NOT NULL AND rolled_back_at IS NULL) AS finished,
                    SUM(finished_at IS NULL AND rolled_back_at IS NULL) AS failed
                FROM _prisma_migrations`;
            return { finished: Number(rows[0]?.finished ?? 0), failed: Number(rows[0]?.failed ?? 0) };
        },
        migrationFolderCount: () =>
            fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).length,
        uploadsDir,
        writeProbe: async (dir) => {
            const probe = path.join(dir, `.write-probe-${crypto.randomUUID()}`);
            await fs.promises.writeFile(probe, 'ok');
            await fs.promises.rm(probe);
        },
        run: (cmd, args) => new Promise<void>((resolve, reject) => {
            execFile(cmd, args, { timeout: 5_000 }, (err) => (err ? reject(err) : resolve()));
        }),
        freeBytes: async (dir) => {
            const s = await fs.promises.statfs(dir);
            return s.bavail * s.bsize;
        },
        reachHsbi: async () => {
            await fetch('https://www.hsbi.de/login', { method: 'HEAD', signal: AbortSignal.timeout(5_000) });
        },
    };
}
