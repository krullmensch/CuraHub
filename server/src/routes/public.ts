import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { arDir, arFilePath } from '../lib/arExportFiles';
import { arPublicInfo, buildPublicScenePayload } from '../lib/publicScene';

const prisma = new PrismaClient();
export const publicRouter = Router();

// GET /public/featured — returns the single featured+published exhibition version
publicRouter.get('/featured', async (_req, res) => {
    try {
        const featured = await prisma.exhibitionVersion.findFirst({
            where: { is_featured: true, is_published: true },
            include: {
                exhibition: { select: { id: true, title: true, slug: true, poster_path: true, start_date: true, end_date: true } },
                creator: { select: { email: true } },
                _count: { select: { instances: true } },
            },
        });

        if (!featured) return res.json(null);

        res.json({
            exhibition: featured.exhibition,
            version: {
                id: featured.id,
                comment: featured.comment,
                published_at: featured.published_at,
                artworkCount: featured._count.instances,
                creator: featured.creator,
            },
        });
    } catch (err) {
        console.error('Error fetching featured exhibition:', err);
        res.status(500).json({ error: 'Failed to load featured exhibition' });
    }
});

// GET /public/exhibitions — returns all published (non-featured) exhibition versions
publicRouter.get('/exhibitions', async (_req, res) => {
    try {
        const versions = await prisma.exhibitionVersion.findMany({
            where: { is_published: true, is_featured: false },
            orderBy: { published_at: 'desc' },
            include: {
                exhibition: { select: { id: true, title: true, slug: true, poster_path: true, start_date: true, end_date: true } },
                creator: { select: { email: true } },
                _count: { select: { instances: true } },
            },
        });

        res.json(
            versions.map((v) => ({
                exhibition: v.exhibition,
                version: {
                    id: v.id,
                    comment: v.comment,
                    published_at: v.published_at,
                    artworkCount: v._count.instances,
                    creator: v.creator,
                },
            }))
        );
    } catch (err) {
        console.error('Error fetching exhibitions:', err);
        res.status(500).json({ error: 'Failed to load exhibitions' });
    }
});

// GET /public/exhibition/:slug — returns full scene data for a published exhibition
publicRouter.get('/exhibition/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const exhibition = await prisma.exhibition.findUnique({
            where: { slug },
        });
        if (!exhibition) {
            return res.status(404).json({ error: 'Diese Ausstellung existiert nicht.' });
        }

        const published = await prisma.exhibitionVersion.findFirst({
            where: { exhibition_id: exhibition.id, is_published: true },
            select: { id: true, arExport: true },
        });
        if (!published) {
            return res.status(404).json({ error: 'Diese Ausstellung ist aktuell nicht öffentlich.' });
        }

        const scene = await buildPublicScenePayload(prisma, published.id);
        if (!scene) {
            return res.status(404).json({ error: 'Diese Ausstellung ist aktuell nicht öffentlich.' });
        }
        res.json({ ...scene, ar: arPublicInfo(exhibition.slug, published.arExport) });
    } catch (err) {
        console.error('Error fetching exhibition by slug:', err);
        res.status(500).json({ error: 'Failed to load exhibition' });
    }
});

const AR_MIME = { glb: 'model/gltf-binary', usdz: 'model/vnd.usdz+zip' } as const;

// GET /public/ar/:slug.glb|.usdz — the AR files of the published version. The file name changes with
// every export, so the versioned URL (?v=<file stem>) can be cached for good; Range works through sendFile.
publicRouter.get('/ar/:file', async (req, res) => {
    const match = /^(.+)\.(glb|usdz)$/.exec(req.params.file);
    if (!match) return res.status(404).json({ error: 'Datei nicht gefunden' });
    const [, slug, format] = match as unknown as [string, string, 'glb' | 'usdz'];
    try {
        const version = await prisma.exhibitionVersion.findFirst({
            where: { is_published: true, exhibition: { slug } },
            select: { arExport: true },
        });
        const row = version?.arExport;
        const name = row?.status === 'done' ? (format === 'glb' ? row.glb_file : row.usdz_file) : null;
        if (!name) return res.status(404).json({ error: 'Datei nicht gefunden' });
        arFilePath(name); // rejects names that could leave the directory

        // Immutable only for the versioned URL of the current file; a bare or stale ?v= may point at a newer export later.
        const stem = name.replace(/\.[^.]+$/, '');
        const cacheControl = req.query.v === stem ? 'public, max-age=31536000, immutable' : 'no-cache';

        res.sendFile(name, {
            root: arDir(),
            cacheControl: false,
            headers: {
                'Content-Type': AR_MIME[format],
                'Accept-Ranges': 'bytes',
                'Cache-Control': cacheControl,
            },
        }, (err) => {
            if (err && !res.headersSent) res.status(404).json({ error: 'Datei nicht gefunden' });
        });
    } catch (err) {
        console.error('Error serving AR file:', err);
        res.status(500).json({ error: 'Failed to load AR file' });
    }
});
