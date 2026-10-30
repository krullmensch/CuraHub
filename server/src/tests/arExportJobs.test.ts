import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import type { BrowserSession, HeadlessBrowser } from '../lib/headlessBrowser';
import { setArDirForTests } from '../lib/arExportFiles';
import { verifyArJobToken } from '../lib/arExportToken';
import {
    AR_SIZE_LIMIT, AR_SIZE_RERUN, arExportIdle, arExportQueuePosition, configureArExportJobs,
    enqueueArExport, failArJob, onVersionDeleted, onVersionPublished, receiveArFiles, resumeArExports,
} from '../lib/arExportJobs';

interface Row {
    versionId: number; status: string; glb_file: string | null; usdz_file: string | null;
    glb_size: number | null; usdz_size: number | null; skipped: number; error: string | null;
    started_at: Date | null; finished_at: Date | null;
}
interface Ver { id: number; exhibition_id: number; is_published: boolean }

function makeFakePrisma(versions: Ver[], rows: Row[] = []) {
    const match = (r: Row, where: { versionId?: number | { in: number[] } }) => {
        const w = where.versionId;
        if (w === undefined) return true;
        return typeof w === 'number' ? r.versionId === w : w.in.includes(r.versionId);
    };
    const blank = (versionId: number): Row => ({
        versionId, status: 'queued', glb_file: null, usdz_file: null, glb_size: null, usdz_size: null,
        skipped: 0, error: null, started_at: null, finished_at: null,
    });
    const prisma = {
        exhibitionVersion: {
            findUnique: async ({ where }: { where: { id: number } }) => versions.find((v) => v.id === where.id) ?? null,
            findMany: async ({ where }: { where: { exhibition_id?: number; is_published?: boolean; id?: { not: number } } }) =>
                versions.filter((v) =>
                    (where.exhibition_id === undefined || v.exhibition_id === where.exhibition_id) &&
                    (where.is_published === undefined || v.is_published === where.is_published) &&
                    (where.id === undefined || v.id !== where.id.not)),
        },
        arExport: {
            findUnique: async ({ where }: { where: { versionId: number } }) => rows.find((r) => r.versionId === where.versionId) ?? null,
            findMany: async (args?: { where?: { versionId?: { in: number[] } } }) => rows.filter((r) => match(r, args?.where ?? {})),
            upsert: async ({ where, create, update }: { where: { versionId: number }; create: Partial<Row>; update: Partial<Row> }) => {
                const row = rows.find((r) => r.versionId === where.versionId);
                if (row) { Object.assign(row, update); return row; }
                const made = Object.assign(blank(where.versionId), create);
                rows.push(made);
                return made;
            },
            updateMany: async ({ where, data }: { where: { versionId: number }; data: Partial<Row> }) => {
                const hit = rows.filter((r) => match(r, where));
                hit.forEach((r) => Object.assign(r, data));
                return { count: hit.length };
            },
            deleteMany: async ({ where }: { where: { versionId: number | { in: number[] } } }) => {
                const hit = rows.filter((r) => match(r, where));
                hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
                return { count: hit.length };
            },
        },
    };
    return { prisma: prisma as unknown as PrismaClient, rows };
}

const MB = 1024 ** 2;
const small = () => ({ glb: Buffer.from('glb'), usdz: Buffer.from('usdz'), skipped: 2 });
const big = (n: number) => ({ glb: Buffer.alloc(n), usdz: Buffer.from('u'), skipped: 0 });

interface FakeOpts {
    onOpen?: (info: { versionId: number; jobId: string; maxTexture: number }) => Promise<unknown> | unknown;
    available?: boolean;
    pageErrors?: string[];
    /** Resolves when the fake browser "exits"; never by default. */
    exited?: Promise<void>;
}
function makeBrowser(opts: FakeOpts) {
    const urls: string[] = [];
    const state = { closed: 0 };
    const browser: HeadlessBrowser = {
        available: async () => opts.available ?? true,
        launch: async (): Promise<BrowserSession> => ({
            open: async (url: string) => {
                urls.push(url);
                const u = new URL(url);
                const versionId = Number(u.pathname.split('/').pop());
                const token = new URLSearchParams(u.hash.slice(1)).get('token')!;
                const jobId = verifyArJobToken(token, versionId)!.jobId;
                await opts.onOpen?.({ versionId, jobId, maxTexture: Number(u.searchParams.get('maxTexture')) });
            },
            pageErrors: () => opts.pageErrors ?? [],
            exited: () => opts.exited ?? new Promise<void>(() => undefined),
            close: async () => { state.closed++; },
        }),
    };
    return { browser, urls, state };
}

let tmp: string;
const statuses: Array<[number, number]> = [];
function setup(versions: Ver[], rows: Row[], opts: FakeOpts, timeoutMs = 5000) {
    const fake = makeFakePrisma(versions, rows);
    const b = makeBrowser(opts);
    configureArExportJobs({
        prisma: fake.prisma, browser: b.browser, baseUrl: () => 'http://localhost:3000',
        onStatus: (e, v) => statuses.push([e, v]), timeoutMs,
    });
    return { ...fake, ...b };
}

beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-jobs-'));
    setArDirForTests(tmp);
    statuses.length = 0;
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const pub = (id: number, exhibition_id = 1, is_published = true): Ver => ({ id, exhibition_id, is_published });

describe('arExportJobs', () => {
    it('stores files and marks done', async () => {
        let returned = '';
        const ctx = setup([pub(5)], [], {
            onOpen: async ({ versionId, jobId }) => { returned = await receiveArFiles(versionId, jobId, small()); },
        });
        await enqueueArExport(5);
        await arExportIdle();
        expect(returned).toBe('stored');
        const row = ctx.rows[0];
        expect(row).toMatchObject({ status: 'done', glb_size: 3, usdz_size: 4, skipped: 2, error: null });
        expect(row.finished_at).toBeInstanceOf(Date);
        expect(fs.readdirSync(tmp).sort()).toEqual([row.glb_file, row.usdz_file].sort());
        expect(ctx.urls[0]).toMatch(/^http:\/\/localhost:3000\/ar-export\/5\?maxTexture=2048#token=/);
        expect(ctx.state.closed).toBe(1);
        expect(statuses).toContainEqual([1, 5]);
    });

    it('deletes the previous files when a new export is stored', async () => {
        fs.writeFileSync(path.join(tmp, '5-old.glb'), 'x');
        fs.writeFileSync(path.join(tmp, '5-old.usdz'), 'x');
        const old: Row = {
            versionId: 5, status: 'done', glb_file: '5-old.glb', usdz_file: '5-old.usdz', glb_size: 1, usdz_size: 1,
            skipped: 0, error: null, started_at: null, finished_at: null,
        };
        setup([pub(5)], [old], { onOpen: ({ versionId, jobId }) => receiveArFiles(versionId, jobId, small()) });
        await enqueueArExport(5);
        await arExportIdle();
        expect(fs.existsSync(path.join(tmp, '5-old.glb'))).toBe(false);
        expect(fs.readdirSync(tmp)).toHaveLength(2);
    });

    it('reruns at 1024 when over 80 MB', async () => {
        const ctx = setup([pub(5)], [], {
            onOpen: ({ versionId, jobId, maxTexture }) =>
                receiveArFiles(versionId, jobId, maxTexture === 2048 ? big(AR_SIZE_RERUN + 1) : small()),
        });
        await enqueueArExport(5);
        await arExportIdle();
        expect(ctx.urls).toHaveLength(2);
        expect(ctx.urls[1]).toContain('maxTexture=1024');
        expect(ctx.rows[0]).toMatchObject({ status: 'done', glb_size: 3 });
        expect(ctx.state.closed).toBe(2);
    });

    it('fails when still over 150 MB', async () => {
        const ctx = setup([pub(5)], [], {
            onOpen: ({ versionId, jobId }) => receiveArFiles(versionId, jobId, big(AR_SIZE_LIMIT + 1)),
        });
        await enqueueArExport(5);
        await arExportIdle();
        expect(ctx.rows[0]).toMatchObject({ status: 'failed', error: 'Zu groß für AR' });
        expect(fs.readdirSync(tmp)).toHaveLength(0);
    });

    it('discards result when version no longer published', async () => {
        const versions = [pub(5)];
        let returned = '';
        const ctx = setup(versions, [], {
            onOpen: async ({ versionId, jobId }) => {
                versions[0].is_published = false;
                returned = await receiveArFiles(versionId, jobId, small());
            },
        });
        await enqueueArExport(5);
        await arExportIdle();
        expect(returned).toBe('discarded');
        expect(ctx.rows).toHaveLength(0);
        expect(fs.readdirSync(tmp)).toHaveLength(0);
        expect(ctx.state.closed).toBe(1);
    });

    it('times out', async () => {
        const ctx = setup([pub(5)], [], { onOpen: () => undefined }, 50);
        await enqueueArExport(5);
        await arExportIdle();
        expect(ctx.rows[0]).toMatchObject({ status: 'failed', error: 'Zeitüberschreitung beim Export' });
        expect(ctx.state.closed).toBe(1);
    });

    it('times out when open() never resolves', async () => {
        const ctx = setup([pub(5)], [], { onOpen: () => new Promise(() => undefined) }, 50);
        await enqueueArExport(5);
        await arExportIdle();
        expect(ctx.rows[0]).toMatchObject({ status: 'failed', error: 'Zeitüberschreitung beim Export' });
        expect(ctx.state.closed).toBe(1);
    });

    it('fails fast with the first page error', async () => {
        jest.useFakeTimers();
        try {
            const ctx = setup([pub(5)], [], { onOpen: () => undefined, pageErrors: ['quiet', '[ar-export] boom', '[ar-export] later'] }, 60_000);
            await enqueueArExport(5);
            await jest.advanceTimersByTimeAsync(1500);
            await arExportIdle();
            expect(ctx.rows[0]).toMatchObject({ status: 'failed', error: '[ar-export] boom' });
            expect(ctx.state.closed).toBe(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it('fails with a crash message when Chromium exits during the export', async () => {
        const ctx = setup([pub(5)], [], { onOpen: () => new Promise(() => undefined), exited: Promise.resolve() }, 60_000);
        await enqueueArExport(5);
        await arExportIdle();
        expect(ctx.rows[0]).toMatchObject({ status: 'failed', error: 'Chromium ist abgestürzt' });
        expect(ctx.state.closed).toBe(1);
    });

    it('onVersionPublished aborts the running job of the version it replaces', async () => {
        const opened: number[] = [];
        const ctx = setup([pub(4), pub(5)], [], {
            onOpen: async ({ versionId, jobId }) => {
                opened.push(versionId);
                if (versionId === 5) await receiveArFiles(versionId, jobId, small()); // 4 never delivers
            },
        }, 60_000);
        await enqueueArExport(4);
        for (let i = 0; i < 50 && opened.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
        expect(opened).toEqual([4]);
        await onVersionPublished(1, 5);
        await arExportIdle();
        expect(opened).toEqual([4, 5]);
        expect(ctx.rows.map((r) => r.versionId)).toEqual([5]);
        expect(ctx.rows[0].status).toBe('done');
        expect(ctx.state.closed).toBe(2);
    });

    it('chromium missing', async () => {
        const ctx = setup([pub(5)], [], { available: false });
        await enqueueArExport(5);
        await arExportIdle();
        expect(ctx.rows[0]).toMatchObject({ status: 'failed', error: 'Chromium nicht installiert' });
        expect(ctx.urls).toHaveLength(0);
    });

    it("onVersionPublished deletes other versions' files", async () => {
        fs.writeFileSync(path.join(tmp, '4-a.glb'), 'x');
        fs.writeFileSync(path.join(tmp, '4-a.usdz'), 'x');
        const mk = (versionId: number, glb: string | null, usdz: string | null): Row => ({
            versionId, status: 'done', glb_file: glb, usdz_file: usdz, glb_size: 1, usdz_size: 1,
            skipped: 0, error: null, started_at: null, finished_at: null,
        });
        const rows = [mk(4, '4-a.glb', '4-a.usdz'), mk(9, null, null)];
        const ctx = setup([pub(4, 1, false), pub(5), pub(9, 2)], rows, {
            onOpen: ({ versionId, jobId }) => receiveArFiles(versionId, jobId, small()),
        });
        await onVersionPublished(1, 5);
        await arExportIdle();
        expect(ctx.rows.map((r) => r.versionId).sort()).toEqual([5, 9]);
        expect(fs.existsSync(path.join(tmp, '4-a.glb'))).toBe(false);
        expect(ctx.rows.find((r) => r.versionId === 5)?.status).toBe('done');
    });

    it('onVersionDeleted removes files', async () => {
        fs.writeFileSync(path.join(tmp, '4-a.glb'), 'x');
        const row: Row = {
            versionId: 4, status: 'done', glb_file: '4-a.glb', usdz_file: null, glb_size: 1, usdz_size: null,
            skipped: 0, error: null, started_at: null, finished_at: null,
        };
        setup([], [row], {});
        await onVersionDeleted(4);
        expect(fs.readdirSync(tmp)).toHaveLength(0);
    });

    it('resumeArExports enqueues published versions without done export and requeues running', async () => {
        fs.writeFileSync(path.join(tmp, 'orphan.glb'), 'x');
        fs.writeFileSync(path.join(tmp, '1-keep.glb'), 'x');
        const mk = (versionId: number, status: string, glb: string | null = null): Row => ({
            versionId, status, glb_file: glb, usdz_file: null, glb_size: null, usdz_size: null,
            skipped: 0, error: null, started_at: null, finished_at: null,
        });
        const rows = [mk(1, 'done', '1-keep.glb'), mk(2, 'running')];
        const opened: number[] = [];
        const ctx = setup([pub(1), pub(2), pub(3), pub(4, 1, false)], rows, {
            onOpen: ({ versionId, jobId }) => { opened.push(versionId); return receiveArFiles(versionId, jobId, small()); },
        });
        await resumeArExports();
        await arExportIdle();
        expect(opened.sort()).toEqual([2, 3]);
        expect(fs.existsSync(path.join(tmp, 'orphan.glb'))).toBe(false);
        expect(fs.existsSync(path.join(tmp, '1-keep.glb'))).toBe(true);
        expect(ctx.rows.filter((r) => r.status === 'done')).toHaveLength(3);
    });

    it('stale jobId is refused', async () => {
        let during = '';
        const ctx = setup([pub(5)], [], {
            onOpen: async ({ versionId, jobId }) => {
                during = await receiveArFiles(versionId, 'not-the-job', small());
                await receiveArFiles(versionId, jobId, small());
            },
        });
        expect(await receiveArFiles(5, 'x', small())).toBe('stale');
        await enqueueArExport(5);
        await arExportIdle();
        expect(during).toBe('stale');
        expect(ctx.rows[0].status).toBe('done');
        expect(await receiveArFiles(5, 'x', small())).toBe('stale');
    });

    it('reports the queue position of waiting jobs', async () => {
        let release: () => void = () => undefined;
        const gate = new Promise<void>((r) => { release = r; });
        setup([pub(1), pub(2), pub(3)], [], {
            onOpen: async ({ versionId, jobId }) => { await gate; await receiveArFiles(versionId, jobId, small()); },
        });
        await enqueueArExport(1);
        await enqueueArExport(2);
        await enqueueArExport(3);
        expect(arExportQueuePosition(1)).toBeNull();
        expect(arExportQueuePosition(2)).toBe(1);
        expect(arExportQueuePosition(3)).toBe(2);
        release();
        await arExportIdle();
        expect(arExportQueuePosition(3)).toBeNull();
    });

    it('page errors without the marker do not fail the job; marked ones do', async () => {
        const ok = setup([pub(5)], [], {
            pageErrors: ['texture failed to load'],
            onOpen: async ({ versionId, jobId }) => {
                await new Promise((r) => setTimeout(r, 1200));
                await receiveArFiles(versionId, jobId, small());
            },
        });
        await enqueueArExport(5);
        await arExportIdle();
        expect(ok.rows[0].status).toBe('done');

        const bad = setup([pub(6)], [], {
            pageErrors: ['noise', '[ar-export] Error: scene broke'],
            onOpen: () => new Promise(() => undefined),
        });
        await enqueueArExport(6);
        await arExportIdle();
        expect(bad.rows[0]).toMatchObject({ status: 'failed', error: '[ar-export] Error: scene broke' });
    });

    it('a second upload with the right jobId is stale', async () => {
        let second = '';
        setup([pub(5)], [], {
            onOpen: async ({ versionId, jobId }) => {
                await receiveArFiles(versionId, jobId, small());
                second = await receiveArFiles(versionId, jobId, small());
            },
        });
        await enqueueArExport(5);
        await arExportIdle();
        expect(second).toBe('stale');
    });

    it('republish A -> B -> A while A runs ends with A done', async () => {
        const versions = [pub(1), pub(2)];
        let first = true;
        const ctx = setup(versions, [], {
            onOpen: async ({ versionId, jobId }) => {
                if (versionId === 1 && first) {
                    first = false;
                    await onVersionPublished(1, 2);
                    await onVersionPublished(1, 1);
                }
                await receiveArFiles(versionId, jobId, small());
            },
        });
        await enqueueArExport(1);
        await arExportIdle();
        expect(ctx.rows.map((r) => [r.versionId, r.status])).toEqual([[1, 'done']]);
        expect(fs.readdirSync(tmp)).toHaveLength(2);
    });

    it('a failing published lookup fails the job instead of hanging', async () => {
        const ctx = setup([pub(5)], [], {
            onOpen: async ({ versionId, jobId }) => {
                const original = ctx.prisma.exhibitionVersion.findUnique;
                ctx.prisma.exhibitionVersion.findUnique = (async () => { throw new Error('db down'); }) as never;
                try {
                    await expect(receiveArFiles(versionId, jobId, small())).rejects.toThrow('db down');
                } finally {
                    ctx.prisma.exhibitionVersion.findUnique = original;
                }
            },
        }, 60_000);
        await enqueueArExport(5);
        await arExportIdle();
        expect(ctx.rows[0]).toMatchObject({ status: 'failed', error: 'db down' });
    });

    it('an upload that arrives after the timeout is stale and the job failed', async () => {
        let returned = '';
        const ctx = setup([pub(5)], [], {
            onOpen: async ({ versionId, jobId }) => {
                const original = ctx.prisma.exhibitionVersion.findUnique;
                ctx.prisma.exhibitionVersion.findUnique = (async (args: never) => {
                    await new Promise((r) => setTimeout(r, 150));
                    return (original as (a: never) => Promise<unknown>)(args);
                }) as never;
                returned = await receiveArFiles(versionId, jobId, small());
            },
        }, 50);
        await enqueueArExport(5);
        await arExportIdle();
        await new Promise((r) => setTimeout(r, 250));
        expect(returned).toBe('stale');
        expect(ctx.rows[0]).toMatchObject({ status: 'failed', error: 'Zeitüberschreitung beim Export' });
    });

    it('a throwing delete while discarding fails the job instead of hanging', async () => {
        const versions = [pub(5)];
        const ctx = setup(versions, [], {
            onOpen: async ({ versionId, jobId }) => {
                versions[0].is_published = false;
                const original = ctx.prisma.arExport.deleteMany;
                ctx.prisma.arExport.deleteMany = (async () => { throw new Error('delete failed'); }) as never;
                try {
                    await expect(receiveArFiles(versionId, jobId, small())).rejects.toThrow('delete failed');
                } finally {
                    ctx.prisma.arExport.deleteMany = original;
                }
            },
        }, 60_000);
        await enqueueArExport(5);
        await arExportIdle();
        expect(ctx.rows[0]).toMatchObject({ status: 'failed', error: 'delete failed' });
    });

    it('republishing the running version notifies the editors', async () => {
        let first = true;
        const ctx = setup([pub(1), pub(2)], [], {
            onOpen: async ({ versionId, jobId }) => {
                if (first) {
                    first = false; // the abort restarts the job, which must not republish again
                    await onVersionPublished(1, 2);
                    const before = statuses.length;
                    await onVersionPublished(1, 1);
                    expect(statuses.length).toBeGreaterThan(before);
                }
                await receiveArFiles(versionId, jobId, small());
            },
        });
        await enqueueArExport(1);
        await arExportIdle();
        expect(ctx.rows[0].status).toBe('done');
    });

    it('failArJob ends the running job with the given message, only for its own token', async () => {
        let results: boolean[] = [];
        const ctx = setup([pub(5)], [], {
            onOpen: async ({ versionId, jobId }) => {
                results = [failArJob(versionId, 'other-job', 'x'), failArJob(6, jobId, 'x'), failArJob(versionId, jobId, 'Zu groß für AR')];
                // a second delivery for the same job is stale
                results.push(await receiveArFiles(versionId, jobId, small()) === 'stale');
            },
        }, 60_000);
        await enqueueArExport(5);
        await arExportIdle();
        expect(results).toEqual([false, false, true, true]);
        expect(ctx.rows[0]).toMatchObject({ status: 'failed', error: 'Zu groß für AR' });
    });
});
