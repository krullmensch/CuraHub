import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { authenticate, requireAdmin } from '../lib/middleware';
import { runSystemChecks, requestInfo, type CheckDeps } from '../lib/systemChecks';
import { getSetupState } from '../lib/setupState';
import { onVersionsDeleted } from '../lib/arExportJobs';
import { z } from 'zod';
import { legalSettingsSchema, saveLegalSettings } from '../lib/legalTexts';
import { createLocalAccount, prismaLocalAccountStore, resetLocalPassword } from '../lib/localAccounts';

export const adminRouter = Router();
const prisma = new PrismaClient();

// Apply requireAdmin to all routes in this file
adminRouter.use(authenticate, requireAdmin);

// ─── GET /admin/system ────────────────────────────────────────────────────────
// Read-only health of the instance (same checks as the setup wizard).

let systemDeps: CheckDeps | null = null;
export function setAdminSystemDeps(deps: CheckDeps): void {
  systemDeps = deps;
}

adminRouter.get('/system', async (req, res) => {
  if (!systemDeps) return res.status(503).json({ error: 'Systemcheck nicht verfügbar' });
  const checks = await runSystemChecks(systemDeps, requestInfo(req));
  res.json({
    checks,
    publicUrl: getSetupState()?.publicUrl ?? null,
    version: process.env.DEPLOYED_COMMIT || process.env.npm_package_version || 'unbekannt',
  });
});

// ─── PUT /admin/legal ─────────────────────────────────────────────────────────
// Operator details + optional own texts for Impressum / Datenschutzerklärung; read publicly via GET /public/legal.

adminRouter.put('/legal', async (req, res) => {
  const parsed = legalSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Rechtliche Angaben ungültig.' });
  try {
    res.json(await saveLegalSettings(prisma, parsed.data));
  } catch (error) {
    console.error('[Admin] save legal texts:', error);
    res.status(500).json({ error: 'Rechtliche Angaben konnten nicht gespeichert werden.' });
  }
});

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
        must_change_password: true,
        _count: { select: { projects: true } },
      },
    });
    res.json(users);
  } catch {
    res.status(500).json({ error: 'Benutzer konnten nicht geladen werden' });
  }
});

// ─── POST /admin/users ────────────────────────────────────────────────────────
// Creates a local account; the generated start password is in this response only.

const createAccountSchema = z.object({
  username: z.string().max(100),
  role: z.enum(['user', 'curator', 'prof', 'admin']),
});

adminRouter.post('/users', async (req, res) => {
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Benutzername und Rolle sind erforderlich.' });
  try {
    const result = await createLocalAccount(prismaLocalAccountStore(prisma), parsed.data);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    const { user, password } = result.value;
    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role }, password });
  } catch (error) {
    // Two admins creating the same name at once: the unique index decides.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Diesen Benutzernamen gibt es schon.' });
    }
    console.error('[Admin] create account:', error);
    res.status(500).json({ error: 'Konto konnte nicht angelegt werden.' });
  }
});

// ─── POST /admin/users/:id/password ───────────────────────────────────────────
// New start password for a local account (must be changed at the next login).

adminRouter.post('/users/:id/password', async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: 'Ungültige Benutzer-ID' });
  try {
    const result = await resetLocalPassword(prismaLocalAccountStore(prisma), targetId);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json({ password: result.value.password });
  } catch (error) {
    console.error('[Admin] reset password:', error);
    res.status(500).json({ error: 'Passwort konnte nicht zurückgesetzt werden.' });
  }
});

// ─── DELETE /admin/users/:id ──────────────────────────────────────────────────

adminRouter.delete('/users/:id', async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (isNaN(targetId)) return res.status(400).json({ error: 'Ungültige Benutzer-ID' });

    // Prevent self-deletion
    if (req.user!.userId === targetId) {
      return res.status(400).json({ error: 'Du kannst deinen eigenen Account nicht löschen' });
    }

    const user = await prisma.user.findUnique({ where: { id: targetId } });
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

    // The export rows cascade with the projects, their files don't.
    await onVersionsDeleted({ exhibition: { project: { ownerId: targetId } } });

    await prisma.$transaction(async (tx) => {
      // 1. Clear non-cascading invitedById FK
      await tx.exhibitionCollaborator.deleteMany({ where: { invitedById: targetId } });
      // 2. Delete all projects (cascades → Exhibition → ExhibitionVersion → ArtworkInstance + ModularWall)
      await tx.project.deleteMany({ where: { ownerId: targetId } });
      // 3. Delete user (ExhibitionCollaborator where userId cascades via schema)
      await tx.user.delete({ where: { id: targetId } });
    });

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
          project: { select: { name: true } },
        },
      }),
      prisma.exhibition.findMany({
        where: { collaborators: { some: { userId: targetId } } },
        select: {
          id: true,
          title: true,
          project: { select: { name: true } },
        },
      }),
    ]);

    const map = (e: { id: number; title: string; project: { name: string } }) => ({
      id: e.id,
      title: e.title,
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

    await onVersionsDeleted({ exhibition_id: id });
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
