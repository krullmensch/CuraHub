/**
 * LOAD-04 backfill: generate 256px/512px WebP thumbnails for existing image
 * assets that don't have one yet (`thumbnailPath = null`), and set
 * `Asset.thumbnailPath` to the 512 variant's public path.
 *
 * DO NOT RUN THIS AUTOMATICALLY. Run manually, inside the app container:
 *   node dist/scripts/backfill-thumbnails.js --dry-run   (default — no writes)
 *   node dist/scripts/backfill-thumbnails.js --apply
 *   node dist/scripts/backfill-thumbnails.js --apply --limit 50
 *
 * Idempotent: only touches assets with thumbnailPath = null, and re-running
 * after a partial --apply run just picks up where it left off. Missing
 * source files are skipped with a warning, not fatal.
 */
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { tryGenerateImageThumbnails } from '../lib/thumbnails';

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
    const rel = publicPath.slice(prefix.length);
    const abs = path.join(uploadDir, rel);
    // Guard against path traversal.
    if (!abs.startsWith(uploadDir)) return null;
    return abs;
}

async function main() {
    const { dryRun, limit } = parseArgs(process.argv.slice(2));

    console.log(`[Backfill] Mode: ${dryRun ? 'DRY RUN (no writes)' : 'APPLY'}${limit ? `, limit=${limit}` : ''}`);

    const assets = await prisma.asset.findMany({
        where: { type: 'image', thumbnailPath: null },
        orderBy: { id: 'asc' },
        ...(limit ? { take: limit } : {}),
    });

    console.log(`[Backfill] Found ${assets.length} image asset(s) without a thumbnail.`);

    let generated = 0;
    let skippedMissing = 0;
    let failed = 0;

    for (const asset of assets) {
        const absPath = resolveUploadPath(asset.path);
        if (!absPath) {
            console.warn(`[Backfill] Asset ${asset.id}: path outside uploads dir, skipping: ${asset.path}`);
            skippedMissing++;
            continue;
        }
        if (!fs.existsSync(absPath)) {
            console.warn(`[Backfill] Asset ${asset.id}: source file missing, skipping: ${absPath}`);
            skippedMissing++;
            continue;
        }

        if (dryRun) {
            console.log(`[Backfill] Would generate thumbnails for asset ${asset.id} (${asset.path})`);
            generated++;
            continue;
        }

        const thumbnailPath = await tryGenerateImageThumbnails(absPath);
        if (!thumbnailPath) {
            console.warn(`[Backfill] Asset ${asset.id}: thumbnail generation failed, skipping.`);
            failed++;
            continue;
        }

        await prisma.asset.update({
            where: { id: asset.id },
            data: { thumbnailPath },
        });
        generated++;
        console.log(`[Backfill] Asset ${asset.id}: thumbnailPath set to ${thumbnailPath}`);
    }

    console.log('[Backfill] Summary:');
    console.log(`  Total candidates: ${assets.length}`);
    console.log(`  ${dryRun ? 'Would generate' : 'Generated'}: ${generated}`);
    console.log(`  Skipped (missing file): ${skippedMissing}`);
    console.log(`  Failed: ${failed}`);
    if (dryRun) {
        console.log('[Backfill] Dry run only — re-run with --apply to write changes.');
    }
}

main()
    .catch((err) => {
        console.error('[Backfill] Fatal error:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
