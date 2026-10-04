import { Router, type Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { ensureNotClaimed } from '../live/claimGuard';
import { z } from 'zod';
import { authenticate, exhibitionAccessFilter } from '../lib/middleware';
import { idempotency } from '../lib/idempotency';

export const scaleFiguresRouter = Router();
const prisma = new PrismaClient();

const MAX_FIGURES_PER_VERSION = 50;

// Figures stand on the floor and keep their size: only x/z and the turn around y are stored.
const coordinate = z.number().min(-500).max(500);
const angle = z.number().min(-100).max(100);

const createScaleFigureSchema = z.object({
    versionId: z.number().int(),
    position_x: coordinate,
    position_z: coordinate,
    rotation_y: angle.default(0),
    isPublic: z.boolean().default(false),
});

const updateScaleFigureSchema = z.object({
    position_x: coordinate.optional(),
    position_z: coordinate.optional(),
    rotation_y: angle.optional(),
    isPublic: z.boolean().optional(),
});

/** The figure, if the user may edit its exhibition. */
const findAccessibleFigure = (req: Request, id: number) => prisma.scaleFigure.findFirst({
    where: {
        id,
        version: { exhibition: exhibitionAccessFilter(req.user!.userId, req.user!.role === 'admin') },
    },
});

// GET /scale-figures?versionId=:id — all figures of a version
scaleFiguresRouter.get('/', authenticate, async (req: Request, res) => {
    try {
        const versionId = parseInt(req.query.versionId as string, 10);
        if (isNaN(versionId)) return res.status(400).json({ error: 'versionId query param required' });

        const version = await prisma.exhibitionVersion.findFirst({
            where: { id: versionId, exhibition: exhibitionAccessFilter(req.user!.userId, req.user!.role === 'admin') },
        });
        if (!version) return res.status(404).json({ error: 'Version not found' });

        const figures = await prisma.scaleFigure.findMany({
            where: { versionId },
            orderBy: { createdAt: 'asc' },
        });
        res.json(figures);
    } catch (e) {
        console.error('Failed to fetch scale figures:', e);
        res.status(500).json({ error: 'Failed to fetch scale figures' });
    }
});

// POST /scale-figures — add a figure
scaleFiguresRouter.post('/', authenticate, idempotency, async (req: Request, res) => {
    try {
        const data = createScaleFigureSchema.parse(req.body);

        const version = await prisma.exhibitionVersion.findFirst({
            where: { id: data.versionId, exhibition: exhibitionAccessFilter(req.user!.userId, req.user!.role === 'admin') },
        });
        if (!version) return res.status(404).json({ error: 'Version not found' });

        const count = await prisma.scaleFigure.count({ where: { versionId: data.versionId } });
        if (count >= MAX_FIGURES_PER_VERSION) {
            return res.status(400).json({ error: `Maximal ${MAX_FIGURES_PER_VERSION} Maßstabsfiguren pro Version` });
        }

        const figure = await prisma.scaleFigure.create({ data });
        res.status(201).json(figure);
    } catch (e) {
        console.error('Failed to create scale figure:', e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: e.issues });
        }
        res.status(500).json({ error: 'Failed to create scale figure' });
    }
});

// PATCH /scale-figures/:id — move, turn, show/hide in the viewer
scaleFiguresRouter.patch('/:id', authenticate, async (req: Request, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid scale figure ID' });

        const data = updateScaleFigureSchema.parse(req.body);
        if (!(await findAccessibleFigure(req, id))) return res.status(404).json({ error: 'Scale figure not found' });
        if (!ensureNotClaimed(req, res, 'figure', id)) return;

        const figure = await prisma.scaleFigure.update({ where: { id }, data });
        res.json(figure);
    } catch (e) {
        console.error('Failed to update scale figure:', e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: e.issues });
        }
        res.status(500).json({ error: 'Failed to update scale figure' });
    }
});

// DELETE /scale-figures/:id
scaleFiguresRouter.delete('/:id', authenticate, async (req: Request, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid scale figure ID' });

        if (!(await findAccessibleFigure(req, id))) return res.status(404).json({ error: 'Scale figure not found' });
        if (!ensureNotClaimed(req, res, 'figure', id)) return;

        await prisma.scaleFigure.delete({ where: { id } });
        res.json({ success: true });
    } catch (e) {
        console.error('Failed to delete scale figure:', e);
        res.status(500).json({ error: 'Failed to delete scale figure' });
    }
});
