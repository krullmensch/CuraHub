import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireProf } from '../lib/middleware';

export const exhibitionsRouter = Router();
const prisma = new PrismaClient();

// --- Poster upload setup ---
const posterDir = path.join(__dirname, '../../uploads/posters');
if (!fs.existsSync(posterDir)) {
    fs.mkdirSync(posterDir, { recursive: true });
}

const posterStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, posterDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = `${Date.now().toString().slice(-6)}-${uuidv4().split('-')[0]}`;
        cb(null, `poster-${uniqueSuffix}${ext}`);
    },
});

const posterUpload = multer({
    storage: posterStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Nur Bilddateien sind erlaubt'));
        }
    },
});

// --- Helpers ---

/** Verify the caller owns the exhibition (or is admin). Returns exhibition or null. */
async function verifyOwnership(exhibitionId: number, userId: number, userRole: string) {
    if (userRole === 'admin') {
        return prisma.exhibition.findUnique({ where: { id: exhibitionId } });
    }
    return prisma.exhibition.findFirst({
        where: { id: exhibitionId, project: { ownerId: userId } },
    });
}

// --- Schemas ---
const addCollaboratorSchema = z.object({
    email: z.string().email(),
});

const updateExhibitionSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),
});

// --- Routes ---

// GET /exhibitions/:id — get exhibition details (owner or admin)
exhibitionsRouter.get('/:id', authenticate, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.id, 10);
        if (isNaN(exhibitionId)) return res.status(400).json({ error: 'Ungültige Ausstellungs-ID' });

        const exhibition = await verifyOwnership(exhibitionId, req.user.userId, req.user.role);
        if (!exhibition) return res.status(404).json({ error: 'Ausstellung nicht gefunden' });

        res.json(exhibition);
    } catch {
        res.status(500).json({ error: 'Ausstellung konnte nicht geladen werden' });
    }
});

// PUT /exhibitions/:id — update exhibition metadata (prof/admin only)
exhibitionsRouter.put('/:id', authenticate, requireProf, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.id, 10);
        if (isNaN(exhibitionId)) return res.status(400).json({ error: 'Ungültige Ausstellungs-ID' });

        const data = updateExhibitionSchema.parse(req.body);
        const exhibition = await verifyOwnership(exhibitionId, req.user.userId, req.user.role);
        if (!exhibition) return res.status(404).json({ error: 'Ausstellung nicht gefunden' });

        const updateData: Record<string, unknown> = {};
        if (data.title !== undefined) updateData.title = data.title;
        if (data.start_date !== undefined) {
            updateData.start_date = data.start_date ? new Date(data.start_date) : null;
        }
        if (data.end_date !== undefined) {
            updateData.end_date = data.end_date ? new Date(data.end_date) : null;
        }

        const updated = await prisma.exhibition.update({
            where: { id: exhibitionId },
            data: updateData,
        });

        // Sync project name when title changes
        if (data.title) {
            await prisma.project.update({
                where: { id: exhibition.projectId },
                data: { name: data.title },
            });
        }

        res.json(updated);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Ungültige Eingabedaten', details: (error as any).errors });
        }
        console.error(error);
        res.status(500).json({ error: 'Ausstellung konnte nicht aktualisiert werden' });
    }
});

// POST /exhibitions/:id/poster — upload poster image (prof/admin only)
exhibitionsRouter.post('/:id/poster', authenticate, requireProf, posterUpload.single('poster'), async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.id, 10);
        if (isNaN(exhibitionId)) return res.status(400).json({ error: 'Ungültige Ausstellungs-ID' });

        const exhibition = await verifyOwnership(exhibitionId, req.user.userId, req.user.role);
        if (!exhibition) return res.status(404).json({ error: 'Ausstellung nicht gefunden' });

        if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

        // Process image with Sharp: resize + convert to WebP
        const outputFilename = `poster-${Date.now().toString().slice(-6)}-${uuidv4().split('-')[0]}.webp`;
        const outputPath = path.join(posterDir, outputFilename);

        await sharp(req.file.path)
            .resize({ width: 1920, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(outputPath);

        // Delete the original uploaded file
        fs.unlinkSync(req.file.path);

        // Delete old poster if exists
        if (exhibition.poster_path) {
            const oldPath = path.resolve(exhibition.poster_path);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        const relativePath = `server/uploads/posters/${outputFilename}`;

        await prisma.exhibition.update({
            where: { id: exhibitionId },
            data: { poster_path: relativePath },
        });

        res.json({ poster_path: relativePath });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Poster konnte nicht hochgeladen werden' });
    }
});

// DELETE /exhibitions/:id/poster — remove poster (prof/admin only)
exhibitionsRouter.delete('/:id/poster', authenticate, requireProf, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.id, 10);
        if (isNaN(exhibitionId)) return res.status(400).json({ error: 'Ungültige Ausstellungs-ID' });

        const exhibition = await verifyOwnership(exhibitionId, req.user.userId, req.user.role);
        if (!exhibition) return res.status(404).json({ error: 'Ausstellung nicht gefunden' });

        if (exhibition.poster_path) {
            const oldPath = path.resolve(exhibition.poster_path);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        await prisma.exhibition.update({
            where: { id: exhibitionId },
            data: { poster_path: null },
        });

        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Poster konnte nicht entfernt werden' });
    }
});

// GET /exhibitions/:id/eligible-collaborators — list curator/prof users not yet added (prof/admin only)
exhibitionsRouter.get('/:id/eligible-collaborators', authenticate, requireProf, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.id, 10);
        if (isNaN(exhibitionId)) return res.status(400).json({ error: 'Ungültige Ausstellungs-ID' });

        const exhibition = await verifyOwnership(exhibitionId, req.user.userId, req.user.role);
        if (!exhibition) return res.status(404).json({ error: 'Ausstellung nicht gefunden' });

        // Get existing collaborator user IDs
        const existing = await prisma.exhibitionCollaborator.findMany({
            where: { exhibitionId },
            select: { userId: true },
        });
        const existingIds = existing.map((c) => c.userId);
        // Exclude the requesting user as well
        existingIds.push(req.user.userId);

        const users = await prisma.user.findMany({
            where: {
                role: { in: ['curator', 'prof'] },
                id: { notIn: existingIds },
            },
            select: { id: true, email: true, role: true },
            orderBy: { email: 'asc' },
        });

        res.json(users);
    } catch {
        res.status(500).json({ error: 'Benutzer konnten nicht geladen werden' });
    }
});

// POST /exhibitions/:id/collaborators — invite a user to collaborate (prof/admin only)
exhibitionsRouter.post('/:id/collaborators', authenticate, requireProf, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.id, 10);
        if (isNaN(exhibitionId)) return res.status(400).json({ error: 'Ungültige Ausstellungs-ID' });

        const { email } = addCollaboratorSchema.parse(req.body);
        const inviterId = req.user.userId;

        // Verify inviter has access to this exhibition (must own it)
        const exhibition = await verifyOwnership(exhibitionId, inviterId, req.user.role);
        if (!exhibition) return res.status(404).json({ error: 'Ausstellung nicht gefunden' });

        // Find the user to invite
        const invitee = await prisma.user.findUnique({ where: { email } });
        if (!invitee) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

        if (invitee.id === inviterId) {
            return res.status(400).json({ error: 'Du kannst dich nicht selbst einladen' });
        }

        // Only curator or prof can be added as collaborators
        if (invitee.role !== 'curator' && invitee.role !== 'prof') {
            return res.status(400).json({ error: 'Nur Kuratoren und Professoren können als Kollaborateure eingeladen werden' });
        }

        // Create or ignore if already a collaborator
        const collaborator = await prisma.exhibitionCollaborator.upsert({
            where: { exhibitionId_userId: { exhibitionId, userId: invitee.id } },
            update: {},
            create: { exhibitionId, userId: invitee.id, invitedById: inviterId },
            include: { user: { select: { id: true, email: true, role: true } } },
        });

        res.status(201).json(collaborator);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
        }
        res.status(500).json({ error: 'Kollaborateur konnte nicht hinzugefügt werden' });
    }
});

// DELETE /exhibitions/:id/collaborators/:userId — remove a collaborator (prof/admin only)
exhibitionsRouter.delete('/:id/collaborators/:userId', authenticate, requireProf, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.id, 10);
        const userId = parseInt(req.params.userId, 10);
        if (isNaN(exhibitionId) || isNaN(userId)) {
            return res.status(400).json({ error: 'Ungültige ID' });
        }

        const exhibition = await verifyOwnership(exhibitionId, req.user.userId, req.user.role);
        if (!exhibition) return res.status(404).json({ error: 'Ausstellung nicht gefunden' });

        const existing = await prisma.exhibitionCollaborator.findUnique({
            where: { exhibitionId_userId: { exhibitionId, userId } }
        });
        if (!existing) return res.status(404).json({ error: 'Kollaborateur nicht gefunden' });

        await prisma.exhibitionCollaborator.delete({
            where: { exhibitionId_userId: { exhibitionId, userId } }
        });

        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Kollaborateur konnte nicht entfernt werden' });
    }
});

// GET /exhibitions/:id/collaborators — list collaborators (owner or admin)
exhibitionsRouter.get('/:id/collaborators', authenticate, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.id, 10);
        if (isNaN(exhibitionId)) return res.status(400).json({ error: 'Ungültige Ausstellungs-ID' });

        const exhibition = await verifyOwnership(exhibitionId, req.user.userId, req.user.role);
        if (!exhibition) return res.status(404).json({ error: 'Ausstellung nicht gefunden' });

        const collaborators = await prisma.exhibitionCollaborator.findMany({
            where: { exhibitionId },
            include: {
                user: { select: { id: true, email: true, role: true } },
                invitedBy: { select: { id: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
        });

        res.json(collaborators);
    } catch {
        res.status(500).json({ error: 'Kollaborateure konnten nicht geladen werden' });
    }
});
