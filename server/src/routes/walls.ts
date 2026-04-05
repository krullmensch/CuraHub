import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, exhibitionAccessFilter } from '../lib/middleware';

export const wallsRouter = Router();
const prisma = new PrismaClient();

// Validation schemas
const createWallSchema = z.object({
    versionId: z.number(),
    label: z.string().max(100).optional(),
    position_x: z.number().default(0),
    position_y: z.number().default(1.25), // Half of default height so wall sits on floor
    position_z: z.number().default(0),
    rotation_x: z.number().default(0),
    rotation_y: z.number().default(0),
    rotation_z: z.number().default(0),
    width: z.number().min(0.1).max(20).default(2.0),
    height: z.number().min(0.1).max(10).default(2.5),
    thickness: z.number().min(0.01).max(1).default(0.12),
    color: z.string().default('#ffffff'),
    isLocked: z.boolean().default(false),
});

const updateWallSchema = z.object({
    label: z.string().max(100).optional(),
    position_x: z.number().optional(),
    position_y: z.number().optional(),
    position_z: z.number().optional(),
    rotation_x: z.number().optional(),
    rotation_y: z.number().optional(),
    rotation_z: z.number().optional(),
    width: z.number().min(0.1).max(20).optional(),
    height: z.number().min(0.1).max(10).optional(),
    thickness: z.number().min(0.01).max(1).optional(),
    color: z.string().optional(),
    isLocked: z.boolean().optional(),
});

// GET /walls?versionId=:id — list all walls for a version
wallsRouter.get('/', authenticate, async (req: any, res) => {
    try {
        const versionId = parseInt(req.query.versionId as string, 10);
        if (isNaN(versionId)) return res.status(400).json({ error: 'versionId query param required' });

        const isAdmin = req.user.role === 'admin';
        // Verify user has access (owner or collaborator, or admin)
        const version = await prisma.exhibitionVersion.findFirst({
            where: {
                id: versionId,
                exhibition: exhibitionAccessFilter(req.user.userId, isAdmin)
            }
        });
        if (!version) return res.status(404).json({ error: 'Version not found' });

        const walls = await prisma.modularWall.findMany({
            where: { versionId },
            orderBy: { createdAt: 'asc' },
        });

        res.json(walls);
    } catch (e) {
        console.error('Failed to fetch walls:', e);
        res.status(500).json({ error: 'Failed to fetch walls' });
    }
});

// POST /walls — create a new wall
wallsRouter.post('/', authenticate, async (req: any, res) => {
    try {
        const data = createWallSchema.parse(req.body);

        const isAdmin = req.user.role === 'admin';
        // Verify user has access to the version (owner or collaborator, or admin)
        const version = await prisma.exhibitionVersion.findFirst({
            where: {
                id: data.versionId,
                exhibition: exhibitionAccessFilter(req.user.userId, isAdmin)
            }
        });
        if (!version) return res.status(404).json({ error: 'Version not found' });

        // Check wall count limit (max 20 per version)
        const wallCount = await prisma.modularWall.count({ where: { versionId: data.versionId } });
        if (wallCount >= 20) {
            return res.status(400).json({ error: 'Maximum of 20 walls per version reached' });
        }

        const wall = await prisma.modularWall.create({
            data: {
                versionId: data.versionId,
                label: data.label,
                position_x: data.position_x,
                position_y: data.position_y,
                position_z: data.position_z,
                rotation_x: data.rotation_x,
                rotation_y: data.rotation_y,
                rotation_z: data.rotation_z,
                width: data.width,
                height: data.height,
                thickness: data.thickness,
                color: data.color,
                isLocked: data.isLocked,
            },
        });

        res.status(201).json(wall);
    } catch (e) {
        console.error('Failed to create wall:', e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: (e as any).errors });
        }
        res.status(500).json({ error: 'Failed to create wall' });
    }
});

// PATCH /walls/:id — update wall properties
wallsRouter.patch('/:id', authenticate, async (req: any, res) => {
    try {
        const wallId = parseInt(req.params.id, 10);
        if (isNaN(wallId)) return res.status(400).json({ error: 'Invalid wall ID' });

        const data = updateWallSchema.parse(req.body);
        const isAdmin = req.user.role === 'admin';

        // Verify user has access (owner or collaborator, or admin)
        const existing = await prisma.modularWall.findFirst({
            where: {
                id: wallId,
                version: { exhibition: exhibitionAccessFilter(req.user.userId, isAdmin) }
            }
        });
        if (!existing) return res.status(404).json({ error: 'Wall not found' });

        const wall = await prisma.modularWall.update({
            where: { id: wallId },
            data,
        });

        res.json(wall);
    } catch (e) {
        console.error('Failed to update wall:', e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: (e as any).errors });
        }
        res.status(500).json({ error: 'Failed to update wall' });
    }
});

// DELETE /walls/:id — delete wall and detach artworks
wallsRouter.delete('/:id', authenticate, async (req: any, res) => {
    try {
        const wallId = parseInt(req.params.id, 10);
        if (isNaN(wallId)) return res.status(400).json({ error: 'Invalid wall ID' });

        const isAdmin = req.user.role === 'admin';
        // Verify user has access (owner or collaborator, or admin)
        const existing = await prisma.modularWall.findFirst({
            where: {
                id: wallId,
                version: { exhibition: exhibitionAccessFilter(req.user.userId, isAdmin) }
            }
        });
        if (!existing) return res.status(404).json({ error: 'Wall not found' });

        // Detach artworks: set wallId to null on any ArtworkInstances referencing this wall
        await prisma.artworkInstance.updateMany({
            where: { wallId },
            data: { wallId: null },
        });

        // Delete the wall
        await prisma.modularWall.delete({
            where: { id: wallId },
        });

        res.json({ success: true, message: 'Wall deleted, artworks detached' });
    } catch (e) {
        console.error('Failed to delete wall:', e);
        res.status(500).json({ error: 'Failed to delete wall' });
    }
});
