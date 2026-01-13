import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

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

// Create Artwork
artworksRouter.post('/', async (req, res) => {
  try {
      const data = artworkSchema.parse(req.body);
      
      let artworkData: any = {
          title: data.title,
          artist: data.artist,
          year: data.year,
          description: data.description,
          width: data.width,
          height: data.height,
      };

      if (data.assetId) {
          // Link to existing asset
          artworkData.asset = {
              connect: { id: data.assetId }
          };
      } else if (data.asset) {
          // Create new asset (Legacy flow / Direct upload without separate asset step)
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

// Get all
artworksRouter.get('/', async (req, res) => {
    try {
        const artworks = await prisma.artwork.findMany({ include: { asset: true } });
        res.json(artworks);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch artworks' });
    }
});

// Update Artwork
artworksRouter.put('/:id', async (req, res) => {
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
