import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

export const versionsRouter = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_dev_key';

// Shared auth middleware
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

const createVersionSchema = z.object({
    comment: z.string().min(1).max(500),
    sourceVersionId: z.number().optional(), // Version to optionally link as parent
    instances: z.array(z.object({
        artworkId: z.number().optional(),
        assetId: z.number().optional(),
        position_x: z.number(),
        position_y: z.number(),
        position_z: z.number(),
        rotation_x: z.number(),
        rotation_y: z.number(),
        rotation_z: z.number(),
        scale_x: z.number(),
        scale_y: z.number(),
        scale_z: z.number(),
    })).optional()
});

// GET /exhibitions/:exhibitionId/versions — list all versions for an exhibition
versionsRouter.get('/exhibitions/:exhibitionId/versions', authenticate, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.exhibitionId, 10);
        if (isNaN(exhibitionId)) return res.status(400).json({ error: 'Invalid exhibition ID' });

        // Verify user has access (exhibition belongs to one of their projects)
        const exhibition = await prisma.exhibition.findFirst({
            where: {
                id: exhibitionId,
                project: { ownerId: req.user.userId }
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
                is_published: true,
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

        // Verify ownership via project
        const exhibition = await prisma.exhibition.findFirst({
            where: {
                id: exhibitionId,
                project: { ownerId: req.user.userId }
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

        // Verify ownership
        const exhibition = await prisma.exhibition.findFirst({
            where: {
                id: exhibitionId,
                project: { ownerId: userId }
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
                        position_x: inst.position_x,
                        position_y: inst.position_y,
                        position_z: inst.position_z,
                        rotation_x: inst.rotation_x,
                        rotation_y: inst.rotation_y,
                        rotation_z: inst.rotation_z,
                        scale_x: inst.scale_x,
                        scale_y: inst.scale_y,
                        scale_z: inst.scale_z,
                    });
                }
            }
        } else if (sourceVersionId) {
            const sourceInstances = await prisma.artworkInstance.findMany({
                where: { versionId: sourceVersionId }
            });
            instancesToCreate = sourceInstances.map(inst => ({
                artworkId: inst.artworkId,
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

        // Create new version with instances
        const newVersion = await prisma.exhibitionVersion.create({
            data: {
                exhibition_id: exhibitionId,
                created_by_user_id: userId,
                parent_version_id: sourceVersionId,
                comment: data.comment,
                is_published: false,
                instances: {
                    create: instancesToCreate
                }
            },
            include: {
                instances: {
                    include: {
                        artwork: { include: { asset: true } }
                    }
                },
                creator: {
                    select: { id: true, email: true }
                }
            }
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
