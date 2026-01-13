import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

export const assetsRouter = Router();
const prisma = new PrismaClient();

// GET all assets
assetsRouter.get('/', async (req, res) => {
    try {
        const assets = await prisma.asset.findMany({
            orderBy: { createdAt: 'desc' },
            include: { artwork: true } // Include linked artwork if any
        });
        res.json(assets);
    } catch (error) {
        console.error('Error fetching assets:', error);
        res.status(500).json({ error: 'Failed to fetch assets' });
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
