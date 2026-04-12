import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, requireAdmin, requireCurator, exhibitionAccessFilter } from '../lib/middleware';

export const versionsRouter = Router();
const prisma = new PrismaClient();

const createVersionSchema = z.object({
    comment: z.string().min(1).max(500),
    branch_name: z.string().min(1).max(100).default('main'),
    sourceVersionId: z.number().optional(), // Version to optionally link as parent
    instances: z.array(z.object({
        artworkId: z.number().optional(),
        assetId: z.number().optional(),
        wallId: z.number().nullable().optional(),
        wallIndex: z.number().nullable().optional(), // Index into walls[] array for ID remapping
        medium: z.enum(['frame', 'wallpaper', 'projector', 'display', 'model3d', 'monitor', 'beamer']).optional(),
        position_x: z.number(),
        position_y: z.number(),
        position_z: z.number(),
        rotation_x: z.number(),
        rotation_y: z.number(),
        rotation_z: z.number(),
        scale_x: z.number(),
        scale_y: z.number(),
        scale_z: z.number(),
    })).optional(),
    walls: z.array(z.object({
        label: z.string().max(100).optional().nullable(),
        position_x: z.number(),
        position_y: z.number(),
        position_z: z.number(),
        rotation_x: z.number(),
        rotation_y: z.number(),
        rotation_z: z.number(),
        width: z.number(),
        height: z.number(),
        thickness: z.number(),
        color: z.string(),
        isLocked: z.boolean(),
    })).optional()
});

// GET /exhibitions/:exhibitionId/versions — list all versions for an exhibition
versionsRouter.get('/exhibitions/:exhibitionId/versions', authenticate, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.exhibitionId, 10);
        if (isNaN(exhibitionId)) return res.status(400).json({ error: 'Invalid exhibition ID' });

        const isAdmin = req.user.role === 'admin';
        // Verify user has access (owner or collaborator, or admin)
        const exhibition = await prisma.exhibition.findFirst({
            where: {
                id: exhibitionId,
                ...exhibitionAccessFilter(req.user.userId, isAdmin)
            }
        });
        if (!exhibition) return res.status(404).json({ error: 'Exhibition not found' });

        const versions = await prisma.exhibitionVersion.findMany({
            where: { exhibition_id: exhibitionId },
            orderBy: { created_at: 'desc' },
            select: {
                id: true,
                comment: true,
                created_at: true,
                parent_version_id: true,
                branch_name: true,
                is_published: true,
                is_featured: true,
                creator: {
                    select: { id: true, email: true }
                },
                _count: { select: { instances: true } }
            }
        });

        res.json(versions);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch versions' });
    }
});

// GET /exhibitions/:exhibitionId/versions/:versionId — get a specific version with its instances
versionsRouter.get('/exhibitions/:exhibitionId/versions/:versionId', authenticate, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.exhibitionId, 10);
        const versionId = parseInt(req.params.versionId, 10);
        if (isNaN(exhibitionId) || isNaN(versionId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        const isAdmin = req.user.role === 'admin';
        // Verify user has access (owner or collaborator, or admin)
        const exhibition = await prisma.exhibition.findFirst({
            where: {
                id: exhibitionId,
                ...exhibitionAccessFilter(req.user.userId, isAdmin)
            }
        });
        if (!exhibition) return res.status(404).json({ error: 'Exhibition not found' });

        const version = await prisma.exhibitionVersion.findFirst({
            where: { id: versionId, exhibition_id: exhibitionId },
            include: {
                instances: {
                    include: {
                        artwork: {
                            include: { asset: true }
                        }
                    }
                },
                walls: true,
                creator: {
                    select: { id: true, email: true }
                }
            }
        });

        if (!version) return res.status(404).json({ error: 'Version not found' });
        res.json(version);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch version' });
    }
});

// POST /exhibitions/:exhibitionId/versions — create a new version (snapshot current instances)
versionsRouter.post('/exhibitions/:exhibitionId/versions', authenticate, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.exhibitionId, 10);
        if (isNaN(exhibitionId)) return res.status(400).json({ error: 'Invalid exhibition ID' });

        const data = createVersionSchema.parse(req.body);
        const userId = req.user.userId;
        const isAdmin = req.user.role === 'admin';
        const userRole = req.user.role;

        // Branching (non-main) requires curator+ role
        if (data.branch_name !== 'main') {
            const allowedRoles = ['curator', 'prof', 'admin'];
            if (!allowedRoles.includes(userRole)) {
                return res.status(403).json({ error: 'Branches können nur von Kuratoren, Profs oder Admins erstellt werden' });
            }
        }

        // Verify user has access (owner or collaborator, or admin)
        const exhibition = await prisma.exhibition.findFirst({
            where: {
                id: exhibitionId,
                ...exhibitionAccessFilter(userId, isAdmin)
            }
        });
        if (!exhibition) return res.status(404).json({ error: 'Exhibition not found' });

        // Find the source version to snapshot from if needed for parent tracking
        let sourceVersionId = data.sourceVersionId;
        if (!sourceVersionId) {
            const latestVersion = await prisma.exhibitionVersion.findFirst({
                where: { exhibition_id: exhibitionId },
                orderBy: { created_at: 'desc' },
            });
            sourceVersionId = latestVersion?.id;
        }

        // Use frontend instances, or fallback to deep-copying if not provided (backwards compat)
        let instancesToCreate: any[] = [];
        if (data.instances) {
            // Resolve assetIds to artworkIds if necessary
            for (const inst of data.instances) {
                let artworkId = inst.artworkId;
                if (!artworkId && inst.assetId) {
                    const asset = await prisma.asset.findUnique({ where: { id: inst.assetId } });
                    if (!asset) continue;
                    
                    let artwork = await prisma.artwork.findFirst({ where: { assetId: asset.id } });
                    if (!artwork) {
                        artwork = await prisma.artwork.create({
                            data: {
                                title: asset.filename,
                                assetId: asset.id,
                                artist: 'Unknown',
                                year: new Date().getFullYear().toString()
                            }
                        });
                    }
                    artworkId = artwork.id;
                }
                
                if (artworkId) {
                    instancesToCreate.push({
                        artworkId,
                        medium: inst.medium ?? 'frame',
                        position_x: inst.position_x,
                        position_y: inst.position_y,
                        position_z: inst.position_z,
                        rotation_x: inst.rotation_x,
                        rotation_y: inst.rotation_y,
                        rotation_z: inst.rotation_z,
                        scale_x: inst.scale_x,
                        scale_y: inst.scale_y,
                        scale_z: inst.scale_z,
                        // wallId will be linked after walls are created (see below)
                    });
                }
            }
        } else if (sourceVersionId) {
            const sourceInstances = await prisma.artworkInstance.findMany({
                where: { versionId: sourceVersionId }
            });
            // Build old wall ID → index mapping for deep-copy remapping
            const sourceWalls = await prisma.modularWall.findMany({
                where: { versionId: sourceVersionId },
                orderBy: { id: 'asc' }
            });
            const oldWallIdToIndex = new Map(sourceWalls.map((w, i) => [w.id, i]));

            instancesToCreate = sourceInstances.map(inst => ({
                artworkId: inst.artworkId,
                medium: inst.medium ?? 'frame',
                _wallIndex: inst.wallId ? (oldWallIdToIndex.get(inst.wallId) ?? null) : null,
                position_x: inst.position_x,
                position_y: inst.position_y,
                position_z: inst.position_z,
                rotation_x: inst.rotation_x,
                rotation_y: inst.rotation_y,
                rotation_z: inst.rotation_z,
                scale_x: inst.scale_x,
                scale_y: inst.scale_y,
                scale_z: inst.scale_z,
            }));
        }

        // Prepare walls to create
        let wallsToCreate: any[] = [];
        if (data.walls) {
            wallsToCreate = data.walls.map(w => ({
                label: w.label,
                position_x: w.position_x,
                position_y: w.position_y,
                position_z: w.position_z,
                rotation_x: w.rotation_x,
                rotation_y: w.rotation_y,
                rotation_z: w.rotation_z,
                width: w.width,
                height: w.height,
                thickness: w.thickness,
                color: w.color,
                isLocked: w.isLocked,
            }));
        } else if (sourceVersionId) {
            const sourceWalls = await prisma.modularWall.findMany({
                where: { versionId: sourceVersionId }
            });
            wallsToCreate = sourceWalls.map(w => ({
                label: w.label,
                position_x: w.position_x,
                position_y: w.position_y,
                position_z: w.position_z,
                rotation_x: w.rotation_x,
                rotation_y: w.rotation_y,
                rotation_z: w.rotation_z,
                width: w.width,
                height: w.height,
                thickness: w.thickness,
                color: w.color,
                isLocked: w.isLocked,
            }));
        }

        // Create version with walls first, then instances with remapped wallIds
        const newVersion = await prisma.$transaction(async (tx) => {
            // 1. Create version with walls (no instances yet)
            const version = await tx.exhibitionVersion.create({
                data: {
                    exhibition_id: exhibitionId,
                    created_by_user_id: userId,
                    parent_version_id: sourceVersionId,
                    branch_name: data.branch_name,
                    comment: data.comment,
                    is_published: false,
                    walls: {
                        create: wallsToCreate
                    }
                },
                include: { walls: true }
            });

            // 2. Build wall index → new wall ID mapping
            const newWallIds = version.walls.map(w => w.id); // walls created in order

            // 3. Remap wallId on instances using wallIndex (from frontend) or _wallIndex (from deep-copy)
            const instancesWithWallIds = instancesToCreate.map((inst: any, i: number) => {
                const srcInst = data.instances?.[i];
                let wallId: number | null = null;

                // Frontend-provided wallIndex takes priority
                const wallIndex = srcInst?.wallIndex ?? inst._wallIndex ?? null;
                if (wallIndex != null && wallIndex >= 0 && wallIndex < newWallIds.length) {
                    wallId = newWallIds[wallIndex];
                }

                const { _wallIndex, ...cleanInst } = inst;
                return { ...cleanInst, wallId };
            });

            // 4. Create instances with correct wallIds
            if (instancesWithWallIds.length > 0) {
                await tx.artworkInstance.createMany({
                    data: instancesWithWallIds.map((inst: any) => ({
                        ...inst,
                        versionId: version.id,
                    }))
                });
            }

            // 5. Fetch the complete version with all relations
            return tx.exhibitionVersion.findUniqueOrThrow({
                where: { id: version.id },
                include: {
                    instances: {
                        include: {
                            artwork: { include: { asset: true } }
                        }
                    },
                    walls: true,
                    creator: {
                        select: { id: true, email: true }
                    }
                }
            });
        });

        res.status(201).json(newVersion);
    } catch (e) {
        console.error(e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: (e as any).errors });
        }
        res.status(500).json({ error: 'Failed to create version' });
    }
});

// DELETE /exhibitions/:exhibitionId/versions/:versionId — delete a specific version
versionsRouter.delete('/exhibitions/:exhibitionId/versions/:versionId', authenticate, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.exhibitionId, 10);
        const versionId = parseInt(req.params.versionId, 10);
        if (isNaN(exhibitionId) || isNaN(versionId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        const userId = req.user.userId;
        const isAdmin = req.user.role === 'admin';

        // Verify user has access (owner or collaborator, or admin)
        const exhibition = await prisma.exhibition.findFirst({
            where: {
                id: exhibitionId,
                ...exhibitionAccessFilter(userId, isAdmin)
            }
        });
        if (!exhibition) return res.status(404).json({ error: 'Exhibition not found' });

        // Ensure the version exists and belongs to this exhibition
        const version = await prisma.exhibitionVersion.findFirst({
            where: { id: versionId, exhibition_id: exhibitionId }
        });
        if (!version) return res.status(404).json({ error: 'Version not found' });

        // Delete the version. Prisma cascade will delete ArtworkInstances automatically.
        await prisma.exhibitionVersion.delete({
            where: { id: versionId }
        });

        res.json({ success: true, message: 'Version deleted successfully' });
    } catch (e) {
        console.error('Failed to delete version:', e);
        res.status(500).json({ error: 'Failed to delete version' });
    }
});

// PATCH /exhibitions/:exhibitionId/versions/:versionId/publish — publish a version
versionsRouter.patch('/exhibitions/:exhibitionId/versions/:versionId/publish', authenticate, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.exhibitionId, 10);
        const versionId = parseInt(req.params.versionId, 10);
        if (isNaN(exhibitionId) || isNaN(versionId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        const userId = req.user.userId;
        const isAdmin = req.user.role === 'admin';

        // Verify user has access (owner or collaborator, or admin)
        const exhibition = await prisma.exhibition.findFirst({
            where: { id: exhibitionId, ...exhibitionAccessFilter(userId, isAdmin) }
        });
        if (!exhibition) return res.status(404).json({ error: 'Exhibition not found' });

        const version = await prisma.exhibitionVersion.findFirst({
            where: { id: versionId, exhibition_id: exhibitionId }
        });
        if (!version) return res.status(404).json({ error: 'Version not found' });

        if (version.is_published) {
            return res.json({ success: true, message: 'Already published' });
        }

        // Unpublish all other versions of this exhibition, then publish this one
        await prisma.$transaction([
            prisma.exhibitionVersion.updateMany({
                where: { exhibition_id: exhibitionId, is_published: true },
                data: { is_published: false },
            }),
            prisma.exhibitionVersion.update({
                where: { id: versionId },
                data: { is_published: true, published_at: new Date() },
            }),
        ]);

        res.json({ success: true, message: 'Version published' });
    } catch (e) {
        console.error('Failed to publish version:', e);
        res.status(500).json({ error: 'Failed to publish version' });
    }
});

// PATCH /exhibitions/:exhibitionId/versions/:versionId/feature — set as featured (admin only)
versionsRouter.patch('/exhibitions/:exhibitionId/versions/:versionId/feature', authenticate, requireAdmin, async (req: any, res) => {
    try {
        const versionId = parseInt(req.params.versionId, 10);
        if (isNaN(versionId)) return res.status(400).json({ error: 'Invalid ID' });

        const version = await prisma.exhibitionVersion.findUnique({ where: { id: versionId } });
        if (!version) return res.status(404).json({ error: 'Version not found' });
        if (!version.is_published) {
            return res.status(400).json({ error: 'Cannot feature an unpublished version' });
        }

        // Unfeature all, then feature this one
        await prisma.$transaction([
            prisma.exhibitionVersion.updateMany({
                where: { is_featured: true },
                data: { is_featured: false },
            }),
            prisma.exhibitionVersion.update({
                where: { id: versionId },
                data: { is_featured: true },
            }),
        ]);

        res.json({ success: true, message: 'Version featured' });
    } catch (e) {
        console.error('Failed to feature version:', e);
        res.status(500).json({ error: 'Failed to feature version' });
    }
});

// POST /exhibitions/:exhibitionId/versions/:versionId/merge — overwrite-merge a branch into main
versionsRouter.post('/exhibitions/:exhibitionId/versions/:versionId/merge', authenticate, requireCurator, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.exhibitionId, 10);
        const versionId = parseInt(req.params.versionId, 10);
        if (isNaN(exhibitionId) || isNaN(versionId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        const userId = req.user.userId;
        const isAdmin = req.user.role === 'admin';

        // Verify user has exhibition access
        const exhibition = await prisma.exhibition.findFirst({
            where: { id: exhibitionId, ...exhibitionAccessFilter(userId, isAdmin) }
        });
        if (!exhibition) return res.status(404).json({ error: 'Exhibition not found' });

        // Load the source version
        const sourceVersion = await prisma.exhibitionVersion.findFirst({
            where: { id: versionId, exhibition_id: exhibitionId },
            include: {
                instances: true,
                walls: true,
            }
        });
        if (!sourceVersion) return res.status(404).json({ error: 'Version not found' });
        if (sourceVersion.branch_name === 'main') {
            return res.status(400).json({ error: 'Kann main nicht in main mergen' });
        }

        // Build old wall ID → index mapping for remapping instances
        const oldWallIdToIndex = new Map(sourceVersion.walls.map((w, i) => [w.id, i]));

        const wallsToCreate = sourceVersion.walls.map(w => ({
            label: w.label,
            position_x: w.position_x,
            position_y: w.position_y,
            position_z: w.position_z,
            rotation_x: w.rotation_x,
            rotation_y: w.rotation_y,
            rotation_z: w.rotation_z,
            width: w.width,
            height: w.height,
            thickness: w.thickness,
            color: w.color,
            isLocked: w.isLocked,
        }));

        const instancesToCreate = sourceVersion.instances.map(inst => ({
            artworkId: inst.artworkId,
            medium: inst.medium ?? 'frame',
            _wallIndex: inst.wallId ? (oldWallIdToIndex.get(inst.wallId) ?? null) : null,
            position_x: inst.position_x,
            position_y: inst.position_y,
            position_z: inst.position_z,
            rotation_x: inst.rotation_x,
            rotation_y: inst.rotation_y,
            rotation_z: inst.rotation_z,
            scale_x: inst.scale_x,
            scale_y: inst.scale_y,
            scale_z: inst.scale_z,
        }));

        const newVersion = await prisma.$transaction(async (tx) => {
            const version = await tx.exhibitionVersion.create({
                data: {
                    exhibition_id: exhibitionId,
                    created_by_user_id: userId,
                    parent_version_id: versionId,
                    branch_name: 'main',
                    comment: `Merge: ${sourceVersion.branch_name} → main`,
                    is_published: false,
                    walls: { create: wallsToCreate }
                },
                include: { walls: true }
            });

            const newWallIds = version.walls.map(w => w.id);
            const instancesWithWallIds = instancesToCreate.map((inst: any) => {
                const wallIndex = inst._wallIndex;
                const wallId = (wallIndex != null && wallIndex >= 0 && wallIndex < newWallIds.length)
                    ? newWallIds[wallIndex]
                    : null;
                const { _wallIndex, ...cleanInst } = inst;
                return { ...cleanInst, wallId, versionId: version.id };
            });

            if (instancesWithWallIds.length > 0) {
                await tx.artworkInstance.createMany({ data: instancesWithWallIds });
            }

            return tx.exhibitionVersion.findUniqueOrThrow({
                where: { id: version.id },
                include: {
                    instances: { include: { artwork: { include: { asset: true } } } },
                    walls: true,
                    creator: { select: { id: true, email: true } }
                }
            });
        });

        res.status(201).json(newVersion);
    } catch (e) {
        console.error('Failed to merge version:', e);
        res.status(500).json({ error: 'Failed to merge version' });
    }
});
