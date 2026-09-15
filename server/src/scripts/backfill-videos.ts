/**
 * VID-02 backfill: re-encode existing video assets that browsers can't play reliably
 * (HEVC, VP9, 10-bit, > 1080p, non-AAC audio) to H.264/AAC MP4 ≤ 1080p.
 *
 * DO NOT RUN THIS AUTOMATICALLY. CPU-heavy (minutes per long video). Run manually, inside
 * the app container:
 *   node dist/scripts/backfill-videos.js --dry-run   (default — probes only, no writes)
 *   node dist/scripts/backfill-videos.js --apply
 *   node dist/scripts/backfill-videos.js --apply --limit 1
 *
 * Writes `<stem>-h264.mp4` next to the original and updates Asset.path/size/mimetype.
 * Width/height keep the original dimensions (the scene derives the physical size from them).
 * Originals are NOT deleted — remove them manually once the new files are checked.
 * Idempotent: compatible assets (including already converted ones) are skipped.
 */
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { isWebCompatible, probeVideo, transcodeForWeb } from '../lib/video';

const prisma = new PrismaClient();

// Same uploads dir resolution as upload.ts (server/uploads relative to compiled dist/scripts).
const uploadDir = path.join(__dirname, '../../uploads');

function parseArgs(argv: string[]) {
    const apply = argv.includes('--apply');
    const dryRun = !apply || argv.includes('--dry-run');
    const limitArg = argv.find((a) => a.startsWith('--limit'));
    let limit: number | undefined;
    if (limitArg) {
        const eqIdx = limitArg.indexOf('=');
        const raw = eqIdx >= 0 ? limitArg.slice(eqIdx + 1) : argv[argv.indexOf(limitArg) + 1];
        const parsed = parseInt(raw ?? '', 10);
        if (Number.isFinite(parsed) && parsed > 0) limit = parsed;
    }
    return { dryRun, limit };
}

/** Resolve an asset's public `/uploads/...` path to an absolute filesystem path. */
function resolveUploadPath(publicPath: string): string | null {
    const prefix = '/uploads/';
    if (!publicPath.startsWith(prefix)) return null;
    const abs = path.join(uploadDir, publicPath.slice(prefix.length));
    // Guard against path traversal.
    if (!abs.startsWith(uploadDir)) return null;
    return abs;
}

async function main() {
    const { dryRun, limit } = parseArgs(process.argv.slice(2));
    console.log(`[VideoBackfill] Mode: ${dryRun ? 'DRY RUN (no writes)' : 'APPLY'}${limit ? `, limit=${limit}` : ''}`);

    const assets = await prisma.asset.findMany({ where: { type: 'video' }, orderBy: { id: 'asc' } });
    console.log(`[VideoBackfill] Found ${assets.length} video asset(s).`);

    let compatible = 0;
    let converted = 0;
    let skippedMissing = 0;
    let failed = 0;

    for (const asset of assets) {
        if (limit && converted >= limit) break;

        const absPath = resolveUploadPath(asset.path);
        if (!absPath || !fs.existsSync(absPath)) {
            console.warn(`[VideoBackfill] Asset ${asset.id}: source file missing, skipping: ${asset.path}`);
            skippedMissing++;
            continue;
        }

        let probe;
        try {
            probe = await probeVideo(absPath);
        } catch (err) {
            console.warn(`[VideoBackfill] Asset ${asset.id}: ffprobe failed, skipping:`, (err as Error).message);
            failed++;
            continue;
        }

        const description = `${probe.videoCodec}/${probe.pixelFormat} ${probe.width}×${probe.height}, audio ${probe.audioCodec ?? '–'}`;
        if (isWebCompatible(probe)) {
            console.log(`[VideoBackfill] Asset ${asset.id}: compatible (${description})`);
            compatible++;
            continue;
        }

        if (dryRun) {
            console.log(`[VideoBackfill] Would transcode asset ${asset.id} (${asset.path}): ${description}`);
            converted++;
            continue;
        }

        const stem = path.basename(absPath, path.extname(absPath));
        const outputPath = path.join(path.dirname(absPath), `${stem}-h264.mp4`);
        const started = Date.now();
        console.log(`[VideoBackfill] Asset ${asset.id}: transcoding ${description} …`);
        try {
            await transcodeForWeb(absPath, outputPath);
        } catch (err) {
            fs.rmSync(outputPath, { force: true });
            console.warn(`[VideoBackfill] Asset ${asset.id}: transcoding failed:`, (err as Error).message);
            failed++;
            continue;
        }

        const stats = fs.statSync(outputPath);
        const publicPath = `/uploads/${path.relative(uploadDir, outputPath).split(path.sep).join('/')}`;
        await prisma.asset.update({
            where: { id: asset.id },
            data: { path: publicPath, size: stats.size, mimetype: 'video/mp4' },
        });
        converted++;
        console.log(`[VideoBackfill] Asset ${asset.id}: ${publicPath} (${(stats.size / 1e6).toFixed(1)} MB, ${Math.round((Date.now() - started) / 1000)} s). Original kept: ${asset.path}`);
    }

    console.log('[VideoBackfill] Summary:');
    console.log(`  Total videos: ${assets.length}`);
    console.log(`  Already compatible: ${compatible}`);
    console.log(`  ${dryRun ? 'Would transcode' : 'Transcoded'}: ${converted}`);
    console.log(`  Skipped (missing file): ${skippedMissing}`);
    console.log(`  Failed: ${failed}`);
    if (dryRun) console.log('[VideoBackfill] Dry run only — re-run with --apply to write changes.');
}

main()
    .catch((err) => {
        console.error('[VideoBackfill] Fatal error:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
