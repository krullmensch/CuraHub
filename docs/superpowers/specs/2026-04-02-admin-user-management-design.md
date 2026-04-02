# Admin User Management Dashboard — Design Spec
**Date:** 2026-04-02
**Status:** Approved

---

## Overview

Add an admin-only User Management Dashboard at `/users`. Admins can list all users, change roles, delete users (with full content cascade), and inspect/manage each user's exhibitions via a modal.

---

## Backend

### New file: `server/src/routes/admin.ts`

Mounted at `/admin` in `server/src/index.ts`. `requireAdmin` middleware applied once at the router level — all routes in this file are admin-only.

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/users` | All users: `id`, `email`, `role`, `createdAt`, `_count.projects` |
| `DELETE` | `/admin/users/:id` | Full cascade delete (see below) |
| `GET` | `/admin/users/:id/exhibitions` | Returns `{ owned: Exhibition[], collaborating: Exhibition[] }` |
| `DELETE` | `/admin/exhibitions/:id` | Delete a single exhibition (no ownership check) |
| `DELETE` | `/admin/exhibitions/:id/collaborators/:userId` | Remove collaborator (no ownership check) |

**Reused existing endpoint:**
`PATCH /auth/users/:id/role` — already accessible to admin with no role restrictions.

#### Cascade delete order for `DELETE /admin/users/:id`

1. `prisma.exhibitionCollaborator.deleteMany({ where: { invitedById: id } })` — clear the non-cascading `invitedById` FK
2. `prisma.project.deleteMany({ where: { ownerId: id } })` — cascades via Prisma schema: `Project → Exhibition → ExhibitionVersion → ArtworkInstance + ModularWall`
3. `prisma.user.delete({ where: { id } })` — `ExhibitionCollaborator` records where `userId === id` auto-cascade via schema

#### `GET /admin/users/:id/exhibitions` response shape
```ts
{
  owned: Array<{ id: number; title: string; projectName: string }>;
  collaborating: Array<{ id: number; title: string; projectName: string }>;
}
```

---

## Frontend

### New files
- `src/pages/UsersPage.tsx` — full dashboard table page
- `src/components/UserExhibitionsModal.tsx` — per-user exhibition management modal

### Route (`App.tsx`)
```tsx
<Route element={<ProtectedRoute requiredRole="admin" />}>
  <Route path="/users" element={<UsersPage />} />
</Route>
```

Placed alongside existing protected routes. Uses existing `ProtectedRoute` — admin (level 3) satisfies `requiredRole="admin"`.

### Navigation buttons

**Condition:** `isAdmin` from `useAuthStore((s) => s.isAdmin)` (already available in both components).

**HomePage (`src/pages/HomePage.tsx`):** Add after the "Ausstellungen" `<Link>` in the nav:
```tsx
{isAdmin && (
  <Link to="/users" className="text-zinc-400 hover:text-white text-xs tracking-[0.12em] uppercase transition-colors">
    Benutzerverwaltung
  </Link>
)}
```

**EditorLayout (`src/components/EditorLayout.tsx`):** Add after the "Wiki" `<a>` in the nav. Use `user?.role === 'admin'` — `user` is already destructured from `useAuthStore` in scope.

### `UsersPage.tsx`

- Full-screen dark page (`bg-zinc-950 text-white`), consistent with app design
- Fetches `GET /admin/users` on mount with auth token
- Table columns: **E-Mail**, **Rolle** (colored badge), **Registriert** (de-DE date), **Aktionen**
- **Rolle column:** `<select>` with options `user | curator | prof | admin`; on change → `PATCH /auth/users/:id/role` with `Authorization` header → optimistic state update
- **Aktionen per row:**
  - "Ausstellungen" button → opens `UserExhibitionsModal` for that user
  - "Löschen" button → inline confirmation (button toggles to "Bestätigen" / "Abbrechen") → `DELETE /admin/users/:id` → removes row from state
- **Self-protection:** role dropdown and delete button are disabled for the currently logged-in admin (`user.id === row.id`)
- German UI strings throughout

### `UserExhibitionsModal.tsx`

- Radix `Dialog` component (consistent with existing modal pattern)
- Opened from `UsersPage` with selected user `{ id, email }` as props
- On open: fetches `GET /admin/users/:id/exhibitions`
- **List A — Eigene Ausstellungen:** renders `owned[]`; each row has "Löschen" → `DELETE /admin/exhibitions/:id` → removes from list
- **List B — Kollaborationen:** renders `collaborating[]`; each row has "Zugang entziehen" → `DELETE /admin/exhibitions/:id/collaborators/:userId` → removes from list
- Both lists show empty state text if empty
- Optimistic updates: remove item from local state immediately on success

---

## Files Changed / Created

| File | Change |
|------|--------|
| `server/src/routes/admin.ts` | **New** — all admin endpoints |
| `server/src/index.ts` | Mount `adminRouter` at `/admin` |
| `src/pages/UsersPage.tsx` | **New** — dashboard page |
| `src/components/UserExhibitionsModal.tsx` | **New** — exhibitions modal |
| `src/App.tsx` | Add `/users` protected route |
| `src/pages/HomePage.tsx` | Add conditional "Benutzerverwaltung" nav link |
| `src/components/EditorLayout.tsx` | Add conditional "Benutzerverwaltung" nav link |

---

## Constraints & Notes

- UI language: **German** (all labels, toasts, error messages)
- No new Prisma migrations needed — no schema changes
- Role badge colors: `user` → zinc, `curator` → blue, `prof` → purple, `admin` → red
- The existing `PATCH /auth/users/:id/role` is reused as-is — admin has no role restrictions in the current logic
- `RestrictionZone` has no user FK, so it needs no special handling on user delete
