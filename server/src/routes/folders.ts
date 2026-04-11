import { Router } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticate, requireCurator } from '../lib/middleware';

export const foldersRouter = Router();
const prisma = new PrismaClient();

// --- Schemas ---
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const createFolderSchema = z.object({
    projectId: z.number().int().positive(),
    name: z.string().trim().min(1).max(50),
    color: z.string().regex(HEX_RE).optional(),
});

const updateFolderSchema = z.object({
    name: z.string().trim().min(1).max(50).optional(),
    color: z.string().regex(HEX_RE).optional(),
});

// --- Helpers ---
async function assertProjectAccess(projectId: number, userId: number, isAdmin: boolean): Promise<boolean> {
    if (isAdmin) {
        const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
        return !!exists;
    }
    const exists = await prisma.project.findFirst({
        where: { id: projectId, ownerId: userId },
        select: { id: true },
    });
    return !!exists;
}

function isUniqueViolation(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

// --- Routes ---

// GET /folders?projectId=X — list folders for a project, including asset counts
foldersRouter.get('/', authenticate, async (req: any, res) => {
    try {
        const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : NaN;
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'projectId is required' });
        }

        const isAdmin = req.user.role === 'admin';
        const ok = await assertProjectAccess(projectId, req.user.userId, isAdmin);
        if (!ok) return res.status(404).json({ error: 'Project not found' });

        const [folders, unsortedCount] = await Promise.all([
            prisma.folder.findMany({
                where: { projectId },
                orderBy: { name: 'asc' },
                include: { _count: { select: { assets: true } } },
            }),
            prisma.asset.count({ where: { projectId, folderId: null } }),
        ]);

        res.json({ folders, unsortedCount });
    } catch (e) {
        console.error('Error fetching folders:', e);
        res.status(500).json({ error: 'Failed to fetch folders' });
    }
});

// POST /folders — create a folder in a project
foldersRouter.post('/', authenticate, requireCurator, async (req: any, res) => {
    try {
        const data = createFolderSchema.parse(req.body);
        const isAdmin = req.user.role === 'admin';

        const ok = await assertProjectAccess(data.projectId, req.user.userId, isAdmin);
        if (!ok) return res.status(404).json({ error: 'Project not found' });

        const folder = await prisma.folder.create({
            data: {
                name: data.name,
                color: data.color ?? '#6b7280',
                projectId: data.projectId,
            },
            include: { _count: { select: { assets: true } } },
        });

        res.status(201).json(folder);
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation error', details: (e as any).errors });
        }
        if (isUniqueViolation(e)) {
            return res.status(409).json({ error: 'Folder name already exists in this project' });
        }
        console.error('Error creating folder:', e);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

// PATCH /folders/:id — rename or recolor
foldersRouter.patch('/:id', authenticate, requireCurator, async (req: any, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

        const data = updateFolderSchema.parse(req.body);
        if (data.name === undefined && data.color === undefined) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const isAdmin = req.user.role === 'admin';

        // Verify access via parent project ownership
        const existing = await prisma.folder.findUnique({
            where: { id },
            include: { project: { select: { ownerId: true } } },
        });
        if (!existing) return res.status(404).json({ error: 'Folder not found' });
        if (!isAdmin && existing.project.ownerId !== req.user.userId) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        const updated = await prisma.folder.update({
            where: { id },
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.color !== undefined ? { color: data.color } : {}),
            },
            include: { _count: { select: { assets: true } } },
        });

        res.json(updated);
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation error', details: (e as any).errors });
        }
        if (isUniqueViolation(e)) {
            return res.status(409).json({ error: 'Folder name already exists in this project' });
        }
        console.error('Error updating folder:', e);
        res.status(500).json({ error: 'Failed to update folder' });
    }
});

// DELETE /folders/:id — delete folder; assets fall back to folderId=null via SetNull
foldersRouter.delete('/:id', authenticate, requireCurator, async (req: any, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

        const isAdmin = req.user.role === 'admin';

        const existing = await prisma.folder.findUnique({
            where: { id },
            include: { project: { select: { ownerId: true, id: true } } },
        });
        if (!existing) return res.status(404).json({ error: 'Folder not found' });
        if (!isAdmin && existing.project.ownerId !== req.user.userId) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        await prisma.folder.delete({ where: { id } });

        const unsortedCount = await prisma.asset.count({
            where: { projectId: existing.projectId, folderId: null },
        });

        res.json({ id, unsortedCount });
    } catch (e) {
        console.error('Error deleting folder:', e);
        res.status(500).json({ error: 'Failed to delete folder' });
    }
});
