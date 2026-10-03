import { Router, type Request } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { ensureNotClaimed } from '../live/claimGuard';
import { z } from 'zod';
import { authenticate, exhibitionAccessFilter } from '../lib/middleware';
import { idempotency } from '../lib/idempotency';
import { dropWallGuides, parseWallGuides } from '../lib/wallGuides';
import { publishChange } from '../live/broadcast';

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
    /**
     * One of the default walls every tab starts an empty version with. Created once per version
     * and label: when two tabs save the defaults at the same time, the second gets the first's.
     */
    isDefault: z.boolean().optional(),
});

/** Serializable transactions that collided are retried this often. */
const DEFAULT_WALL_ATTEMPTS = 4;

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
wallsRouter.get('/', authenticate, async (req: Request, res) => {
    try {
        const versionId = parseInt(req.query.versionId as string, 10);
        if (isNaN(versionId)) return res.status(400).json({ error: 'versionId query param required' });

        const isAdmin = req.user!.role === 'admin';
        // Verify user has access (owner or collaborator, or admin)
        const version = await prisma.exhibitionVersion.findFirst({
            where: {
                id: versionId,
                exhibition: exhibitionAccessFilter(req.user!.userId, isAdmin)
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
wallsRouter.post('/', authenticate, idempotency, async (req: Request, res) => {
    try {
        const data = createWallSchema.parse(req.body);

        const isAdmin = req.user!.role === 'admin';
        // Verify user has access to the version (owner or collaborator, or admin)
        const version = await prisma.exhibitionVersion.findFirst({
            where: {
                id: data.versionId,
                exhibition: exhibitionAccessFilter(req.user!.userId, isAdmin)
            }
        });
        if (!version) return res.status(404).json({ error: 'Version not found' });

        const { isDefault, ...fields } = data;
        const create = async (tx: Prisma.TransactionClient) => {
            if (isDefault && fields.label) {
                const existing = await tx.modularWall.findFirst({ where: { versionId: fields.versionId, label: fields.label } });
                if (existing) return { wall: existing, created: false };
            }
            // Check wall count limit (max 20 per version)
            const wallCount = await tx.modularWall.count({ where: { versionId: fields.versionId } });
            if (wallCount >= 20) return null;
            return { wall: await tx.modularWall.create({ data: fields }), created: true };
        };

        let result: Awaited<ReturnType<typeof create>> = null;
        if (isDefault) {
            // Two tabs saving the defaults at once: one transaction loses (P2034) and, retried,
            // finds the other's wall.
            for (let attempt = 1; ; attempt++) {
                try {
                    result = await prisma.$transaction(create, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
                    break;
                } catch (err) {
                    const conflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
                    if (!conflict || attempt >= DEFAULT_WALL_ATTEMPTS) throw err;
                }
            }
        } else {
            result = await create(prisma);
        }
        if (!result) return res.status(400).json({ error: 'Maximum of 20 walls per version reached' });

        const { wall, created } = result;
        res.status(created ? 201 : 200).json(wall);
        if (created) publishChange(req, wall.versionId, { kind: 'wall', op: 'upsert', data: wall });
    } catch (e) {
        console.error('Failed to create wall:', e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: e.issues });
        }
        res.status(500).json({ error: 'Failed to create wall' });
    }
});

// PATCH /walls/:id — update wall properties
wallsRouter.patch('/:id', authenticate, async (req: Request, res) => {
    try {
        const wallId = parseInt(req.params.id, 10);
        if (isNaN(wallId)) return res.status(400).json({ error: 'Invalid wall ID' });

        const data = updateWallSchema.parse(req.body);
        const isAdmin = req.user!.role === 'admin';

        // Verify user has access (owner or collaborator, or admin)
        const existing = await prisma.modularWall.findFirst({
            where: {
                id: wallId,
                version: { exhibition: exhibitionAccessFilter(req.user!.userId, isAdmin) }
            }
        });
        if (!existing) return res.status(404).json({ error: 'Wall not found' });
        if (!ensureNotClaimed(req, res, 'wall', wallId)) return;

        const wall = await prisma.modularWall.update({
            where: { id: wallId },
            data,
        });

        res.json(wall);
        publishChange(req, wall.versionId, { kind: 'wall', op: 'upsert', data: wall });
    } catch (e) {
        console.error('Failed to update wall:', e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: e.issues });
        }
        res.status(500).json({ error: 'Failed to update wall' });
    }
});

// DELETE /walls/:id — delete wall and detach artworks
wallsRouter.delete('/:id', authenticate, async (req: Request, res) => {
    try {
        const wallId = parseInt(req.params.id, 10);
        if (isNaN(wallId)) return res.status(400).json({ error: 'Invalid wall ID' });

        const isAdmin = req.user!.role === 'admin';
        // Verify user has access (owner or collaborator, or admin)
        const existing = await prisma.modularWall.findFirst({
            where: {
                id: wallId,
                version: { exhibition: exhibitionAccessFilter(req.user!.userId, isAdmin) }
            }
        });
        if (!existing) return res.status(404).json({ error: 'Wall not found' });
        if (!ensureNotClaimed(req, res, 'wall', wallId)) return;

        // Detach artworks: set wallId to null on any ArtworkInstances referencing this wall
        await prisma.artworkInstance.updateMany({
            where: { wallId },
            data: { wallId: null },
        });

        // Delete the wall
        await prisma.modularWall.delete({
            where: { id: wallId },
        });

        // The deleted wall's ruler guides go with it (lib/wallGuides.ts).
        const version = await prisma.exhibitionVersion.findUnique({
            where: { id: existing.versionId },
            select: { wall_guides: true },
        });
        const guides = parseWallGuides(version?.wall_guides);
        const remaining = dropWallGuides(guides, wallId);
        if (remaining !== guides) {
            await prisma.exhibitionVersion.update({
                where: { id: existing.versionId },
                data: { wall_guides: remaining as Prisma.InputJsonValue },
            });
        }

        res.json({ success: true, message: 'Wall deleted, artworks detached' });
        // Receivers detach the wall's artworks and drop its guides themselves, as deleteWall does.
        publishChange(req, existing.versionId, { kind: 'wall', op: 'delete', data: { id: wallId } });
    } catch (e) {
        console.error('Failed to delete wall:', e);
        res.status(500).json({ error: 'Failed to delete wall' });
    }
});
