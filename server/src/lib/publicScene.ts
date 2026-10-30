import type { PrismaClient } from '@prisma/client';

/**
 * The scene of one version as the public viewer gets it. Also served to the headless AR export
 * page (routes/arExport.ts), which must see exactly what a visitor sees.
 */
export async function buildPublicScenePayload(prisma: PrismaClient, versionId: number) {
    const version = await prisma.exhibitionVersion.findUnique({
        where: { id: versionId },
        include: {
            exhibition: true,
            instances: {
                include: {
                    artwork: { include: { asset: true } },
                },
            },
            walls: true,
            // Only figures the curator switched on for the viewer
            scaleFigures: { where: { isPublic: true } },
        },
    });
    if (!version) return null;
    const { exhibition } = version;

    return {
        exhibition: { id: exhibition.id, title: exhibition.title, slug: exhibition.slug },
        version: { id: version.id, comment: version.comment, published_at: version.published_at },
        // Books: the PDF name stays server-side; the viewer asks /api/books/:id/pdf.
        instances: version.instances.map((inst) => {
            const asset = inst.artwork?.asset;
            if (asset?.type !== 'book' || !asset.metadata || typeof asset.metadata !== 'object' || Array.isArray(asset.metadata)) return inst;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { pdfFile: _pdfFile, ...metadata } = asset.metadata as Record<string, unknown>;
            return { ...inst, artwork: { ...inst.artwork, asset: { ...asset, metadata } } };
        }),
        walls: version.walls,
        scaleFigures: version.scaleFigures,
    };
}

export type ArPublicStatus = 'queued' | 'running' | 'done' | 'none';
export interface ArPublicInfo { status: ArPublicStatus; glbUrl?: string; usdzUrl?: string }

/** `failed` and a missing row both read as "no AR" to visitors. File names change per export, so `?v=` busts caches. */
export function arPublicInfo(
    slug: string,
    row: { status: string; glb_file: string | null; usdz_file: string | null } | null,
): ArPublicInfo {
    if (!row) return { status: 'none' };
    if (row.status === 'queued' || row.status === 'running') return { status: row.status };
    if (row.status !== 'done' || !row.glb_file || !row.usdz_file) return { status: 'none' };
    const stem = (name: string) => name.replace(/\.[^.]+$/, '');
    const base = `/api/public/ar/${encodeURIComponent(slug)}`;
    return {
        status: 'done',
        glbUrl: `${base}.glb?v=${stem(row.glb_file)}`,
        usdzUrl: `${base}.usdz?v=${stem(row.usdz_file)}`,
    };
}
