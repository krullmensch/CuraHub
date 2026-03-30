import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const publicRouter = Router();

// GET /public/featured — returns the single featured+published exhibition version
publicRouter.get('/featured', async (_req, res) => {
    try {
        const featured = await prisma.exhibitionVersion.findFirst({
            where: { is_featured: true, is_published: true },
            include: {
                exhibition: { select: { id: true, title: true, slug: true } },
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
                exhibition: { select: { id: true, title: true, slug: true } },
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

        const version = await prisma.exhibitionVersion.findFirst({
            where: { exhibition_id: exhibition.id, is_published: true },
            include: {
                instances: {
                    include: {
                        artwork: { include: { asset: true } },
                    },
                },
                walls: true,
            },
        });
        if (!version) {
            return res.status(404).json({ error: 'Diese Ausstellung ist aktuell nicht öffentlich.' });
        }

        res.json({
            exhibition: { id: exhibition.id, title: exhibition.title, slug: exhibition.slug },
            version: { id: version.id, comment: version.comment, published_at: version.published_at },
            instances: version.instances,
            walls: version.walls,
        });
    } catch (err) {
        console.error('Error fetching exhibition by slug:', err);
        res.status(500).json({ error: 'Failed to load exhibition' });
    }
});
