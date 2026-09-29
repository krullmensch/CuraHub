import { Router, Response } from 'express';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { readOptionalUser, userCanAccessProject } from '../lib/middleware';
import { booksDir, readBookMetadata } from '../lib/bookPdf';
import { canReadBookPdf, publishedPlacementWhere, safeBookFile } from '../lib/bookAccess';

export const booksRouter = Router();
const prisma = new PrismaClient();
const uploadDir = path.join(__dirname, '../../uploads');

const notFound = (res: Response) => res.status(404).json({ error: 'Buch nicht gefunden' });

// GET /books/:assetId/pdf — the PDF of a book. Extensionless on purpose: Cloudflare neither
// caches it nor drops the Range header pdf.js relies on (same reason as /uploads/stream).
booksRouter.get('/:assetId/pdf', async (req, res) => {
    const id = Number(req.params.assetId);
    if (!Number.isInteger(id) || id <= 0) return notFound(res);
    try {
        const asset = await prisma.asset.findUnique({
            where: { id },
            include: { artwork: { select: { id: true, publicReadable: true } } },
        });
        if (!asset || asset.type !== 'book' || asset.status !== 'ready') return notFound(res);
        const meta = readBookMetadata(asset.metadata);
        const file = meta ? safeBookFile(meta.pdfFile) : null;
        if (!file) return notFound(res);

        const user = readOptionalUser(req);
        const hasProjectAccess = !!user && (user.role === 'admin'
            || (asset.projectId !== null && await userCanAccessProject(prisma, user.userId, asset.projectId, false)));
        const publicReadable = asset.artwork?.publicReadable === true;
        const placementWhere = asset.artwork ? publishedPlacementWhere(asset.artwork.id, asset.projectId) : null;
        const inPublishedVersion = !hasProjectAccess && publicReadable && placementWhere
            ? await prisma.artworkInstance.count({ where: placementWhere }) > 0
            : false;
        if (!canReadBookPdf({ hasProjectAccess, publicReadable, inPublishedVersion })) return notFound(res);

        res.sendFile(file, {
            root: booksDir(uploadDir),
            cacheControl: false,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline',
                'X-Content-Type-Options': 'nosniff',
                'Content-Security-Policy': 'sandbox',
                'Cache-Control': 'private, max-age=3600',
            },
        }, (err) => {
            if (err && !res.headersSent) notFound(res);
        });
    } catch (err) {
        console.error('[Books] PDF request failed:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Buch konnte nicht geladen werden' });
    }
});
