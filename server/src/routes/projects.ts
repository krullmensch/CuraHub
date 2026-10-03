import { Router, type Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { authenticate, requireCurator } from '../lib/middleware';

export const projectsRouter = Router();
const prisma = new PrismaClient();

// --- Helpers ---
const BLOCKED_SLUGS = ['login', 'register', 'project', 'exhibition', 'admin', 'assets', 'api', 'public'];

function generateBaseSlug(name: string): string {
    let slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 80);
    if (!slug) slug = 'project';
    if (BLOCKED_SLUGS.includes(slug)) slug = slug + '-project';
    return slug;
}

// :id param as numeric ID or slug
function projectKey(param: string) {
    const numId = parseInt(param, 10);
    return !isNaN(numId) && String(numId) === param ? { id: numId } : { slug: param };
}

// Resolve :id param as numeric ID or slug, owned by the user (changes, deletion)
// Pass isAdmin=true to skip ownership filter (admins can access all projects)
function resolveProjectWhere(param: string, userId: number, isAdmin = false) {
    return isAdmin ? projectKey(param) : { ...projectKey(param), ownerId: userId };
}

/**
 * Projects a user may open: own ones and those with an exhibition they were invited to
 * (ExhibitionCollaborator), like exhibitionAccessFilter / userCanAccessProject. Admins: all.
 */
function projectVisibleTo(userId: number, isAdmin: boolean) {
    if (isAdmin) return {};
    return { OR: [{ ownerId: userId }, { exhibitions: { some: { collaborators: { some: { userId } } } } }] };
}

/** The exhibitions of a project a user may open (a collaborator only sees the ones they were invited to). */
function exhibitionsVisibleTo(userId: number, isAdmin: boolean) {
    if (isAdmin) return undefined;
    return { OR: [{ project: { ownerId: userId } }, { collaborators: { some: { userId } } }] };
}

// --- Schemas ---
const createProjectSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
});

const updateProjectSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
});

// --- Routes ---

// GET /projects — the user's own projects and those they collaborate on (admin sees all)
projectsRouter.get('/', authenticate, async (req: Request, res) => {
    try {
        const userId = req.user!.userId;
        const isAdmin = req.user!.role === 'admin';
        const projects = await prisma.project.findMany({
            where: projectVisibleTo(userId, isAdmin),
            orderBy: { updatedAt: 'desc' },
            include: {
                exhibitions: {
                    where: exhibitionsVisibleTo(userId, isAdmin),
                    select: { id: true, title: true, slug: true }
                },
                _count: { select: { assets: true } }
            }
        });
        res.json(projects);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

// GET /projects/:id — get a single project by ID or slug, own or collaborated on (admin sees all)
projectsRouter.get('/:id', authenticate, async (req: Request, res) => {
    try {
        const userId = req.user!.userId;
        const isAdmin = req.user!.role === 'admin';
        const project = await prisma.project.findFirst({
            where: { ...projectKey(req.params.id), ...projectVisibleTo(userId, isAdmin) },
            include: {
                exhibitions: {
                    where: exhibitionsVisibleTo(userId, isAdmin),
                    include: {
                        versions: {
                            orderBy: { created_at: 'desc' },
                            take: 1,
                            select: { id: true, comment: true, created_at: true }
                        }
                    }
                },
                _count: { select: { assets: true } }
            }
        });

        if (!project) return res.status(404).json({ error: 'Project not found' });
        res.json(project);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

// POST /projects — create a new project (auto-creates exhibition + initial version)
projectsRouter.post('/', authenticate, requireCurator, async (req: Request, res) => {
    try {
        const data = createProjectSchema.parse(req.body);
        const userId = req.user!.userId;

        // Generate project slug
        const baseSlug = generateBaseSlug(data.name);
        let projectSlug = baseSlug;
        let suffix = 2;
        while (await prisma.project.findFirst({ where: { slug: projectSlug } })) {
            projectSlug = `${baseSlug}-${suffix}`;
            suffix++;
        }

        // Generate exhibition slug (may differ if collision)
        let exhibitionSlug = baseSlug;
        suffix = 2;
        while (await prisma.exhibition.findUnique({ where: { slug: exhibitionSlug } })) {
            exhibitionSlug = `${baseSlug}-${suffix}`;
            suffix++;
        }

        const project = await prisma.project.create({
            data: {
                name: data.name,
                slug: projectSlug,
                description: data.description,
                ownerId: userId,
                // Auto-create default exhibition with initial draft version
                exhibitions: {
                    create: {
                        title: data.name,
                        slug: exhibitionSlug,
                        room_id: 1, // Default room
                        versions: {
                            create: {
                                created_by_user_id: userId,
                                is_published: false,
                                comment: 'Initial version',
                            }
                        }
                    }
                }
            },
            include: {
                exhibitions: {
                    include: {
                        versions: {
                            orderBy: { created_at: 'desc' },
                            take: 1,
                        }
                    }
                }
            }
        });

        res.status(201).json(project);
    } catch (e) {
        console.error(e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: e.issues });
        }
        res.status(500).json({ error: 'Failed to create project', details: e instanceof Error ? e.message : String(e) });
    }
});

// PUT /projects/:id — update project name/description (admin can update any)
projectsRouter.put('/:id', authenticate, requireCurator, async (req: Request, res) => {
    try {
        const data = updateProjectSchema.parse(req.body);
        const userId = req.user!.userId;
        const isAdmin = req.user!.role === 'admin';

        // Verify ownership (admins bypass ownership check)
        const where = resolveProjectWhere(req.params.id, userId, isAdmin);
        const existing = await prisma.project.findFirst({ where });
        if (!existing) return res.status(404).json({ error: 'Project not found' });

        const updated = await prisma.project.update({
            where: { id: existing.id },
            data: {
                name: data.name,
                description: data.description,
            }
        });

        res.json(updated);
    } catch (e) {
        console.error(e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: e.issues });
        }
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// DELETE /projects/:id — delete project (cascades to exhibitions, versions, instances)
projectsRouter.delete('/:id', authenticate, requireCurator, async (req: Request, res) => {
    try {
        const userId = req.user!.userId;
        const isAdmin = req.user!.role === 'admin';

        // Verify ownership (admins bypass ownership check)
        const where = resolveProjectWhere(req.params.id, userId, isAdmin);
        const existing = await prisma.project.findFirst({ where });
        if (!existing) return res.status(404).json({ error: 'Project not found' });

        const projectId = existing.id;

        // Fetch associated assets to delete their physical files
        const assets = await prisma.asset.findMany({
            where: { projectId }
        });

        // Physically delete files
        for (const asset of assets) {
            try {
                // Ensure the path is absolute or resolve it relative to the upload dir
                const fullPath = path.resolve(asset.path);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            } catch (err) {
                console.error(`Failed to delete file for asset ${asset.id}:`, err);
            }
        }

        await prisma.project.delete({ where: { id: projectId } });
        res.json({ success: true, id: projectId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});
