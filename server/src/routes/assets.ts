import { Router, type Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { authenticate, userCanAccessProject } from '../lib/middleware';

export const assetsRouter = Router();
const prisma = new PrismaClient();

// GET all assets — supports projectId and folderId query params.
// SEC-03: authenticated; non-admins must pass a projectId they can access
// (owner, exhibition collaborator). Admins may omit projectId to list everything.
assetsRouter.get('/', authenticate, async (req: Request, res) => {
    try {
        const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;
        const folderIdRaw = req.query.folderId as string | undefined;
        const isAdmin = req.user!.role === 'admin';

        if (!isAdmin) {
            if (projectId === undefined || isNaN(projectId)) {
                return res.status(403).json({ error: 'projectId erforderlich' });
            }
            const canAccess = await userCanAccessProject(prisma, req.user!.userId, projectId, false);
            if (!canAccess) {
                return res.status(404).json({ error: 'Project not found' });
            }
        }

        const where: any = {};
        if (projectId && !isNaN(projectId)) {
            where.projectId = projectId;
        }

        if (folderIdRaw !== undefined) {
            if (folderIdRaw === 'unsorted' || folderIdRaw === 'null') {
                where.folderId = null;
            } else {
                const parsed = parseInt(folderIdRaw, 10);
                if (!isNaN(parsed)) {
                    where.folderId = parsed;
                }
            }
        }

        const assets = await prisma.asset.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { artwork: true }
        });
        res.json(assets);
    } catch (error) {
        console.error('Error fetching assets:', error);
        res.status(500).json({ error: 'Failed to fetch assets' });
    }
});

// PATCH /assets/:id — currently only supports moving an asset between folders.
// Authenticated; verifies project ownership and prevents cross-project moves.
const patchAssetSchema = z.object({
    folderId: z.union([z.number().int().positive(), z.null()]),
});

assetsRouter.patch('/:id', authenticate, async (req: Request, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

        const data = patchAssetSchema.parse(req.body);
        const isAdmin = req.user!.role === 'admin';

        const asset = await prisma.asset.findUnique({
            where: { id },
            include: { project: { select: { id: true, ownerId: true } } },
        });
        if (!asset) return res.status(404).json({ error: 'Asset not found' });

        // Ownership check: assets without a project are admin-only
        if (!isAdmin) {
            if (!asset.project || asset.project.ownerId !== req.user!.userId) {
                return res.status(404).json({ error: 'Asset not found' });
            }
        }

        // If moving into a folder, verify it belongs to the same project
        if (data.folderId !== null) {
            const folder = await prisma.folder.findUnique({
                where: { id: data.folderId },
                select: { id: true, projectId: true },
            });
            if (!folder) return res.status(404).json({ error: 'Folder not found' });
            if (folder.projectId !== asset.projectId) {
                return res.status(400).json({ error: 'Folder does not belong to this asset\u2019s project' });
            }
        }

        const updated = await prisma.asset.update({
            where: { id },
            data: { folderId: data.folderId },
            include: { artwork: true },
        });

        res.json(updated);
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation error', details: (e as any).errors });
        }
        console.error('Error updating asset:', e);
        res.status(500).json({ error: 'Failed to update asset' });
    }
});

// Uploads directory (real, resolved path) — used to guard against path traversal on delete.
const uploadsDir = path.resolve(__dirname, '../../uploads');

/**
 * Resolves a stored asset path (e.g. '/uploads/xyz.webp') to an absolute path on disk,
 * using only its basename joined onto the uploads dir. Returns null if the resolved
 * path would escape the uploads directory (SEC-05 path traversal guard).
 */
function resolveUploadPath(storedPath: string): string | null {
    const filename = path.basename(storedPath);
    const resolved = path.resolve(uploadsDir, filename);
    if (resolved !== uploadsDir && !resolved.startsWith(uploadsDir + path.sep)) {
        return null;
    }
    return resolved;
}

// DELETE asset — authenticated; ownership check mirrors PATCH above.
// SEC-05: unlinks path.basename(asset.path) (not the DB `filename`, which is the
// original/human-readable name), and only when no other Asset row still references
// the same physical file (shared via fileHash de-dup).
assetsRouter.delete('/:id', authenticate, async (req: Request, res) => {
    try {
        const assetId = parseInt(req.params.id, 10);
        if (isNaN(assetId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        const isAdmin = req.user!.role === 'admin';

        // Find asset first to get its path + verify ownership
        const asset = await prisma.asset.findUnique({
            where: { id: assetId },
            include: { project: { select: { id: true, ownerId: true } } },
        });

        if (!asset) {
            return res.status(404).json({ error: 'Asset not found' });
        }

        if (!isAdmin) {
            if (!asset.project || asset.project.ownerId !== req.user!.userId) {
                return res.status(404).json({ error: 'Asset not found' });
            }
        }

        // Delete from DB first, then clean up the filesystem
        await prisma.asset.delete({
            where: { id: assetId }
        });

        // VID-03: a video still processing keeps its original upload next to the target path.
        const deletedMeta = asset.metadata as Record<string, unknown> | null;
        if (asset.status === 'processing' && deletedMeta && typeof deletedMeta.sourceFile === 'string') {
            const sourcePath = resolveUploadPath(deletedMeta.sourceFile);
            if (sourcePath && sourcePath !== resolveUploadPath(asset.path)) {
                fs.rmSync(sourcePath, { force: true });
            }
        }

        // Delete the stored file — only if no other Asset row still points at it
        // (duplicate-detection can make several Asset rows share one physical file).
        if (asset.path) {
            const stillReferenced = await prisma.asset.count({ where: { path: asset.path } });
            if (stillReferenced === 0) {
                const filepath = resolveUploadPath(asset.path);
                if (!filepath) {
                    console.warn(`Refusing to delete file outside uploads dir for asset ${assetId}: ${asset.path}`);
                } else if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                } else {
                    console.warn(`File not found on disk: ${filepath}`);
                }
            }
        }

        // Also delete thumbnail if present (video poster frames) — same reference check
        if (asset.thumbnailPath) {
            const stillReferenced = await prisma.asset.count({ where: { thumbnailPath: asset.thumbnailPath } });
            if (stillReferenced === 0) {
                const thumbPath = resolveUploadPath(asset.thumbnailPath);
                if (!thumbPath) {
                    console.warn(`Refusing to delete thumbnail outside uploads dir for asset ${assetId}: ${asset.thumbnailPath}`);
                } else if (fs.existsSync(thumbPath)) {
                    fs.unlinkSync(thumbPath);
                }
                // Image thumbnails come in two sizes; only the 512 variant is stored in the DB
                // (see server/src/lib/thumbnails.ts), the 256 variant is derived by name.
                if (/-thumb-512\.webp$/.test(asset.thumbnailPath)) {
                    const thumb256Path = resolveUploadPath(asset.thumbnailPath.replace(/-thumb-512\.webp$/, '-thumb-256.webp'));
                    if (thumb256Path && fs.existsSync(thumb256Path)) {
                        fs.unlinkSync(thumb256Path);
                    }
                }
            }
        }

        res.json({ message: 'Asset deleted successfully' });

    } catch (error) {
        console.error('Error deleting asset:', error);
        // Check for constraint violation (e.g. if linked to artwork and cascade delete not set)
        // By default Prisma might error if Artwork depends on Asset.
        // Our schema has Asset optional in Artwork? No, Artwork has unique assetId.
        // Let's check Schema.
        // Artwork: asset Asset? @relation...
        // Asset: artwork Artwork?
        // If we delete Asset, Artwork's assetId becomes null? Or is it enforced?
        // Usually need to handle unlink. For now, strictly deleting.
        res.status(500).json({ error: 'Failed to delete asset' });
    }
});
