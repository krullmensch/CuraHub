import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { authenticate } from '../lib/middleware';

export const assetsRouter = Router();
const prisma = new PrismaClient();

// GET all assets — supports projectId and folderId query params
assetsRouter.get('/', async (req, res) => {
    try {
        const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;
        const folderIdRaw = req.query.folderId as string | undefined;

        const where: any = {};
        if (projectId && !isNaN(projectId)) {
            where.projectId = projectId;
        }

        if (folderIdRaw !== undefined) {
            if (folderIdRaw === 'unsorted' || folderIdRaw === 'null') {
                where.folderId = null;
            } else {
                const parsed = parseInt(folderIdRaw, 10);
                if (!isNaN(parsed)) {
                    where.folderId = parsed;
                }
            }
        }

        const assets = await prisma.asset.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { artwork: true }
        });
        res.json(assets);
    } catch (error) {
        console.error('Error fetching assets:', error);
        res.status(500).json({ error: 'Failed to fetch assets' });
    }
});

// PATCH /assets/:id — currently only supports moving an asset between folders.
// Authenticated; verifies project ownership and prevents cross-project moves.
const patchAssetSchema = z.object({
    folderId: z.union([z.number().int().positive(), z.null()]),
});

assetsRouter.patch('/:id', authenticate, async (req: any, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

        const data = patchAssetSchema.parse(req.body);
        const isAdmin = req.user.role === 'admin';

        const asset = await prisma.asset.findUnique({
            where: { id },
            include: { project: { select: { id: true, ownerId: true } } },
        });
        if (!asset) return res.status(404).json({ error: 'Asset not found' });

        // Ownership check: assets without a project are admin-only
        if (!isAdmin) {
            if (!asset.project || asset.project.ownerId !== req.user.userId) {
                return res.status(404).json({ error: 'Asset not found' });
            }
        }

        // If moving into a folder, verify it belongs to the same project
        if (data.folderId !== null) {
            const folder = await prisma.folder.findUnique({
                where: { id: data.folderId },
                select: { id: true, projectId: true },
            });
            if (!folder) return res.status(404).json({ error: 'Folder not found' });
            if (folder.projectId !== asset.projectId) {
                return res.status(400).json({ error: 'Folder does not belong to this asset\u2019s project' });
            }
        }

        const updated = await prisma.asset.update({
            where: { id },
            data: { folderId: data.folderId },
            include: { artwork: true },
        });

        res.json(updated);
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation error', details: (e as any).errors });
        }
        console.error('Error updating asset:', e);
        res.status(500).json({ error: 'Failed to update asset' });
    }
});

// DELETE asset
assetsRouter.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const assetId = parseInt(id);
        if (isNaN(assetId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        // Find asset first to get filename
        const asset = await prisma.asset.findUnique({
            where: { id: assetId }
        });

        if (!asset) {
            return res.status(404).json({ error: 'Asset not found' });
        }

        // Delete from DB
        await prisma.asset.delete({
            where: { id: assetId }
        });

        // Delete from filesystem
        // Construct full path. Asset path in DB is relative URL like '/uploads/filename.webp'
        // We need system path.
        const filename = asset.filename;
        const filepath = path.join(__dirname, '../../uploads', filename);

        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        } else {
            console.warn(`File not found on disk: ${filepath}`);
        }

        // Also delete thumbnail if present (video poster frames)
        if (asset.thumbnailPath) {
            const thumbFilename = path.basename(asset.thumbnailPath);
            const thumbPath = path.join(__dirname, '../../uploads', thumbFilename);
            if (fs.existsSync(thumbPath)) {
                fs.unlinkSync(thumbPath);
            }
        }

        res.json({ message: 'Asset deleted successfully' });

    } catch (error) {
        console.error('Error deleting asset:', error);
        // Check for constraint violation (e.g. if linked to artwork and cascade delete not set)
        // By default Prisma might error if Artwork depends on Asset. 
        // Our schema has Asset optional in Artwork? No, Artwork has unique assetId.
        // Let's check Schema. 
        // Artwork: asset Asset? @relation...
        // Asset: artwork Artwork? 
        // If we delete Asset, Artwork's assetId becomes null? Or is it enforced?
        // Usually need to handle unlink. For now, strictly deleting.
        res.status(500).json({ error: 'Failed to delete asset' });
    }
});
