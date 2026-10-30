import crypto from 'crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { HeadlessBrowser } from './headlessBrowser';
import { signArJobToken } from './arExportToken';
import { deleteArFiles, newArFileName, pruneOrphanArFiles, writeArFile } from './arExportFiles';

/**
 * AR export jobs: one headless Chromium run per published version builds the GLB + USDZ and
 * uploads them (see receiveArFiles). In-process queue, one job at a time, keyed by version id,
 * same pattern as `bookJobs.ts`. Rows left `queued`/`running` by a restart are queued again by
 * `resumeArExports`.
 */

export const AR_SIZE_RERUN = 80 * 1024 ** 2;
export const AR_SIZE_LIMIT = 150 * 1024 ** 2;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const PAGE_ERROR_POLL_MS = 1000;

const FATAL_MARKER = '[ar-export]';
const ERR_TIMEOUT = 'Zeitüberschreitung beim Export';
const ERR_CRASHED = 'Chromium ist abgestürzt';
const ERR_NO_CHROMIUM = 'Chromium nicht installiert';
export const AR_ERR_TOO_BIG = 'Zu groß für AR';

export interface ArJobDeps {
    prisma: PrismaClient;
    browser: HeadlessBrowser;
    baseUrl: () => string;
    onStatus: (exhibitionId: number, versionId: number) => void;
    timeoutMs?: number;
}

export interface ArFiles { glb: Buffer; usdz: Buffer; skipped: number }
type Outcome = ArFiles | 'discarded';

interface CurrentJob {
    versionId: number;
    jobId: string;
    received: boolean;
    /** Settled 'discarded' by a newer publish; it only has to wind down, it no longer covers its version. */
    aborted: boolean;
    exhibitionId: number;
    settle: (outcome: Outcome) => void;
    reject: (err: Error) => void;
}

let deps: ArJobDeps | null = null;
const queue: number[] = [];
let current: CurrentJob | null = null;
let loop: Promise<void> | null = null;

export function configureArExportJobs(next: ArJobDeps): void {
    deps = next;
}

const cfg = (): ArJobDeps => {
    if (!deps) throw new Error('AR export jobs are not configured');
    return deps;
};

const errorText = (err: unknown): string => (err instanceof Error && err.message ? err.message : String(err));

export function arExportQueuePosition(versionId: number): number | null {
    const index = queue.indexOf(versionId);
    return index >= 0 ? index + 1 : null;
}

/** Resolves once the queue is empty and no job is running (tests, graceful flows). */
export async function arExportIdle(): Promise<void> {
    while (loop) await loop;
}

function notify(exhibitionId: number, versionId: number) {
    try {
        cfg().onStatus(exhibitionId, versionId);
    } catch (err) {
        console.error('[ArExport] onStatus failed:', err);
    }
}

async function setRow(
    exhibitionId: number,
    versionId: number,
    data: Record<string, unknown>,
): Promise<number> {
    const { count } = await cfg().prisma.arExport.updateMany({ where: { versionId }, data });
    notify(exhibitionId, versionId);
    return count;
}

async function removeRow(versionId: number): Promise<void> {
    const { prisma } = cfg();
    const row = await prisma.arExport.findUnique({ where: { versionId } });
    if (row) await deleteArFiles([row.glb_file, row.usdz_file]);
    await prisma.arExport.deleteMany({ where: { versionId } });
}

export async function enqueueArExport(versionId: number): Promise<void> {
    const { prisma } = cfg();
    if (current?.versionId === versionId && !current.aborted) {
        // Running: that job covers it, but a publish of another version may have deleted its row meanwhile.
        const found = await prisma.exhibitionVersion.findUnique({ where: { id: versionId }, select: { exhibition_id: true } });
        if (found) {
            await prisma.arExport.upsert({
                where: { versionId }, create: { versionId, status: 'running', started_at: new Date() }, update: {},
            });
            notify(found.exhibition_id, versionId);
        }
        return;
    }
    if (queue.includes(versionId)) return;
    const version = await prisma.exhibitionVersion.findUnique({
        where: { id: versionId }, select: { exhibition_id: true },
    });
    if (!version) return;
    await prisma.arExport.upsert({
        where: { versionId },
        create: { versionId, status: 'queued' },
        update: { status: 'queued', error: null },
    });
    if (!queue.includes(versionId) && (current?.versionId !== versionId || current.aborted)) queue.push(versionId);
    notify(version.exhibition_id, versionId);
    pump();
}

function pump() {
    if (loop || queue.length === 0) return;
    loop = (async () => {
        try {
            for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
                try {
                    await runJob(next);
                } catch (err) {
                    console.error(`[ArExport] job for version ${next} crashed:`, err);
                }
            }
        } finally {
            loop = null;
        }
    })();
}

/** One Chromium run. Timeout covers launch, open and the wait for the upload. */
async function attempt(job: CurrentJob, maxTexture: number): Promise<Outcome> {
    const { browser, baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS } = cfg();
    const token = signArJobToken(job.versionId, job.jobId);
    const url = `${baseUrl()}/ar-export/${job.versionId}?maxTexture=${maxTexture}#token=${token}`;

    let session: Awaited<ReturnType<HeadlessBrowser['launch']>> | null = null;
    let timer: NodeJS.Timeout | undefined;
    let poll: NodeJS.Timeout | undefined;
    const launching = browser.launch();
    launching.catch(() => undefined);

    const uploaded = new Promise<Outcome>((resolve, reject) => { job.settle = resolve; job.reject = reject; });
    uploaded.catch(() => undefined);
    const work = (async () => {
        session = await launching;
        await session.open(url);
        return uploaded;
    })();
    work.catch(() => undefined);
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(ERR_TIMEOUT)), timeoutMs);
    });
    const pageError = new Promise<never>((_, reject) => {
        poll = setInterval(() => {
            // Only the export page's own fatal errors; other console errors (a texture failing to load) are skipped works.
            const first = (session?.pageErrors() ?? []).find((e) => e.includes(FATAL_MARKER));
            if (first) reject(new Error(first));
        }, PAGE_ERROR_POLL_MS);
    });
    pageError.catch(() => undefined);
    // A crashed Chromium would otherwise only show up as the timeout. Closing it ourselves also resolves this, but then the race is over.
    const crashed = launching.then(async (s) => {
        await s.exited();
        throw new Error(ERR_CRASHED);
    });
    crashed.catch(() => undefined);

    try {
        return await Promise.race([work, timeout, pageError, crashed]);
    } finally {
        clearTimeout(timer);
        clearInterval(poll);
        const opened = session as { close(): Promise<void> } | null;
        if (opened) await opened.close().catch(() => undefined);
        else launching.then((s) => s.close()).catch(() => undefined);
    }
}

async function runJob(versionId: number): Promise<void> {
    const { prisma, browser } = cfg();
    const version = await prisma.exhibitionVersion.findUnique({
        where: { id: versionId }, select: { exhibition_id: true, is_published: true },
    });
    if (!version) return;
    const eid = version.exhibition_id;
    if (!version.is_published) {
        await removeRow(versionId);
        notify(eid, versionId);
        return;
    }

    await setRow(eid, versionId, { status: 'running', started_at: new Date(), error: null });
    const fail = async (error: string) => {
        console.warn(`[ArExport] version ${versionId} failed: ${error}`);
        await setRow(eid, versionId, { status: 'failed', error, finished_at: new Date() });
    };

    try {
        if (!(await browser.available())) return await fail(ERR_NO_CHROMIUM);

        let files: ArFiles | null = null;
        for (const maxTexture of [2048, 1024]) {
            const job: CurrentJob = {
                versionId, jobId: crypto.randomUUID(), received: false, aborted: false, exhibitionId: eid,
                settle: () => undefined, reject: () => undefined,
            };
            current = job;
            let outcome: Outcome;
            try {
                outcome = await attempt(job, maxTexture);
            } finally {
                current = null;
            }
            if (outcome === 'discarded') {
                console.log(`[ArExport] version ${versionId}: result discarded (no longer published)`);
                return;
            }
            const biggest = Math.max(outcome.glb.length, outcome.usdz.length);
            if (biggest > AR_SIZE_RERUN && maxTexture === 2048) {
                console.log(`[ArExport] version ${versionId}: ${biggest} bytes at 2048 px, rerun at 1024 px`);
                continue;
            }
            if (biggest > AR_SIZE_LIMIT) return await fail(AR_ERR_TOO_BIG);
            files = outcome;
            break;
        }
        if (!files) return await fail(AR_ERR_TOO_BIG);

        const found = await prisma.arExport.findUnique({ where: { versionId } });
        const previous = [found?.glb_file, found?.usdz_file];
        const glbName = newArFileName(versionId, 'glb');
        const usdzName = newArFileName(versionId, 'usdz');
        await writeArFile(glbName, files.glb);
        await writeArFile(usdzName, files.usdz);
        const updated = await setRow(eid, versionId, {
            status: 'done', glb_file: glbName, usdz_file: usdzName,
            glb_size: files.glb.length, usdz_size: files.usdz.length,
            skipped: files.skipped, error: null, finished_at: new Date(),
        });
        if (updated === 0) {
            // Row vanished while the job ran (version deleted or unpublished).
            await deleteArFiles([glbName, usdzName]);
            return;
        }
        await deleteArFiles(previous);
        console.log(`[ArExport] version ${versionId} done (${files.glb.length} / ${files.usdz.length} bytes, ${files.skipped} skipped)`);
    } catch (err) {
        await fail(errorText(err));
    }
}

/**
 * Called by the upload route. Only the currently running job of that version may deliver, and
 * only once, which is what makes a token single-job.
 */
export async function receiveArFiles(
    versionId: number,
    jobId: string,
    files: ArFiles,
): Promise<'stored' | 'discarded' | 'stale'> {
    const job = current;
    if (!job || job.versionId !== versionId || job.jobId !== jobId || job.received) return 'stale';
    job.received = true;

    try {
        const version = await cfg().prisma.exhibitionVersion.findUnique({
            where: { id: versionId }, select: { is_published: true },
        });
        if (current !== job) return 'stale';
        if (!version?.is_published) {
            await removeRow(versionId);
            notify(job.exhibitionId, versionId);
            job.settle('discarded');
            return 'discarded';
        }
    } catch (err) {
        job.reject(err instanceof Error ? err : new Error(String(err)));
        throw err;
    }
    if (current !== job) return 'stale';
    job.settle(files);
    return 'stored';
}

/** The upload route refused the files (size cap): ends the running job of that token with this message. */
export function failArJob(versionId: number, jobId: string, message: string): boolean {
    const job = current;
    if (!job || job.versionId !== versionId || job.jobId !== jobId || job.received) return false;
    job.received = true;
    job.reject(new Error(message));
    return true;
}

/** Publishing a version drops the exhibition's other exports and builds the new one. */
export async function onVersionPublished(exhibitionId: number, versionId: number): Promise<void> {
    const { prisma } = cfg();
    const others = await prisma.exhibitionVersion.findMany({
        where: { exhibition_id: exhibitionId, id: { not: versionId } }, select: { id: true },
    });
    for (const { id } of others) {
        const index = queue.indexOf(id);
        if (index >= 0) queue.splice(index, 1);
        if (current?.versionId === id) {
            // Running for a version that is no longer published: stop it so the new one starts at once.
            current.received = true;
            current.aborted = true;
            current.settle('discarded');
        }
        await removeRow(id);
        notify(exhibitionId, id);
    }
    await enqueueArExport(versionId);
}

/** The row cascades with the version; the files don't. */
export async function onVersionDeleted(versionId: number): Promise<void> {
    const index = queue.indexOf(versionId);
    if (index >= 0) queue.splice(index, 1);
    await removeRow(versionId);
}

/** Exhibition, project or user deletes cascade to their versions: drop those versions' exports first. */
export async function onVersionsDeleted(where: Prisma.ExhibitionVersionWhereInput): Promise<void> {
    const versions = await cfg().prisma.exhibitionVersion.findMany({ where, select: { id: true } });
    for (const { id } of versions) await onVersionDeleted(id);
}

/** Server start. Prunes first: pruning also deletes in-flight `.tmp` files, so nothing may run yet. */
export async function resumeArExports(): Promise<void> {
    const { prisma } = cfg();
    const rows = await prisma.arExport.findMany();
    const known = new Set<string>();
    for (const row of rows) {
        if (row.glb_file) known.add(row.glb_file);
        if (row.usdz_file) known.add(row.usdz_file);
    }
    const removed = await pruneOrphanArFiles(known);
    if (removed > 0) console.log(`[ArExport] removed ${removed} orphan file(s)`);

    const published = await prisma.exhibitionVersion.findMany({
        where: { is_published: true }, select: { id: true },
    });
    const done = new Set(rows.filter((r) => r.status === 'done').map((r) => r.versionId));
    for (const { id } of published) {
        if (!done.has(id)) await enqueueArExport(id);
    }
}
