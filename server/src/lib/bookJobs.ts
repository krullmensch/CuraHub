import path from 'path';
import { PrismaClient, type Prisma } from '@prisma/client';
import {
    BookProcessingError, bookStem, booksDir, processBookPdf, readBookMetadata,
    type BookAssetMetadata, type BookJobPhase,
} from './bookPdf';
import { artworkTitleFromFilename } from './artworkTitle';

/**
 * Books are processed in the background like videos (VID-03): the upload stores the PDF in
 * `<uploads>/.books/`, creates the asset with status "processing" and enqueues it here. One job
 * at a time; assets still "processing" after a restart are queued again.
 */

const prisma = new PrismaClient();
const uploadDir = path.join(__dirname, '../../uploads');

export interface BookJobProgress {
    phase: BookJobPhase;
    percent: null;
    phaseStartedAt: number;
    phaseElapsedMs: number;
    source: null;
    queuePosition: number | null;
    proxyHeight: null;
}

const queue: number[] = [];
const progress = new Map<number, { phase: BookJobPhase; phaseStartedAt: number }>();
let running = false;

const setPhase = (assetId: number, phase: BookJobPhase) => progress.set(assetId, { phase, phaseStartedAt: Date.now() });

export function getBookJobProgress(assetId: number): BookJobProgress | null {
    const current = progress.get(assetId);
    if (!current) return null;
    const index = queue.indexOf(assetId);
    return {
        ...current,
        percent: null,
        source: null,
        proxyHeight: null,
        phaseElapsedMs: Date.now() - current.phaseStartedAt,
        queuePosition: index >= 0 ? index + 1 : null,
    };
}

export function enqueueBookJob(assetId: number) {
    if (queue.includes(assetId) || progress.has(assetId)) return;
    queue.push(assetId);
    setPhase(assetId, 'queued');
    pump();
}

export async function resumeBookJobs() {
    const pending = await prisma.asset.findMany({
        where: { type: 'book', status: 'processing' },
        select: { id: true },
        orderBy: { id: 'asc' },
    });
    if (pending.length > 0) console.log(`[BookJobs] Resuming ${pending.length} book job(s)`);
    pending.forEach((a) => enqueueBookJob(a.id));
}

function pump() {
    if (running || queue.length === 0) return;
    const assetId = queue.shift()!;
    running = true;
    runBookJob(assetId)
        .catch((err) => console.error(`[BookJobs] Job for asset ${assetId} crashed:`, err))
        .finally(() => {
            running = false;
            progress.delete(assetId);
            pump();
        });
}

async function markFailed(assetId: number, meta: BookAssetMetadata | Record<string, never>, reason: string) {
    await prisma.asset.updateMany({
        where: { id: assetId, status: 'processing' },
        data: { status: 'failed', metadata: { ...meta, processingError: reason } as Prisma.InputJsonValue },
    });
}

async function runBookJob(assetId: number) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status !== 'processing') return;
    const meta = readBookMetadata(asset.metadata);
    if (!meta) return markFailed(assetId, {}, 'Buchdaten fehlen');

    setPhase(assetId, 'analyzing');
    const pdfPath = path.join(booksDir(uploadDir), path.basename(meta.pdfFile));
    try {
        const result = await processBookPdf(pdfPath, uploadDir, bookStem(meta.pdfFile), meta.coverVersion, undefined,
            (phase) => setPhase(assetId, phase));
        const updated = await prisma.asset.updateMany({
            where: { id: assetId, status: 'processing' },
            data: {
                status: 'ready',
                path: result.cover.path,
                thumbnailPath: result.cover.thumbnailPath,
                width: result.cover.width,
                height: result.cover.height,
                metadata: {
                    ...meta,
                    pageCount: result.pageCount,
                    pageWidthMm: result.pageWidthMm,
                    pageHeightMm: result.pageHeightMm,
                } as Prisma.InputJsonValue,
            },
        });
        if (updated.count === 0) return; // deleted meanwhile
        const widthCm = Math.round(result.pageWidthMm) / 10;
        const heightCm = Math.round(result.pageHeightMm) / 10;
        await prisma.artwork.upsert({
            where: { assetId },
            create: { assetId, title: artworkTitleFromFilename(asset.filename), width: widthCm, height: heightCm },
            update: { width: widthCm, height: heightCm },
        });
        console.log(`[BookJobs] Asset ${assetId}: ${result.pageCount} pages, ${result.pageWidthMm} × ${result.pageHeightMm} mm`);
    } catch (err) {
        const reason = err instanceof BookProcessingError ? err.message : 'PDF konnte nicht verarbeitet werden';
        console.warn(`[BookJobs] Asset ${assetId} failed:`, (err as Error).message);
        await markFailed(assetId, meta, reason);
    }
}
