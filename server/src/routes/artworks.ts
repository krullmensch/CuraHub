import { Router, type Request } from 'express';
import { PrismaClient, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticate, requireCurator, userCanAccessProject } from '../lib/middleware';

export const artworksRouter = Router();
const prisma = new PrismaClient();

const artworkSchema = z.object({
  title: z.string().min(1),
  artist: z.string().optional(),
  year: z.string().optional(),
  description: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  // Asset info - now optional if assetId is provided
  assetId: z.number().optional(),
  asset: z.object({
      filename: z.string(),
      path: z.string(),
      mimetype: z.string(),
      size: z.number(),
      width: z.number().optional(),
      height: z.number().optional(),
      dpi: z.number().optional(),
      metadata: z.any().optional()
  }).optional()
});

// Create Artwork — authenticated curators only. If assetId is given, the linked
// asset's project must be accessible to the user (SEC-02).
artworksRouter.post('/', authenticate, requireCurator, async (req: Request, res) => {
  try {
      const data = artworkSchema.parse(req.body);
      const isAdmin = req.user!.role === 'admin';

      const artworkData: Prisma.ArtworkCreateInput = {
          title: data.title,
          artist: data.artist,
          year: data.year,
          description: data.description,
          width: data.width,
          height: data.height,
      };

      if (data.assetId) {
          // Link to existing asset — verify the asset's project is accessible
          const asset = await prisma.asset.findUnique({
              where: { id: data.assetId },
              select: { id: true, projectId: true },
          });
          if (!asset) return res.status(404).json({ error: 'Asset not found' });

          if (asset.projectId !== null) {
              const canAccess = await userCanAccessProject(prisma, req.user!.userId, asset.projectId, isAdmin);
              if (!canAccess) return res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt' });
          } else if (!isAdmin) {
              // Assets without a project are admin-only, mirroring assets.ts PATCH
              return res.status(404).json({ error: 'Asset not found' });
          }

          artworkData.asset = {
              connect: { id: data.assetId }
          };
      } else if (data.asset) {
          // Create new asset (Legacy flow / Direct upload without separate asset step).
          // This payload carries no projectId, so there is nothing to check ownership
          // against — restrict it to admins to avoid a bypass of the assetId check above.
          if (!isAdmin) {
              return res.status(403).json({ error: 'Keine Berechtigung für diese Aktion' });
          }
          artworkData.asset = {
              create: {
                  filename: data.asset.filename,
                  path: data.asset.path,
                  mimetype: data.asset.mimetype,
                  size: data.asset.size,
                  width: data.asset.width,
                  height: data.asset.height,
                  dpi: data.asset.dpi,
                  metadata: data.asset.metadata
              }
          };
      } else {
          return res.status(400).json({ error: 'Either assetId or asset data must be provided' });
      }

      const artwork = await prisma.artwork.create({
          data: artworkData,
          include: { asset: true }
      });

      res.status(201).json(artwork);
  } catch (error) {
      console.error(error);
      res.status(400).json({ error: 'Invalid data' });
  }
});

// Get all — authenticated curators only. Not currently called by the client
// (verified by grep); non-admins only see artworks whose asset belongs to a
// project they can access.
artworksRouter.get('/', authenticate, requireCurator, async (req: Request, res) => {
    try {
        const isAdmin = req.user!.role === 'admin';
        const artworks = await prisma.artwork.findMany({
            where: isAdmin ? {} : {
                asset: {
                    project: {
                        OR: [
                            { ownerId: req.user!.userId },
                            { exhibitions: { some: { collaborators: { some: { userId: req.user!.userId } } } } },
                        ],
                    },
                },
            },
            include: { asset: true },
        });
        res.json(artworks);
    } catch (e) {
        console.error('Failed to fetch artworks:', e);
        res.status(500).json({ error: 'Failed to fetch artworks' });
    }
});

// Update Artwork — authenticated curators only; the linked asset's project must be
// accessible to the user (SEC-02).
artworksRouter.put('/:id', authenticate, requireCurator, async (req: Request, res) => {
    const { id } = req.params;
    try {
        // Validation (partial update allowed)
        const schema = z.object({
            title: z.string().min(1).optional(),
            artist: z.string().optional(),
            year: z.string().optional(),
            description: z.string().optional(),
            width: z.number().positive().optional(),
            height: z.number().positive().optional(),
        });

        const data = schema.parse(req.body);
        const artworkId = parseInt(id);

        if (isNaN(artworkId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        const isAdmin = req.user!.role === 'admin';

        const existing = await prisma.artwork.findUnique({
            where: { id: artworkId },
            include: { asset: { select: { projectId: true } } },
        });
        if (!existing) return res.status(404).json({ error: 'Artwork not found' });

        if (!isAdmin) {
            const projectId = existing.asset?.projectId ?? null;
            if (projectId === null) {
                // Artworks whose asset has no project (or no asset at all) are admin-only
                return res.status(404).json({ error: 'Artwork not found' });
            }
            const canAccess = await userCanAccessProject(prisma, req.user!.userId, projectId, false);
            if (!canAccess) return res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt' });
        }

        const artwork = await prisma.artwork.update({
            where: { id: artworkId },
            data: {
                title: data.title,
                artist: data.artist,
                year: data.year,
                description: data.description,
                width: data.width,
                height: data.height,
            },
            include: { asset: true }
        });

        res.json(artwork);
    } catch (error) {
        console.error('Error updating artwork:', error);
        res.status(400).json({ error: 'Failed to update artwork' });
    }
});
