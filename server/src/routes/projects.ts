import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

export const projectsRouter = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_dev_key';

// Shared auth middleware (duplicated for simplicity)
const authenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = decoded;
        next();
    } catch(e) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

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

// Resolve :id param as numeric ID or slug
function resolveProjectWhere(param: string, userId: number) {
    const numId = parseInt(param, 10);
    if (!isNaN(numId) && String(numId) === param) {
        return { id: numId, ownerId: userId };
    }
    return { slug: param, ownerId: userId };
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

// GET /projects — list all projects for the authenticated user
projectsRouter.get('/', authenticate, async (req: any, res) => {
    try {
        const userId = req.user.userId;
        const projects = await prisma.project.findMany({
            where: { ownerId: userId },
            orderBy: { updatedAt: 'desc' },
            include: {
                exhibitions: {
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

// GET /projects/:id — get a single project by ID or slug
projectsRouter.get('/:id', authenticate, async (req: any, res) => {
    try {
        const userId = req.user.userId;
        const where = resolveProjectWhere(req.params.id, userId);
        const project = await prisma.project.findFirst({
            where,
            include: {
                exhibitions: {
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
projectsRouter.post('/', authenticate, async (req: any, res) => {
    try {
        const data = createProjectSchema.parse(req.body);
        const userId = req.user.userId;

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
            return res.status(400).json({ error: 'Validation Error', details: (e as any).errors });
        }
        res.status(500).json({ error: 'Failed to create project', details: e instanceof Error ? e.message : String(e) });
    }
});

// PUT /projects/:id — update project name/description
projectsRouter.put('/:id', authenticate, async (req: any, res) => {
    try {
        const data = updateProjectSchema.parse(req.body);
        const userId = req.user.userId;

        // Verify ownership
        const where = resolveProjectWhere(req.params.id, userId);
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
            return res.status(400).json({ error: 'Validation Error', details: (e as any).errors });
        }
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// DELETE /projects/:id — delete project (cascades to exhibitions, versions, instances)
projectsRouter.delete('/:id', authenticate, async (req: any, res) => {
    try {
        const userId = req.user.userId;

        // Verify ownership
        const where = resolveProjectWhere(req.params.id, userId);
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
