import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../lib/middleware';

export const restrictionsRouter = Router();
const prisma = new PrismaClient();

// Validation schemas
const createZoneSchema = z.object({
    label: z.string().max(100).optional(),
    min_x: z.number(),
    min_y: z.number(),
    min_z: z.number(),
    max_x: z.number(),
    max_y: z.number(),
    max_z: z.number(),
    rotation_y: z.number().optional().default(0),
});

const updateZoneSchema = z.object({
    label: z.string().max(100).optional(),
    min_x: z.number().optional(),
    min_y: z.number().optional(),
    min_z: z.number().optional(),
    max_x: z.number().optional(),
    max_y: z.number().optional(),
    max_z: z.number().optional(),
    rotation_y: z.number().optional(),
});

// GET /restrictions — list all zones (any authenticated user)
restrictionsRouter.get('/', authenticate, async (req: any, res) => {
    try {
        const zones = await prisma.restrictionZone.findMany({
            orderBy: { createdAt: 'asc' },
        });
        res.json(zones);
    } catch (e) {
        console.error('Failed to fetch restriction zones:', e);
        res.status(500).json({ error: 'Failed to fetch restriction zones' });
    }
});

// POST /restrictions — create zone (admin only)
restrictionsRouter.post('/', authenticate, requireAdmin, async (req: any, res) => {
    try {
        const data = createZoneSchema.parse(req.body);

        // Ensure min < max
        if (data.min_x >= data.max_x || data.min_y >= data.max_y || data.min_z >= data.max_z) {
            return res.status(400).json({ error: 'min values must be less than max values' });
        }

        const zone = await prisma.restrictionZone.create({ data });
        res.status(201).json(zone);
    } catch (e) {
        console.error('Failed to create restriction zone:', e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: (e as any).errors });
        }
        res.status(500).json({ error: 'Failed to create restriction zone' });
    }
});

// PATCH /restrictions/:id — update zone (admin only)
restrictionsRouter.patch('/:id', authenticate, requireAdmin, async (req: any, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid zone ID' });

        const data = updateZoneSchema.parse(req.body);

        const existing = await prisma.restrictionZone.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Zone not found' });

        const zone = await prisma.restrictionZone.update({
            where: { id },
            data,
        });
        res.json(zone);
    } catch (e) {
        console.error('Failed to update restriction zone:', e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: (e as any).errors });
        }
        res.status(500).json({ error: 'Failed to update restriction zone' });
    }
});

// DELETE /restrictions/:id — delete zone (admin only)
restrictionsRouter.delete('/:id', authenticate, requireAdmin, async (req: any, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid zone ID' });

        const existing = await prisma.restrictionZone.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Zone not found' });

        await prisma.restrictionZone.delete({ where: { id } });
        res.json({ success: true, message: 'Restriction zone deleted' });
    } catch (e) {
        console.error('Failed to delete restriction zone:', e);
        res.status(500).json({ error: 'Failed to delete restriction zone' });
    }
});
