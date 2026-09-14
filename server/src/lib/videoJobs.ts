import path from 'path';
import fs from 'fs';
import { PrismaClient, type Prisma } from '@prisma/client';
import { extractThumbnail, makeWebVideo, probeVideo } from './video';

/**
 * VID-03: video transcoding runs in the background instead of inside the upload request.
 * Cloudflare aborts origin requests after 100 s (HTTP 524), long videos took longer.
 *
 * The upload handler stores the original, creates the Asset with status "processing"
 * (metadata.sourceFile = stored original) and enqueues it here. Jobs run one at a time by
 * default (ffmpeg is CPU-heavy and the server is shared). On startup, assets still marked
 * "processing" are queued again — the original stays on disk until its job finished.
 *
 * In-process queue: correct for the single-container deployment (same limitation as
 * idempotency.ts). Multiple server instances would need a shared queue.
 */

const prisma = new PrismaClient();
const uploadDir = path.join(__dirname, '../../uploads');
const CONCURRENCY = Math.max(1, parseInt(process.env.VIDEO_JOB_CONCURRENCY || '', 10) || 1);

const queue: number[] = [];
const queued = new Set<number>();
let running = 0;

export function enqueueVideoJob(assetId: number) {
    if (queued.has(assetId)) return;
    queued.add(assetId);
    queue.push(assetId);
    pump();
}

/** Re-queues assets left in "processing" by a restart. Call once after the server started. */
export async function resumeVideoJobs() {
    const pending = await prisma.asset.findMany({
        where: { type: 'video', status: 'processing' },
        select: { id: true },
        orderBy: { id: 'asc' },
    });
    if (pending.length > 0) console.log(`[VideoJobs] Resuming ${pending.length} video job(s)`);
    pending.forEach((a) => enqueueVideoJob(a.id));
}

function pump() {
    while (running < CONCURRENCY && queue.length > 0) {
        const assetId = queue.shift()!;
        running++;
        runJob(assetId)
            .catch((err) => console.error(`[VideoJobs] Job for asset ${assetId} crashed:`, err))
            .finally(() => {
                running--;
                queued.delete(assetId);
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

async function markFailed(assetId: number, metadata: Record<string, Prisma.JsonValue>, reason: string) {
    const { sourceFile: _sourceFile, ...rest } = metadata;
    await prisma.asset.updateMany({
        where: { id: assetId, status: 'processing' },
        data: { status: 'failed', metadata: { ...rest, processingError: reason } },
    });
}

async function runJob(assetId: number) {
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
        probe = await probeVideo(sourcePath).catch((err) => {
            console.warn(`[VideoJobs] Asset ${assetId}: ffprobe failed, transcoding without metadata:`, err);
            return null;
        });
        // VID-02: pass through only H.264/yuv420p ≤ 1080p (+AAC), transcode everything else.
        const mode = await makeWebVideo(sourcePath, outputPath, probe);
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
        await extractThumbnail(mp4Path, thumbPath);
    } catch (err) {
        console.warn(`[VideoJobs] Asset ${assetId}: thumbnail extraction failed, continuing without:`, err);
    }

    const hasThumbnail = fs.existsSync(thumbPath);
    const { sourceFile: _sourceFile, processingError: _processingError, ...rest } = metadata;
    const updated = await prisma.asset.updateMany({
        where: { id: assetId, status: 'processing' },
        data: {
            status: 'ready',
            size: fs.statSync(mp4Path).size,
            width: probe?.width ?? 0,
            height: probe?.height ?? 0,
            duration: Math.round((probe?.duration ?? 0) * 10) / 10,
            thumbnailPath: hasThumbnail ? `/uploads/${thumbFilename}` : null,
            metadata: rest,
        },
    });

    if (updated.count === 0) {
        // Asset was deleted while processing — nothing references the outputs.
        fs.rmSync(mp4Path, { force: true });
        fs.rmSync(thumbPath, { force: true });
    }
}
