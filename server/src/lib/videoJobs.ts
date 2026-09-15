import path from 'path';
import fs from 'fs';
import { PrismaClient, type Prisma } from '@prisma/client';
import { createVideoProxy, extractThumbnail, makeWebVideo, probeVideo, proxyHeightsFor } from './video';

/**
 * VID-03: video transcoding runs in the background instead of inside the upload request.
 * Cloudflare aborts origin requests after 100 s (HTTP 524), long videos took longer.
 *
 * The upload handler stores the original, creates the Asset with status "processing"
 * (metadata.sourceFile = stored original) and enqueues it here. Jobs run one at a time by
 * default (ffmpeg is CPU-heavy and the server is shared). On startup, assets still marked
 * "processing" are queued again — the original stays on disk until its job finished.
 *
 * VID-04: once the web version exists the asset becomes "ready" (placeable) and a second job
 * creates smaller proxy versions (720p/480p short edge) for the low/medium render presets
 * (metadata.proxiesPending → metadata.videoProxies).
 *
 * In-process queue: correct for the single-container deployment (same limitation as
 * idempotency.ts). Multiple server instances would need a shared queue.
 */

const prisma = new PrismaClient();
const uploadDir = path.join(__dirname, '../../uploads');
const CONCURRENCY = Math.max(1, parseInt(process.env.VIDEO_JOB_CONCURRENCY || '', 10) || 1);

type JobKind = 'full' | 'proxies';
interface QueuedJob {
    assetId: number;
    kind: JobKind;
}

const queue: QueuedJob[] = [];
const queuedKeys = new Set<string>();
let running = 0;
const jobKey = (job: QueuedJob) => `${job.assetId}:${job.kind}`;

export type VideoJobPhase = 'queued' | 'analyzing' | 'remuxing' | 'transcoding' | 'thumbnail' | 'proxies';

export interface VideoJobProgress {
    phase: VideoJobPhase;
    /** 0–100 while an ffmpeg pass runs, otherwise null. */
    percent: number | null;
    /** ms timestamp when the current phase started. */
    phaseStartedAt: number;
    /** ms since the phase started, computed on the server (no client clock involved). */
    phaseElapsedMs: number;
    source: { codec: string | null; width: number; height: number; duration: number; sizeBytes: number } | null;
    /** 1-based position while waiting, null once running. */
    queuePosition: number | null;
    /** Short edge of the proxy currently encoded (phase "proxies"). */
    proxyHeight: number | null;
}

/** Live state for the UI (in memory — after a restart jobs report "queued" again). */
const progress = new Map<number, Omit<VideoJobProgress, 'queuePosition' | 'phaseElapsedMs'>>();

function setPhase(assetId: number, phase: VideoJobPhase, percent: number | null = null) {
    const current = progress.get(assetId);
    progress.set(assetId, { source: current?.source ?? null, phase, percent, phaseStartedAt: Date.now(), proxyHeight: null });
}

function patchProgress(assetId: number, patch: Partial<Omit<VideoJobProgress, 'queuePosition' | 'phaseElapsedMs'>>) {
    const current = progress.get(assetId);
    if (current) progress.set(assetId, { ...current, ...patch });
}

export function getVideoJobProgress(assetId: number): VideoJobProgress | null {
    const current = progress.get(assetId);
    if (!current) return null;
    const index = queue.findIndex((job) => job.assetId === assetId);
    return { ...current, phaseElapsedMs: Date.now() - current.phaseStartedAt, queuePosition: index >= 0 ? index + 1 : null };
}

function enqueue(job: QueuedJob) {
    const key = jobKey(job);
    if (queuedKeys.has(key)) return;
    queuedKeys.add(key);
    queue.push(job);
    setPhase(job.assetId, 'queued');
    pump();
}

export function enqueueVideoJob(assetId: number) {
    enqueue({ assetId, kind: 'full' });
}

/** Re-queues work interrupted by a restart. Call once after the server started. */
export async function resumeVideoJobs() {
    const processing = await prisma.asset.findMany({
        where: { type: 'video', status: 'processing' },
        select: { id: true },
        orderBy: { id: 'asc' },
    });
    const proxiesPending = await prisma.asset.findMany({
        where: { type: 'video', status: 'ready', metadata: { path: '$.proxiesPending', equals: true } },
        select: { id: true },
        orderBy: { id: 'asc' },
    });
    if (processing.length + proxiesPending.length > 0) {
        console.log(`[VideoJobs] Resuming ${processing.length} video job(s), ${proxiesPending.length} proxy job(s)`);
    }
    processing.forEach((a) => enqueue({ assetId: a.id, kind: 'full' }));
    proxiesPending.forEach((a) => enqueue({ assetId: a.id, kind: 'proxies' }));
}

function pump() {
    while (running < CONCURRENCY && queue.length > 0) {
        const job = queue.shift()!;
        running++;
        (job.kind === 'full' ? runFullJob(job.assetId) : runProxyJob(job.assetId))
            .catch((err) => console.error(`[VideoJobs] ${job.kind} job for asset ${job.assetId} crashed:`, err))
            .finally(() => {
                running--;
                queuedKeys.delete(jobKey(job));
                // A follow-up job (proxies) queued for the same asset keeps the progress entry.
                if (!queue.some((queuedJob) => queuedJob.assetId === job.assetId)) progress.delete(job.assetId);
                pump();
            });
    }
}

function metadataObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, Prisma.JsonValue] => entry[1] !== undefined),
    );
}

function withoutKeys(metadata: Record<string, Prisma.JsonValue>, keys: string[]) {
    const copy = { ...metadata };
    for (const key of keys) delete copy[key];
    return copy;
}

async function markFailed(assetId: number, metadata: Record<string, Prisma.JsonValue>, reason: string) {
    await prisma.asset.updateMany({
        where: { id: assetId, status: 'processing' },
        data: { status: 'failed', metadata: { ...withoutKeys(metadata, ['sourceFile']), processingError: reason } },
    });
}

async function runFullJob(assetId: number) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    // Deleted in the meantime, or already handled.
    if (!asset || asset.status !== 'processing') return;

    const metadata = metadataObject(asset.metadata);
    const sourceFile = typeof metadata.sourceFile === 'string' ? path.basename(metadata.sourceFile) : null;
    const sourcePath = sourceFile ? path.join(uploadDir, sourceFile) : null;
    if (!sourcePath || !fs.existsSync(sourcePath)) {
        console.warn(`[VideoJobs] Asset ${assetId}: source file missing`);
        await markFailed(assetId, metadata, 'source-missing');
        return;
    }

    const mp4Filename = path.basename(asset.path);
    const mp4Path = path.join(uploadDir, mp4Filename);
    // An uploaded .mp4 already sits at mp4Path — write the web version next to it first.
    const outputPath = sourcePath === mp4Path ? mp4Path.replace(/\.mp4$/, '.web.mp4') : mp4Path;
    const thumbFilename = mp4Filename.replace(/\.mp4$/, '-thumb.jpg');
    const thumbPath = path.join(uploadDir, thumbFilename);

    const started = Date.now();
    let probe: Awaited<ReturnType<typeof probeVideo>> | null = null;
    try {
        setPhase(assetId, 'analyzing');
        probe = await probeVideo(sourcePath).catch((err) => {
            console.warn(`[VideoJobs] Asset ${assetId}: ffprobe failed, transcoding without metadata:`, err);
            return null;
        });
        patchProgress(assetId, {
            source: {
                codec: probe?.videoCodec ?? null,
                width: probe?.width ?? 0,
                height: probe?.height ?? 0,
                duration: probe?.duration ?? 0,
                sizeBytes: fs.statSync(sourcePath).size,
            },
        });
        // VID-02: pass through only H.264/yuv420p ≤ 1080p (+AAC), transcode everything else.
        const mode = await makeWebVideo(sourcePath, outputPath, probe, {
            onStage: (stage) => setPhase(assetId, stage === 'remux' ? 'remuxing' : 'transcoding', 0),
            // ffmpeg can report a bogus low value at the very end — only ever move forward.
            onProgress: (percent) => patchProgress(assetId, { percent: Math.max(progress.get(assetId)?.percent ?? 0, Math.round(percent * 10) / 10) }),
        });
        fs.rmSync(sourcePath, { force: true });
        if (outputPath !== mp4Path) fs.renameSync(outputPath, mp4Path);
        console.log(`[VideoJobs] Asset ${assetId}: ${mode === 'remux' ? 'H.264 kept (remuxed)' : 'transcoded to H.264'} in ${Math.round((Date.now() - started) / 1000)} s`);
    } catch (err) {
        console.error(`[VideoJobs] Asset ${assetId}: processing failed:`, err);
        fs.rmSync(outputPath, { force: true });
        fs.rmSync(sourcePath, { force: true });
        await markFailed(assetId, metadata, 'transcode-failed');
        return;
    }

    try {
        setPhase(assetId, 'thumbnail');
        await extractThumbnail(mp4Path, thumbPath);
    } catch (err) {
        console.warn(`[VideoJobs] Asset ${assetId}: thumbnail extraction failed, continuing without:`, err);
    }

    const needsProxies = proxyHeightsFor(probe?.width ?? 0, probe?.height ?? 0).length > 0;
    const hasThumbnail = fs.existsSync(thumbPath);
    const updated = await prisma.asset.updateMany({
        where: { id: assetId, status: 'processing' },
        data: {
            status: 'ready',
            size: fs.statSync(mp4Path).size,
            width: probe?.width ?? 0,
            height: probe?.height ?? 0,
            duration: Math.round((probe?.duration ?? 0) * 10) / 10,
            thumbnailPath: hasThumbnail ? `/uploads/${thumbFilename}` : null,
            metadata: {
                ...withoutKeys(metadata, ['sourceFile', 'processingError']),
                ...(needsProxies ? { proxiesPending: true } : {}),
            },
        },
    });

    if (updated.count === 0) {
        // Asset was deleted while processing — nothing references the outputs.
        fs.rmSync(mp4Path, { force: true });
        fs.rmSync(thumbPath, { force: true });
        return;
    }
    if (needsProxies) enqueue({ assetId, kind: 'proxies' });
}

/** VID-04: smaller versions of a ready video. A failure leaves the full version in use. */
async function runProxyJob(assetId: number) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status !== 'ready' || metadataObject(asset.metadata).proxiesPending !== true) return;

    const mp4Path = path.join(uploadDir, path.basename(asset.path));
    const baseName = path.basename(asset.path).replace(/\.mp4$/, '');
    const probe = fs.existsSync(mp4Path) ? await probeVideo(mp4Path).catch(() => null) : null;
    const heights = probe ? proxyHeightsFor(probe.width, probe.height) : [];

    const created: Record<string, string> = {};
    let currentOutput: string | null = null;
    const started = Date.now();
    try {
        if (!probe) throw new Error('web version missing or unreadable');
        setPhase(assetId, 'proxies', 0);
        for (const [index, height] of heights.entries()) {
            const filename = `${baseName}-proxy-${height}.mp4`;
            currentOutput = path.join(uploadDir, filename);
            patchProgress(assetId, { proxyHeight: height });
            await createVideoProxy(mp4Path, currentOutput, height, (percent) => {
                patchProgress(assetId, { percent: Math.round(((index + percent / 100) / heights.length) * 1000) / 10 });
            }, probe.duration || undefined);
            created[String(height)] = `/uploads/${filename}`;
            currentOutput = null;
        }
        console.log(`[VideoJobs] Asset ${assetId}: proxies ${heights.join('/')}p in ${Math.round((Date.now() - started) / 1000)} s`);
    } catch (err) {
        console.error(`[VideoJobs] Asset ${assetId}: proxy creation failed:`, err);
        if (currentOutput) fs.rmSync(currentOutput, { force: true });
        Object.values(created).forEach((p) => fs.rmSync(path.join(uploadDir, path.basename(p)), { force: true }));
        await finishProxies(assetId, null, 'proxy-failed');
        return;
    }

    if (!(await finishProxies(assetId, created, null))) {
        // Deleted while the proxies were encoded.
        Object.values(created).forEach((p) => fs.rmSync(path.join(uploadDir, path.basename(p)), { force: true }));
    }
}

async function finishProxies(assetId: number, proxies: Record<string, string> | null, error: string | null): Promise<boolean> {
    const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { metadata: true } });
    if (!asset) return false;
    const metadata = withoutKeys(metadataObject(asset.metadata), ['proxiesPending', 'proxyError']);
    const updated = await prisma.asset.updateMany({
        where: { id: assetId },
        data: {
            metadata: {
                ...metadata,
                ...(proxies && Object.keys(proxies).length > 0 ? { videoProxies: proxies } : {}),
                ...(error ? { proxyError: error } : {}),
            },
        },
    });
    return updated.count > 0;
}
