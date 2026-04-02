import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireAdmin } from '../lib/middleware';

export const adminRouter = Router();
const prisma = new PrismaClient();

// Apply requireAdmin to all routes in this file
adminRouter.use(authenticate, requireAdmin);

// ─── GET /admin/users ─────────────────────────────────────────────────────────

adminRouter.get('/users', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        _count: { select: { projects: true } },
      },
    });
    res.json(users);
  } catch {
    res.status(500).json({ error: 'Benutzer konnten nicht geladen werden' });
  }
});

// ─── DELETE /admin/users/:id ──────────────────────────────────────────────────

adminRouter.delete('/users/:id', async (req: any, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (isNaN(targetId)) return res.status(400).json({ error: 'Ungültige Benutzer-ID' });

    // Prevent self-deletion
    if (req.user.userId === targetId) {
      return res.status(400).json({ error: 'Du kannst deinen eigenen Account nicht löschen' });
    }

    const user = await prisma.user.findUnique({ where: { id: targetId } });
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

    // 1. Clear non-cascading invitedById FK
    await prisma.exhibitionCollaborator.deleteMany({ where: { invitedById: targetId } });
    // 2. Delete all projects (cascades → Exhibition → ExhibitionVersion → ArtworkInstance + ModularWall)
    await prisma.project.deleteMany({ where: { ownerId: targetId } });
    // 3. Delete user (ExhibitionCollaborator where userId cascades via schema)
    await prisma.user.delete({ where: { id: targetId } });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Benutzer konnte nicht gelöscht werden' });
  }
});

// ─── GET /admin/users/:id/exhibitions ─────────────────────────────────────────

adminRouter.get('/users/:id/exhibitions', async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (isNaN(targetId)) return res.status(400).json({ error: 'Ungültige Benutzer-ID' });

    const [ownedRaw, collaboratingRaw] = await Promise.all([
      prisma.exhibition.findMany({
        where: { project: { ownerId: targetId } },
        select: {
          id: true,
          title: true,
          slug: true,
          project: { select: { name: true } },
        },
      }),
      prisma.exhibition.findMany({
        where: { collaborators: { some: { userId: targetId } } },
        select: {
          id: true,
          title: true,
          slug: true,
          project: { select: { name: true } },
        },
      }),
    ]);

    const map = (e: { id: number; title: string; slug: string; project: { name: string } }) => ({
      id: e.id,
      title: e.title,
      slug: e.slug,
      projectName: e.project.name,
    });

    res.json({ owned: ownedRaw.map(map), collaborating: collaboratingRaw.map(map) });
  } catch {
    res.status(500).json({ error: 'Ausstellungen konnten nicht geladen werden' });
  }
});

// ─── DELETE /admin/exhibitions/:id ────────────────────────────────────────────

adminRouter.delete('/exhibitions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Ungültige Ausstellungs-ID' });

    const exhibition = await prisma.exhibition.findUnique({ where: { id } });
    if (!exhibition) return res.status(404).json({ error: 'Ausstellung nicht gefunden' });

    await prisma.exhibition.delete({ where: { id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Ausstellung konnte nicht gelöscht werden' });
  }
});

// ─── DELETE /admin/exhibitions/:id/collaborators/:userId ──────────────────────

adminRouter.delete('/exhibitions/:id/collaborators/:userId', async (req, res) => {
  try {
    const exhibitionId = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(exhibitionId) || isNaN(userId)) return res.status(400).json({ error: 'Ungültige ID' });

    const existing = await prisma.exhibitionCollaborator.findUnique({
      where: { exhibitionId_userId: { exhibitionId, userId } },
    });
    if (!existing) return res.status(404).json({ error: 'Kollaborateur nicht gefunden' });

    await prisma.exhibitionCollaborator.delete({
      where: { exhibitionId_userId: { exhibitionId, userId } },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Zugang konnte nicht entzogen werden' });
  }
});
