import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, requireProf } from '../lib/middleware';

export const exhibitionsRouter = Router();
const prisma = new PrismaClient();

const addCollaboratorSchema = z.object({
    email: z.string().email(),
});

// POST /exhibitions/:id/collaborators — invite a user to collaborate (prof/admin only)
exhibitionsRouter.post('/:id/collaborators', authenticate, requireProf, async (req: any, res) => {
    try {
        const exhibitionId = parseInt(req.params.id, 10);
        if (isNaN(exhibitionId)) return res.status(400).json({ error: 'Ungültige Ausstellungs-ID' });

        const { email } = addCollaboratorSchema.parse(req.body);
        const inviterId = req.user.userId;

        // Verify inviter has access to this exhibition (must own it)
        const exhibition = await prisma.exhibition.findFirst({
            where: { id: exhibitionId, project: { ownerId: inviterId } }
        });
        if (!exhibition) return res.status(404).json({ error: 'Ausstellung nicht gefunden' });

        // Find the user to invite
        const invitee = await prisma.user.findUnique({ where: { email } });
        if (!invitee) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

        if (invitee.id === inviterId) {
            return res.status(400).json({ error: 'Du kannst dich nicht selbst einladen' });
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

        const inviterId = req.user.userId;

        // Verify caller owns the exhibition
        const exhibition = await prisma.exhibition.findFirst({
            where: { id: exhibitionId, project: { ownerId: inviterId } }
        });
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

        const userId = req.user.userId;

        const exhibition = await prisma.exhibition.findFirst({
            where: { id: exhibitionId, project: { ownerId: userId } }
        });
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
