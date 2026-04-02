# Admin User Management Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only `/users` route with a user table (role change, delete, exhibition management modal) plus conditional nav buttons in HomePage and EditorLayout.

**Architecture:** New `server/src/routes/admin.ts` router mounted at `/admin` with `requireAdmin` applied once. Two new frontend components (`UsersPage`, `UserExhibitionsModal`). All existing route files are untouched except `index.ts`. Role changes reuse the existing `PATCH /auth/users/:id/role` endpoint.

**Tech Stack:** Express 5, Prisma 5, TypeScript, React 19, Zustand, Radix UI Dialog, Tailwind CSS, Lucide React

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `server/src/routes/admin.ts` | All admin API endpoints |
| Modify | `server/src/index.ts` | Mount adminRouter at `/admin` |
| Create | `src/pages/UsersPage.tsx` | Admin dashboard table page |
| Create | `src/components/UserExhibitionsModal.tsx` | Per-user exhibition management modal |
| Modify | `src/App.tsx` | Add `/users` protected route |
| Modify | `src/pages/HomePage.tsx` | Add conditional "Benutzerverwaltung" nav link |
| Modify | `src/components/EditorLayout.tsx` | Add conditional "Benutzerverwaltung" nav link |

---

## Task 1: Backend — `admin.ts` route file

**Files:**
- Create: `server/src/routes/admin.ts`

- [ ] **Step 1: Create `server/src/routes/admin.ts`**

```typescript
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
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
```

- [ ] **Step 2: Mount adminRouter in `server/src/index.ts`**

Add after the existing imports and before the route registrations:

```typescript
import { adminRouter } from './routes/admin';
```

Add after line `app.use('/exhibitions', exhibitionsRouter);`:

```typescript
app.use('/admin', adminRouter);
```

- [ ] **Step 3: Verify the server compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/admin.ts server/src/index.ts
git commit -m "feat: add admin API endpoints (GET users, DELETE user, exhibitions management)"
```

---

## Task 2: Frontend — `UsersPage.tsx`

**Files:**
- Create: `src/pages/UsersPage.tsx`

- [ ] **Step 1: Create `src/pages/UsersPage.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Trash2, Layers, ArrowLeft } from 'lucide-react';
import { UserExhibitionsModal } from '../components/UserExhibitionsModal';

type AppRole = 'user' | 'curator' | 'prof' | 'admin';

interface UserRow {
  id: number;
  email: string;
  role: AppRole;
  createdAt: string;
  _count: { projects: number };
}

const ROLE_BADGE: Record<AppRole, string> = {
  user: 'bg-zinc-700 text-zinc-300',
  curator: 'bg-blue-900 text-blue-300',
  prof: 'bg-purple-900 text-purple-300',
  admin: 'bg-red-900 text-red-300',
};

const ROLE_LABELS: Record<AppRole, string> = {
  user: 'User',
  curator: 'Curator',
  prof: 'Prof',
  admin: 'Admin',
};

export const UsersPage = () => {
  const token = useAuthStore((s) => s.token);
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [modalUser, setModalUser] = useState<{ id: number; email: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setUsers(await res.json());
    } catch {
      setError('Benutzer konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleRoleChange = async (userId: number, newRole: AppRole) => {
    try {
      const res = await fetch(`/auth/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error();
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch {
      alert('Rollenänderung fehlgeschlagen.');
    }
  };

  const handleDelete = async (userId: number) => {
    try {
      const res = await fetch(`/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setConfirmDeleteId(null);
    } catch {
      alert('Benutzer konnte nicht gelöscht werden.');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 bg-black/80 backdrop-blur-md border-b border-white/5">
        <Link to="/" className="font-display text-xl font-light tracking-wide text-white">
          Cura<span className="font-semibold">Hub</span>
        </Link>
        <Link to="/" className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs tracking-[0.12em] uppercase transition-colors">
          <ArrowLeft className="w-3 h-3" />
          Zurück
        </Link>
      </nav>

      <div className="pt-24 px-8 pb-16 max-w-5xl mx-auto">
        <h1 className="font-display text-3xl font-light text-white mb-2">Benutzerverwaltung</h1>
        <p className="text-zinc-500 text-sm mb-10">{users.length} registrierte Benutzer</p>

        {loading && (
          <div className="text-zinc-500 text-sm">Wird geladen…</div>
        )}

        {error && (
          <div className="text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && (
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs tracking-wide uppercase">E-Mail</th>
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs tracking-wide uppercase">Rolle</th>
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs tracking-wide uppercase">Registriert</th>
                  <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs tracking-wide uppercase">Projekte</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
                      <td className="px-5 py-4 text-zinc-200">{u.email}</td>
                      <td className="px-5 py-4">
                        {isSelf ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[u.role]}`}>
                            {ROLE_LABELS[u.role]}
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as AppRole)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 cursor-pointer hover:border-zinc-500 transition-colors"
                          >
                            <option value="user">User</option>
                            <option value="curator">Curator</option>
                            <option value="prof">Prof</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </td>
                      <td className="px-5 py-4 text-zinc-400">
                        {new Date(u.createdAt).toLocaleDateString('de-DE', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </td>
                      <td className="px-5 py-4 text-zinc-400">{u._count.projects}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setModalUser({ id: u.id, email: u.email })}
                            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded transition-all"
                          >
                            <Layers className="w-3 h-3" />
                            Ausstellungen
                          </button>
                          {!isSelf && (
                            confirmDeleteId === u.id ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleDelete(u.id)}
                                  className="text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 px-3 py-1.5 rounded transition-all"
                                >
                                  Bestätigen
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1.5 rounded transition-colors"
                                >
                                  Abbrechen
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(u.id)}
                                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 border border-zinc-700 hover:border-red-800 px-3 py-1.5 rounded transition-all"
                              >
                                <Trash2 className="w-3 h-3" />
                                Löschen
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalUser && (
        <UserExhibitionsModal
          userId={modalUser.id}
          userEmail={modalUser.email}
          onClose={() => setModalUser(null)}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/UsersPage.tsx
git commit -m "feat: add UsersPage admin dashboard"
```

---

## Task 3: Frontend — `UserExhibitionsModal.tsx`

**Files:**
- Create: `src/components/UserExhibitionsModal.tsx`

- [ ] **Step 1: Create `src/components/UserExhibitionsModal.tsx`**

```tsx
import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuthStore } from '../store/authStore';
import { X, Trash2, UserMinus } from 'lucide-react';

interface ExhibitionEntry {
  id: number;
  title: string;
  slug: string;
  projectName: string;
}

interface Props {
  userId: number;
  userEmail: string;
  onClose: () => void;
}

export const UserExhibitionsModal = ({ userId, userEmail, onClose }: Props) => {
  const token = useAuthStore((s) => s.token);
  const [owned, setOwned] = useState<ExhibitionEntry[]>([]);
  const [collaborating, setCollaborating] = useState<ExhibitionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchExhibitions = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/admin/users/${userId}/exhibitions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setOwned(data.owned);
        setCollaborating(data.collaborating);
      } catch {
        setError('Ausstellungen konnten nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    };
    fetchExhibitions();
  }, [userId, token]);

  const handleDeleteExhibition = async (id: number) => {
    try {
      const res = await fetch(`/admin/exhibitions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setOwned((prev) => prev.filter((e) => e.id !== id));
    } catch {
      alert('Ausstellung konnte nicht gelöscht werden.');
    }
  };

  const handleRevokeAccess = async (exhibitionId: number) => {
    try {
      const res = await fetch(`/admin/exhibitions/${exhibitionId}/collaborators/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setCollaborating((prev) => prev.filter((e) => e.id !== exhibitionId));
    } catch {
      alert('Zugang konnte nicht entzogen werden.');
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[80vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl">
          <div className="flex items-start justify-between mb-6">
            <div>
              <Dialog.Title className="text-white font-display text-xl font-light">
                Ausstellungen
              </Dialog.Title>
              <Dialog.Description className="text-zinc-500 text-sm mt-1">
                {userEmail}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="text-zinc-500 hover:text-white transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {loading && <p className="text-zinc-500 text-sm">Wird geladen…</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {!loading && !error && (
            <div className="space-y-8">
              {/* List A: Owned exhibitions */}
              <section>
                <h3 className="text-xs tracking-[0.2em] uppercase text-zinc-500 font-medium mb-3">
                  Eigene Ausstellungen
                </h3>
                {owned.length === 0 ? (
                  <p className="text-zinc-600 text-sm">Keine eigenen Ausstellungen.</p>
                ) : (
                  <ul className="space-y-2">
                    {owned.map((e) => (
                      <li key={e.id} className="flex items-center justify-between border border-zinc-800 rounded-lg px-4 py-3 bg-zinc-950/50">
                        <div>
                          <p className="text-zinc-200 text-sm">{e.title}</p>
                          <p className="text-zinc-600 text-xs mt-0.5">{e.projectName}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteExhibition(e.id)}
                          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 border border-zinc-700 hover:border-red-800 px-3 py-1.5 rounded transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                          Löschen
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* List B: Collaborating exhibitions */}
              <section>
                <h3 className="text-xs tracking-[0.2em] uppercase text-zinc-500 font-medium mb-3">
                  Kollaborationen
                </h3>
                {collaborating.length === 0 ? (
                  <p className="text-zinc-600 text-sm">Keine Kollaborationen.</p>
                ) : (
                  <ul className="space-y-2">
                    {collaborating.map((e) => (
                      <li key={e.id} className="flex items-center justify-between border border-zinc-800 rounded-lg px-4 py-3 bg-zinc-950/50">
                        <div>
                          <p className="text-zinc-200 text-sm">{e.title}</p>
                          <p className="text-zinc-600 text-xs mt-0.5">{e.projectName}</p>
                        </div>
                        <button
                          onClick={() => handleRevokeAccess(e.id)}
                          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-orange-400 border border-zinc-700 hover:border-orange-800 px-3 py-1.5 rounded transition-all"
                        >
                          <UserMinus className="w-3 h-3" />
                          Zugang entziehen
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/UserExhibitionsModal.tsx
git commit -m "feat: add UserExhibitionsModal for per-user exhibition management"
```

---

## Task 4: Frontend — Wire up route and nav buttons

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/components/EditorLayout.tsx`

- [ ] **Step 1: Add the `/users` protected route in `src/App.tsx`**

Add the import at the top of `src/App.tsx`:
```tsx
import { UsersPage } from './pages/UsersPage';
```

Add a new protected route block after the existing `<Route element={<ProtectedRoute requiredRole="curator" />}>` block (before the 404 route):
```tsx
{/* Protected Routes — admin only */}
<Route element={<ProtectedRoute requiredRole="admin" />}>
  <Route path="/users" element={<UsersPage />} />
</Route>
```

- [ ] **Step 2: Add "Benutzerverwaltung" link in `src/pages/HomePage.tsx`**

Add `isAdmin` selector (add alongside the existing `isAuthenticated` selector near the top of `HomePage`):
```tsx
const isAdmin = useAuthStore((s) => s.isAdmin);
```

In the nav `<div className="flex items-center gap-6 text-sm">`, add directly after the "Ausstellungen" `<Link>`:
```tsx
{isAdmin && (
  <Link
    to="/users"
    className="text-zinc-400 hover:text-white text-xs tracking-[0.12em] uppercase transition-colors"
  >
    Benutzerverwaltung
  </Link>
)}
```

- [ ] **Step 3: Add "Benutzerverwaltung" link in `src/components/EditorLayout.tsx`**

In the `<nav className="flex gap-4 ml-2 text-sm font-medium">`, add after the "Wiki" `<a>` element:
```tsx
{user?.role === 'admin' && (
  <Link
    to="/users"
    className="transition-colors text-gray-400 hover:text-white"
  >
    Benutzerverwaltung
  </Link>
)}
```

- [ ] **Step 4: Verify frontend TypeScript compiles**

```bash
npm run build 2>&1 | head -40
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/HomePage.tsx src/components/EditorLayout.tsx
git commit -m "feat: wire up /users route and conditional admin nav buttons"
```

---

## Task 5: Manual smoke test

- [ ] **Step 1: Start both servers**

Terminal 1:
```bash
cd server && npm run dev
```

Terminal 2:
```bash
npm run dev
```

- [ ] **Step 2: Test nav visibility**

Log in as a non-admin user — "Benutzerverwaltung" link must NOT appear in the homepage nav or editor nav.

Log in as an admin — "Benutzerverwaltung" link MUST appear in both navs.

- [ ] **Step 3: Test route protection**

Navigate to `/users` while logged in as a non-admin — should redirect to `/kein-zugriff`.

Navigate to `/users` while logged in as admin — should show the users table.

- [ ] **Step 4: Test role change**

Change a non-admin user's role via the dropdown — verify the dropdown updates and the backend persists (reload the page, user should retain the new role).

- [ ] **Step 5: Test exhibition modal**

Open the "Ausstellungen" modal for a user with owned exhibitions — verify List A shows correctly. Delete one — verify it disappears from the list.

Open the modal for a user who is a collaborator — verify List B shows correctly. Revoke access — verify it disappears.

- [ ] **Step 6: Test user deletion**

Click "Löschen" on a test user — confirm the two-step confirmation flow works. Confirm deletion — verify the row disappears and the user can no longer log in.

- [ ] **Step 7: Test self-protection**

Verify the admin's own row has a static role badge (no dropdown) and no "Löschen" button.

- [ ] **Step 8: Final lint check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat: complete admin user management dashboard"
```
