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
  artworkId: z.number(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  rotation: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  scale: z.number().optional()
});

instancesRouter.post('/', authenticate, async (req: any, res) => {
    try {
        const data = instanceSchema.parse(req.body);
        const userId = req.user.userId;

        // 1. Find or create an exhibition (Satellit)
        let exhibition = await prisma.exhibition.findUnique({ where: { slug: 'satellit' } });
        if (!exhibition) {
            exhibition = await prisma.exhibition.create({
                data: { title: 'Satellit Room', slug: 'satellit', room_id: 1 }
            });
        }

        // 2. Find the latest draft version for this user, or create one
        let version = await prisma.exhibitionVersion.findFirst({
            where: { 
                exhibition_id: exhibition.id, 
                created_by_user_id: userId,
                is_published: false
            },
            orderBy: { created_at: 'desc' }
        });

        if (!version) {
            version = await prisma.exhibitionVersion.create({
                data: {
                    exhibition_id: exhibition.id,
                    created_by_user_id: userId,
                    is_published: false
                }
            });
        }

        // 3. Create the instance
        const instance = await prisma.artworkInstance.create({
            data: {
                artworkId: data.artworkId,
                versionId: version.id,
                position_x: data.position.x,
                position_y: data.position.y,
                position_z: data.position.z,
                rotation_x: data.rotation.x,
                rotation_y: data.rotation.y,
                rotation_z: data.rotation.z,
                scale: data.scale || 1.0
            }
        });

        res.json(instance);

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to place instance' });
    }
});

instancesRouter.get('/', authenticate, async (req: any, res) => {
    try {
        const userId = req.user.userId;

        // 1. Find the 'satellit' exhibition 
        // (In a real app, we'd pass the slug/ID in query or params)
        const exhibition = await prisma.exhibition.findUnique({ where: { slug: 'satellit' } });
        if (!exhibition) return res.json([]);

        // 2. Find the latest draft version for this user
        const version = await prisma.exhibitionVersion.findFirst({
            where: { 
                exhibition_id: exhibition.id, 
                created_by_user_id: userId,
                is_published: false
            },
            orderBy: { created_at: 'desc' }
        });

        if (!version) return res.json([]);

        // 3. Get instances
        // We also need the Artwork and Asset data to render it (texture path, dimensions)
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
