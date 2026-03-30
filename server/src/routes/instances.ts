import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

export const instancesRouter = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_dev_key';

// Middleware to check auth (duplicated for simplicity, ideally shared)
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

const instanceSchema = z.object({
  versionId: z.number(),
  artworkId: z.number().optional(),
  assetId: z.number().optional(),
  wallId: z.number().nullable().optional(),
  medium: z.enum(['frame', 'wallpaper', 'projector', 'display', 'model3d']).optional(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  rotation: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  scale: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional()
});

instancesRouter.post('/', authenticate, async (req: any, res) => {
    try {
        const data = instanceSchema.parse(req.body);
        const userId = req.user.userId;

        // 1. Verify version exists and user has access
        const version = await prisma.exhibitionVersion.findFirst({
            where: {
                id: data.versionId,
                exhibition: { project: { ownerId: userId } }
            }
        });

        if (!version) {
            return res.status(404).json({ error: 'Version not found or access denied' });
        }

        // 2. Resolve Artwork ID
        let artworkId = data.artworkId;
        
        if (!artworkId && data.assetId) {
            const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
            
            if (!asset) {
                return res.status(404).json({ error: 'Asset not found' });
            }
            
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
        } else if (!artworkId) {
             return res.status(400).json({ error: 'Missing artworkId or assetId' });
        }
        
        // Verify Artwork exists if it was passed directly
        if (data.artworkId) {
             const artwork = await prisma.artwork.findUnique({ where: { id: artworkId } });
             if (!artwork) {
                 return res.status(404).json({ error: 'Artwork not found' });
             }
        }

        // 3. Create the instance
        const instance = await prisma.artworkInstance.create({
            data: {
                artworkId: artworkId!,
                versionId: data.versionId,
                wallId: data.wallId ?? null,
                medium: data.medium ?? 'frame',
                position_x: data.position.x,
                position_y: data.position.y,
                position_z: data.position.z,
                rotation_x: data.rotation.x,
                rotation_y: data.rotation.y,
                rotation_z: data.rotation.z,
                scale_x: data.scale?.x ?? 1.0,
                scale_y: data.scale?.y ?? 1.0,
                scale_z: data.scale?.z ?? 1.0,
            }
        });

        res.json(instance);

    } catch (e) {
        console.error(e);
        
        if (e instanceof z.ZodError) {
             return res.status(400).json({ error: 'Validation Error', details: (e as any).errors });
        }
        
        res.status(500).json({ error: 'Failed to place instance', details: (e as Error).message });
    }
});

// GET /instances?versionId=123 — get all instances for a specific version
instancesRouter.get('/', authenticate, async (req: any, res) => {
    try {
        const userId = req.user.userId;
        const versionId = parseInt(req.query.versionId as string, 10);

        if (isNaN(versionId)) {
            return res.status(400).json({ error: 'versionId query parameter is required' });
        }

        // Verify user has access to this version
        const version = await prisma.exhibitionVersion.findFirst({
            where: {
                id: versionId,
                exhibition: { project: { ownerId: userId } }
            }
        });

        if (!version) return res.status(404).json({ error: 'Version not found or access denied' });

        const instances = await prisma.artworkInstance.findMany({
            where: { versionId: version.id },
            include: {
                artwork: {
                    include: { asset: true }
                }
            }
        });

        res.json(instances);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch instances' });
    }
});

// --- PATCH & DELETE ---

const patchInstanceSchema = z.object({
    wallId: z.number().nullable().optional(),
    medium: z.enum(['frame', 'wallpaper', 'projector', 'display', 'model3d']).optional(),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    rotation: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    scale: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
});

instancesRouter.patch('/:id', authenticate, async (req: any, res) => {
    try {
        const instanceId = parseInt(req.params.id, 10);
        if (isNaN(instanceId)) return res.status(400).json({ error: 'Invalid instance ID' });

        const data = patchInstanceSchema.parse(req.body);
        const userId = req.user.userId;

        // Verify ownership: instance version's exhibition's project must belong to user
        const existing = await prisma.artworkInstance.findUnique({
            where: { id: instanceId },
            include: { version: { include: { exhibition: { include: { project: true } } } } }
        });

        if (!existing) return res.status(404).json({ error: 'Instance not found' });
        if (existing.version.exhibition.project.ownerId !== userId) {
            return res.status(403).json({ error: 'Not authorized to modify this instance' });
        }

        // Build update payload
        const updateData: Record<string, number | string | null> = {};
        if (data.wallId !== undefined) {
            updateData.wallId = data.wallId;
        }
        if (data.medium !== undefined) {
            updateData.medium = data.medium;
        }
        if (data.position) {
            updateData.position_x = data.position.x;
            updateData.position_y = data.position.y;
            updateData.position_z = data.position.z;
        }
        if (data.rotation) {
            updateData.rotation_x = data.rotation.x;
            updateData.rotation_y = data.rotation.y;
            updateData.rotation_z = data.rotation.z;
        }
        if (data.scale) {
            updateData.scale_x = data.scale.x;
            updateData.scale_y = data.scale.y;
            updateData.scale_z = data.scale.z;
        }

        const updated = await prisma.artworkInstance.update({
            where: { id: instanceId },
            data: updateData,
        });

        res.json(updated);
    } catch (e) {
        console.error(e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: (e as any).errors });
        }
        res.status(500).json({ error: 'Failed to update instance' });
    }
});

instancesRouter.delete('/:id', authenticate, async (req: any, res) => {
    try {
        const instanceId = parseInt(req.params.id, 10);
        if (isNaN(instanceId)) return res.status(400).json({ error: 'Invalid instance ID' });

        const userId = req.user.userId;

        // Verify ownership via project
        const existing = await prisma.artworkInstance.findUnique({
            where: { id: instanceId },
            include: { version: { include: { exhibition: { include: { project: true } } } } }
        });

        if (!existing) return res.status(404).json({ error: 'Instance not found' });
        if (existing.version.exhibition.project.ownerId !== userId) {
            return res.status(403).json({ error: 'Not authorized to delete this instance' });
        }

        await prisma.artworkInstance.delete({ where: { id: instanceId } });
        res.json({ success: true, id: instanceId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to delete instance' });
    }
});
