/**
 * Backfill for Gaussian splat assets uploaded before the SPZ pipeline: converts `.ply`, `.sog` and
 * `.splat` captures to `.spz` (a tenth of the bytes, same look) and renders the asset-browser
 * thumbnail that only new uploads get automatically.
 *
 * DO NOT RUN THIS AUTOMATICALLY. Run manually, inside the app container:
 *   node dist/scripts/backfill-splats.js --dry-run   (default — no writes)
 *   node dist/scripts/backfill-splats.js --apply
 *   node dist/scripts/backfill-splats.js --apply --limit 5
 *
 * Idempotent: an asset that is already `.spz` with a thumbnail is skipped, and a run that stops
 * half way just picks up the rest next time. The source file is only deleted after the asset row
 * points at the converted one.
 */
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { CONVERTIBLE_SPLAT_FORMATS, convertSplatToSpz, type SplatFormat } from '../lib/splats';
import { readSplatFile } from '../lib/splatReaders';
import { trySplatThumbnails } from '../lib/splatThumbnail';

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
    if (!abs.startsWith(uploadDir)) return null; // path traversal
    return abs;
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
    const { dryRun, limit } = parseArgs(process.argv.slice(2));
    console.log(`[Backfill] Mode: ${dryRun ? 'DRY RUN (no writes)' : 'APPLY'}${limit ? `, limit=${limit}` : ''}`);

    const assets = await prisma.asset.findMany({
        where: { type: 'splat' },
        orderBy: { id: 'asc' },
        ...(limit ? { take: limit } : {}),
    });
    console.log(`[Backfill] Found ${assets.length} splat asset(s).`);

    let converted = 0;
    let thumbnailed = 0;
    let skipped = 0;
    let failed = 0;
    let bytesBefore = 0;
    let bytesAfter = 0;

    for (const asset of assets) {
        const absPath = resolveUploadPath(asset.path);
        if (!absPath || !fs.existsSync(absPath)) {
            console.warn(`[Backfill] Asset ${asset.id}: file missing, skipping: ${asset.path}`);
            skipped++;
            continue;
        }

        const format = path.extname(absPath).toLowerCase().slice(1) as SplatFormat;
        const needsConversion = format !== 'spz' && CONVERTIBLE_SPLAT_FORMATS.includes(format);
        const needsThumbnail = !asset.thumbnailPath;
        if (!needsConversion && !needsThumbnail) {
            skipped++;
            continue;
        }
        if (!needsConversion && !CONVERTIBLE_SPLAT_FORMATS.includes(format)) {
            // .ksplat has no reader, so there is nothing to render a thumbnail from either.
            console.warn(`[Backfill] Asset ${asset.id}: ${format} wird nicht unterstützt, skipping.`);
            skipped++;
            continue;
        }

        if (dryRun) {
            console.log(
                `[Backfill] Would ${needsConversion ? `convert ${format} → spz` : 'keep spz'}`
                + `${needsThumbnail ? ' and render a thumbnail' : ''} for asset ${asset.id} (${asset.path})`,
            );
            converted += needsConversion ? 1 : 0;
            thumbnailed += needsThumbnail ? 1 : 0;
            continue;
        }

        try {
            const originalSize = fs.statSync(absPath).size;
            if (needsConversion) {
                const result = await convertSplatToSpz(absPath, format);
                const thumbnailPath = needsThumbnail ? await trySplatThumbnails(result.splats, result.path) : undefined;
                const metadata = (asset.metadata ?? {}) as Record<string, unknown>;
                await prisma.asset.update({
                    where: { id: asset.id },
                    data: {
                        path: `/uploads/${result.filename}`,
                        filename: path.basename(asset.filename, path.extname(asset.filename)) + '.spz',
                        size: result.size,
                        ...(thumbnailPath ? { thumbnailPath } : {}),
                        metadata: {
                            ...metadata,
                            splatFormat: 'spz',
                            splatCount: result.splats.count,
                            originalFormat: format,
                            originalSize,
                        },
                    },
                });
                fs.rmSync(absPath, { force: true });
                converted++;
                if (thumbnailPath) thumbnailed++;
                bytesBefore += originalSize;
                bytesAfter += result.size;
                console.log(`[Backfill] Asset ${asset.id}: ${format} → spz, ${megabytes(originalSize)} → ${megabytes(result.size)}`);
            } else {
                const thumbnailPath = await trySplatThumbnails(await readSplatFile(absPath, '.spz'), absPath);
                if (!thumbnailPath) {
                    failed++;
                    continue;
                }
                await prisma.asset.update({ where: { id: asset.id }, data: { thumbnailPath } });
                thumbnailed++;
                console.log(`[Backfill] Asset ${asset.id}: thumbnailPath set to ${thumbnailPath}`);
            }
        } catch (err) {
            console.warn(`[Backfill] Asset ${asset.id} failed:`, (err as Error).message);
            failed++;
        }
    }

    console.log('[Backfill] Summary:');
    console.log(`  Total splat assets: ${assets.length}`);
    console.log(`  ${dryRun ? 'Would convert' : 'Converted'}: ${converted}`);
    console.log(`  ${dryRun ? 'Would render' : 'Rendered'} thumbnails: ${thumbnailed}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Failed: ${failed}`);
    if (!dryRun && bytesBefore > 0) {
        console.log(`  Size: ${megabytes(bytesBefore)} → ${megabytes(bytesAfter)}`);
    }
    if (dryRun) console.log('[Backfill] Dry run only — re-run with --apply to write changes.');
}

main()
    .catch((err) => {
        console.error('[Backfill] Fatal error:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
