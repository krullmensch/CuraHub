/**
 * VID-04 backfill: create the 720p/480p proxy versions (low/medium render presets) for existing
 * ready videos that don't have them yet.
 *
 * DO NOT RUN THIS AUTOMATICALLY. CPU-heavy (minutes per long video). Run manually, inside the
 * app container:
 *   node dist/scripts/backfill-video-proxies.js --dry-run   (default — probes only, no writes)
 *   node dist/scripts/backfill-video-proxies.js --apply
 *   node dist/scripts/backfill-video-proxies.js --apply --limit 1
 *
 * Writes `<stem>-proxy-<height>.mp4` next to the web version and sets metadata.videoProxies.
 * Idempotent: videos with metadata.videoProxies (or no smaller size to create) are skipped.
 */
import path from 'path';
import fs from 'fs';
import { PrismaClient, type Prisma } from '@prisma/client';
import { createVideoProxy, probeVideo, proxyHeightsFor } from '../lib/video';

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

function metadataObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, Prisma.JsonValue] => entry[1] !== undefined),
    );
}

async function main() {
    const { dryRun, limit } = parseArgs(process.argv.slice(2));
    console.log(`[ProxyBackfill] Mode: ${dryRun ? 'DRY RUN (no writes)' : 'APPLY'}${limit ? `, limit=${limit}` : ''}`);

    const assets = await prisma.asset.findMany({ where: { type: 'video', status: 'ready' }, orderBy: { id: 'asc' } });
    let done = 0;
    let skipped = 0;
    let failed = 0;

    for (const asset of assets) {
        if (limit !== undefined && done >= limit) break;
        const metadata = metadataObject(asset.metadata);
        if (metadata.videoProxies) { skipped++; continue; }

        const mp4Path = path.join(uploadDir, path.basename(asset.path));
        if (!fs.existsSync(mp4Path)) {
            console.warn(`[ProxyBackfill] Asset ${asset.id}: file missing (${asset.path})`);
            skipped++;
            continue;
        }
        const probe = await probeVideo(mp4Path).catch(() => null);
        const heights = probe ? proxyHeightsFor(probe.width, probe.height) : [];
        if (heights.length === 0) { skipped++; continue; }

        console.log(`[ProxyBackfill] Asset ${asset.id} ${probe!.width}×${probe!.height} ${Math.round(probe!.duration)} s → ${heights.join('/')}p`);
        if (dryRun) { done++; continue; }

        const baseName = path.basename(asset.path).replace(/\.mp4$/, '');
        const proxies: Record<string, string> = {};
        try {
            for (const height of heights) {
                const filename = `${baseName}-proxy-${height}.mp4`;
                await createVideoProxy(mp4Path, path.join(uploadDir, filename), height, undefined, probe!.duration || undefined);
                proxies[String(height)] = `/uploads/${filename}`;
            }
            const rest = { ...metadata };
            delete rest.proxiesPending;
            await prisma.asset.update({ where: { id: asset.id }, data: { metadata: { ...rest, videoProxies: proxies } } });
            done++;
        } catch (err) {
            console.error(`[ProxyBackfill] Asset ${asset.id} failed:`, err);
            Object.values(proxies).forEach((p) => fs.rmSync(path.join(uploadDir, path.basename(p)), { force: true }));
            failed++;
        }
    }

    console.log(`[ProxyBackfill] ${dryRun ? 'Would process' : 'Processed'} ${done}, skipped ${skipped}, failed ${failed}.`);
    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('[ProxyBackfill] Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
});
