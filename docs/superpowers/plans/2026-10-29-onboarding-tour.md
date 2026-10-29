# Onboarding-Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guided spotlight tour that starts once per account the first time a curator opens the dashboard, skippable and restartable from the wiki.

**Architecture:** Server stores `User.onboarding_completed_at` and returns it with the user. Client: pure modules in `src/lib/tour/` (steps, body markup, placement, auto-start predicate), a `tourStore`, one `TourOverlay` (SVG mask spotlight + popover) and a `TourAutoStart`, both mounted in `EditorLayout`. Targets are found through `data-tour` attributes.

**Tech Stack:** React 19, Zustand 5, Tailwind 3, Vitest (node env); Express 5, Prisma 5 (MySQL), Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-10-29-onboarding-tour-design.md` — read it; texts (§3) and placement rules (§4) are copied from there.

## Global Constraints

- All user-facing strings German, du-form; step texts exactly as spec §3.
- Never run the app, a dev server, a local DB or a headless browser locally. Locally allowed: `npm run lint`, `npm run test`, `npm run build`, `cd server && npm test` (DB-free tests only), `npx prisma validate`, `npx prisma generate`. Browser checks happen on the test stack (Task 8).
- No new npm dependencies.
- Server tests must not need a database: put logic in `server/src/lib/` with injected lookups (pattern: `server/src/lib/localLogin.ts` + `localLogin.test.ts`); route tests only for cases that answer before any DB call.
- No `dangerouslySetInnerHTML`, no markdown library for step bodies.
- Tour flag is its own store (`tourStore.active`), never `editorStore.isDialogOpen`.
- Breakpoint for the bottom sheet: viewport width `< 640`. Spotlight padding `8`, popover gap `12`, viewport margin `16`, popover width `320`, mask corner radius `8`, dimming `rgba(0,0,0,0.6)`, transition `200ms`.
- Run `npm run lint` before calling any frontend task done.

## Review Focus

1. **Persisted user from before the deploy** (`onboardingCompletedAt` is `undefined` in localStorage) must not start the tour before `/auth/me` answered, and must start it once it answered `null`. → test in Task 3 (`shouldAutoStartTour`).
2. **Logout (or any unmount of `EditorLayout`) while the tour is active** must not leave `tourStore.active = true`, or the 3D controls stay locked after the next login. → `reset()` in Task 3, called on overlay unmount in Task 6.
3. **`refreshAuth` answers 401** → `logout()` must also reset `meLoaded`, so the next user on the same browser waits for their own `/auth/me`. → test in Task 3.
4. **Malformed step body** (unclosed `*` or `<kbd>`) renders as plain text, never throws or drops text. → test in Task 2.
5. **`start()` while a tour is already active** (wiki restart racing the auto start) keeps the current step instead of jumping back. → test in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/prisma/schema.prisma`, `server/prisma/migrations/20261029120000_user_onboarding/migration.sql` | new column |
| `server/src/lib/onboarding.ts` (new) | `publicUser()` serializer + `completeOnboarding()` with injected DB calls |
| `server/src/routes/auth.ts` | three responses use `publicUser`, new `POST /me/onboarding` |
| `src/lib/tour/steps.ts` (new) | `TourStep`, `TOUR_STEPS`, `stepsForRole`, `parseTourBody` |
| `src/lib/tour/placement.ts` (new) | `spotlightRect`, `popoverPosition` |
| `src/lib/tour/autoStart.ts` (new) | `shouldAutoStartTour` predicate |
| `src/lib/tour/onboardingApi.ts` (new) | `completeOnboarding()` client call |
| `src/store/authStore.ts` | field, `meLoaded`, `markOnboardingCompleted`, export `roleAtLeast`, `partialize` |
| `src/store/tourStore.ts` (new) | tour state machine |
| `src/components/tour/TourOverlay.tsx`, `TourBody.tsx`, `TourAutoStart.tsx` (new) | UI |
| `src/lib/controlsLock.ts`, `src/pages/EditorPage.tsx` | tour guard |
| `src/components/EditorLayout.tsx`, `ProjectSelector.tsx`, `AssetSidebar.tsx`, `PropertiesPanel.tsx`, `VersionPanel.tsx`, `src/pages/EditorPage.tsx` | `data-tour` attributes, mounting |
| `src/components/WikiModal.tsx` | „Tour starten" button |
| `src/wiki/project-management.md`, `CLAUDE.md` | docs |

---

### Task 1: Server — column, serializer, endpoint

**Files:**
- Modify: `server/prisma/schema.prisma` (model `User`)
- Create: `server/prisma/migrations/20261029120000_user_onboarding/migration.sql`
- Create: `server/src/lib/onboarding.ts`
- Modify: `server/src/routes/auth.ts` (responses at lines ~84, ~114, ~141; new route after `GET /me`)
- Test: `server/src/tests/onboarding.test.ts`

**Interfaces:**
- Produces (HTTP): every `user` object from `POST /auth/login`, `POST /auth/local-login`, `GET /auth/me` = `{ id, email, role, onboardingCompletedAt: string | null }`. `POST /auth/me/onboarding` → `200 { onboardingCompletedAt: string }`, `401` without/invalid token or unknown user.

- [ ] **Step 1: Add column.** In `User`: `onboarding_completed_at DateTime?` with comment `// null = tour not finished or skipped yet`. Migration SQL, written by hand (no local DB):

```sql
-- ONBOARDING: null = the dashboard tour has not been finished or skipped yet (every existing account sees it once).
ALTER TABLE `User` ADD COLUMN `onboarding_completed_at` DATETIME(3) NULL;
```

Run: `cd server && npx prisma validate && npx prisma generate` → Expected: "The schema … is valid", client generated.

- [ ] **Step 2: Write failing tests** in `server/src/tests/onboarding.test.ts`:

```ts
import request from 'supertest';
import { app } from '../index';
import { publicUser, completeOnboarding } from '../lib/onboarding';

const at = new Date('2026-10-29T10:00:00.000Z');
const base = { id: 7, email: 'a@hsbi.de', role: 'curator', password_hash: 'x', createdAt: at };

describe('publicUser', () => {
  it('returns id, email, role and the onboarding timestamp as ISO', () => {
    expect(publicUser({ ...base, onboarding_completed_at: at }))
      .toEqual({ id: 7, email: 'a@hsbi.de', role: 'curator', onboardingCompletedAt: '2026-10-29T10:00:00.000Z' });
  });
  it('returns null when the tour was never completed', () => {
    expect(publicUser({ ...base, onboarding_completed_at: null }).onboardingCompletedAt).toBeNull();
  });
  it('never leaks the password hash', () => {
    expect(publicUser({ ...base, onboarding_completed_at: null })).not.toHaveProperty('password_hash');
  });
});

describe('completeOnboarding', () => {
  it('sets the timestamp only where it is still null and returns the stored value', async () => {
    const setIfNull = jest.fn(async () => undefined);
    const read = jest.fn(async () => ({ onboarding_completed_at: at }));
    await expect(completeOnboarding({ setIfNull, read }, 7, new Date('2026-10-30T00:00:00Z'))).resolves.toBe(at);
    expect(setIfNull).toHaveBeenCalledWith(7, new Date('2026-10-30T00:00:00Z'));
  });
  it('keeps the first timestamp on a second call', async () => {
    const read = jest.fn(async () => ({ onboarding_completed_at: at }));
    await expect(completeOnboarding({ setIfNull: async () => undefined, read }, 7, new Date())).resolves.toBe(at);
  });
  it('returns null for an unknown user', async () => {
    await expect(completeOnboarding({ setIfNull: async () => undefined, read: async () => null }, 7, new Date())).resolves.toBeNull();
  });
});

describe('POST /auth/me/onboarding', () => {
  it('answers 401 without a token', async () => {
    expect((await request(app).post('/auth/me/onboarding')).status).toBe(401);
  });
  it('answers 401 with an invalid token', async () => {
    const res = await request(app).post('/auth/me/onboarding').set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run** `cd server && npx jest src/tests/onboarding.test.ts` → Expected: FAIL, cannot find module `../lib/onboarding`.

- [ ] **Step 4: Implement `server/src/lib/onboarding.ts`:**
  - `publicUser(user: Pick<User, 'id' | 'email' | 'role' | 'onboarding_completed_at'>): { id: number; email: string; role: string; onboardingCompletedAt: string | null }` (`User` type from `@prisma/client`).
  - `interface OnboardingStore { setIfNull(userId: number, at: Date): Promise<void>; read(userId: number): Promise<{ onboarding_completed_at: Date | null } | null> }`
  - `completeOnboarding(store: OnboardingStore, userId: number, now: Date): Promise<Date | null>` — `setIfNull` then `read`; returns `read(...)?.onboarding_completed_at ?? null`.
  - `prismaOnboardingStore(prisma: PrismaClient): OnboardingStore` — `setIfNull` = `prisma.user.updateMany({ where: { id, onboarding_completed_at: null }, data: { onboarding_completed_at: at } })`, `read` = `findUnique` with `select: { onboarding_completed_at: true }`.

- [ ] **Step 5: Wire routes.** In `auth.ts`: replace the three inline `{ id, email, role }` objects with `publicUser(user)`. Add `authRouter.post('/me/onboarding', authenticate, …)` (`authenticate` is already imported): `completeOnboarding(prismaOnboardingStore(prisma), req.user!.userId, new Date())`; `null` → `401 { error: 'User not found' }`; else `200 { onboardingCompletedAt: at.toISOString() }`; catch → `500 { error: 'Speichern fehlgeschlagen' }`.

- [ ] **Step 6: Run** `cd server && npx jest src/tests/onboarding.test.ts && npx tsc --noEmit` → Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add server/prisma server/src/lib/onboarding.ts server/src/routes/auth.ts server/src/tests/onboarding.test.ts
git commit -m "Store per account whether the dashboard tour was completed"
```

---

### Task 2: Steps and body markup

**Files:**
- Create: `src/lib/tour/steps.ts`
- Test: `src/lib/tour/steps.test.ts`
- Modify: `src/store/authStore.ts` (only: `export` in front of `function roleAtLeast`)

**Interfaces:**
- Consumes: `AppRole`, `roleAtLeast(role, min)` from `@/store/authStore`.
- Produces:
  - `type TourSide = 'top' | 'bottom' | 'left' | 'right'`
  - `interface TourStep { id: string; target?: string; placement?: TourSide; title: string; body: string; minRole?: AppRole }`
  - `TOUR_STEPS: readonly TourStep[]` (11 entries, ids/targets/minRoles from spec §3 table)
  - `stepsForRole(role: AppRole): TourStep[]`
  - `type TourBodyPart = { kind: 'text' | 'kbd' | 'em'; text: string }`
  - `parseTourBody(body: string): TourBodyPart[]`

- [ ] **Step 1: Write failing tests:**

```ts
import { describe, expect, it } from 'vitest';
import { TOUR_STEPS, stepsForRole, parseTourBody } from './steps';

const ids = (role: Parameters<typeof stepsForRole>[0]) => stepsForRole(role).map((s) => s.id);

describe('stepsForRole', () => {
  it('gives curators the nine base steps in order', () => {
    expect(ids('curator')).toEqual(['welcome', 'projects', 'assets', 'place', 'tools', 'properties', 'versions', 'publish', 'wiki']);
  });
  it('adds project settings for profs', () => {
    expect(ids('prof')).toEqual(['welcome', 'projects', 'assets', 'place', 'tools', 'properties', 'versions', 'publish', 'settings', 'wiki']);
  });
  it('adds settings and user management for admins', () => {
    expect(ids('admin')).toHaveLength(11);
    expect(ids('admin').slice(8)).toEqual(['settings', 'users', 'wiki']);
  });
  it('has a target for every step but the welcome step', () => {
    expect(TOUR_STEPS.filter((s) => !s.target).map((s) => s.id)).toEqual(['welcome']);
  });
});

describe('parseTourBody', () => {
  it('splits kbd and emphasis', () => {
    expect(parseTourBody('Unter *Assets* drück <kbd>G</kbd>.')).toEqual([
      { kind: 'text', text: 'Unter ' }, { kind: 'em', text: 'Assets' },
      { kind: 'text', text: ' drück ' }, { kind: 'kbd', text: 'G' }, { kind: 'text', text: '.' },
    ]);
  });
  it('keeps unclosed markers as plain text', () => {
    expect(parseTourBody('a *b <kbd>c')).toEqual([{ kind: 'text', text: 'a *b <kbd>c' }]);
  });
  it('parses every step body without losing characters', () => {
    for (const s of TOUR_STEPS) {
      const plain = s.body.replace(/<\/?kbd>/g, '').replace(/\*/g, '');
      expect(parseTourBody(s.body).map((p) => p.text).join('')).toBe(plain);
    }
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/tour/steps.test.ts` → Expected: FAIL, module not found.

- [ ] **Step 3: Implement `steps.ts`.** Titles/bodies verbatim from spec §3 (use the `*…*` / `<kbd>…</kbd>` markers as written there). Placements by step id: `projects`, `assets`, `publish`, `settings`, `users`, `wiki` → `bottom`; `place` → `right`; `properties` → `left`; `tools`, `versions` → `top`; `welcome` none. `parseTourBody`: one regex `/<kbd>(.+?)<\/kbd>|\*(.+?)\*/g` over the string, text between matches as `text` parts, empty text parts dropped.

- [ ] **Step 4: Run** `npx vitest run src/lib/tour/steps.test.ts` → PASS.

- [ ] **Step 5: Commit** `git add src/lib/tour/steps.ts src/lib/tour/steps.test.ts src/store/authStore.ts && git commit -m "Define the onboarding tour steps"`

---

### Task 3: Auth state, tour store, auto-start predicate

**Files:**
- Modify: `src/store/authStore.ts`
- Create: `src/lib/tour/onboardingApi.ts`, `src/store/tourStore.ts`, `src/lib/tour/autoStart.ts`
- Test: `src/store/tourStore.test.ts`, `src/lib/tour/autoStart.test.ts`, `src/store/authStore.test.ts`

**Interfaces:**
- Consumes: `stepsForRole`, `TourStep` (Task 2); server API (Task 1).
- Produces:
  - `authStore`: `User.onboardingCompletedAt?: string | null` (optional: old persisted users lack it); state `meLoaded: boolean`; action `markOnboardingCompleted(at: string): void`.
  - `completeOnboarding(): Promise<void>` in `onboardingApi.ts`.
  - `useTourStore` with `{ active: boolean; stepIndex: number; steps: TourStep[]; start(role: AppRole): void; next(): void; back(): void; finish(): void; skip(): void; reset(): void }`.
  - `shouldAutoStartTour(s: { meLoaded: boolean; isCurator: boolean; onboardingCompletedAt: string | null | undefined; pathname: string; plannerViewMode: string; wallEditorOpen: boolean; dialogOpen: boolean; tourActive: boolean }): boolean`.

- [ ] **Step 1: Write failing tests.**

`autoStart.test.ts` — with `const ok = { meLoaded: true, isCurator: true, onboardingCompletedAt: null, pathname: '/project', plannerViewMode: 'perspective', wallEditorOpen: false, dialogOpen: false, tourActive: false }`:
  - `shouldAutoStartTour(ok)` → `true`; also `true` for `pathname: '/exhibition/x/edit'`.
  - each of these alone → `false`: `meLoaded: false`; `isCurator: false`; `onboardingCompletedAt: '2026-10-29T10:00:00.000Z'`; `onboardingCompletedAt: undefined` (Review Focus 1); `pathname: '/exhibition/x/assets'`; `plannerViewMode: 'firstPerson'`; `wallEditorOpen: true`; `dialogOpen: true`; `tourActive: true`.

`authStore.test.ts` (stub `globalThis.fetch` with `vi.fn`; call `login('t1', { id: 1, email: 'a', role: 'curator' })` in `beforeEach`, because `refreshAuth` returns early without a token):
  - right after `login` → `meLoaded === false`.
  - after `refreshAuth()` answering `200 { token: 't2', user: { id: 1, email: 'a', role: 'curator', onboardingCompletedAt: null } }` → `meLoaded === true`, `user.onboardingCompletedAt === null`.
  - then `refreshAuth()` answering `401` → `meLoaded === false`, `user === null` (Review Focus 3).
  - `markOnboardingCompleted('2026-10-29T10:00:00.000Z')` sets `user.onboardingCompletedAt` to it.

`tourStore.test.ts` (`vi.mock('@/lib/tour/onboardingApi', () => ({ completeOnboarding: vi.fn(async () => {}) }))`, `reset()` in `beforeEach`):
  - `start('curator')` → `active`, `stepIndex 0`, `steps.length 9`; `start('admin')` → 11.
  - `back()` on step 0 stays 0; `next()` ×3 → `stepIndex 3`.
  - `start('curator')`, `next()`, `start('curator')` again → `stepIndex` still 1 (Review Focus 5).
  - `next()` on the last step → `active false` and `completeOnboarding` called once.
  - `skip()` → `active false`, `stepIndex 0`, `completeOnboarding` called once.
  - `reset()` while active → `active false`, `completeOnboarding` not called (Review Focus 2).

- [ ] **Step 2: Run** `npx vitest run src/lib/tour src/store/tourStore.test.ts src/store/authStore.test.ts` → FAIL.

- [ ] **Step 3: Implement.**
  - `authStore`: `meLoaded: false` initial; `refreshAuth` success sets `meLoaded: true`; `logout` sets `meLoaded: false`; add `markOnboardingCompleted` (no-op without user); `persist` options get `partialize: (s) => ({ token: s.token, user: s.user, isAuthenticated: s.isAuthenticated, isCurator: s.isCurator, isProf: s.isProf, isAdmin: s.isAdmin })`.
  - `onboardingApi.completeOnboarding`: POST with `Authorization: Bearer <token>`; `ok` → `markOnboardingCompleted(body.onboardingCompletedAt)`; any non-ok or thrown error → `markOnboardingCompleted(new Date().toISOString())`. Never throws. No token → only the local mark.
  - `tourStore`: `start` no-op while `active`; `finish`/`skip` = set closed state, then `void completeOnboarding()`; `next` on last step = `finish()`; `reset` = closed state only.
  - `autoStart.ts`: all conditions from the interface; assets route = `pathname.includes('/assets')`; completed = `onboardingCompletedAt !== null` (so `undefined` also blocks).

- [ ] **Step 4: Run** same command → PASS. Then `npm run lint`.

- [ ] **Step 5: Commit** `git commit -m "Add the tour store and the onboarding state in the auth store"` (add the six files).

---

### Task 4: Placement

**Files:**
- Create: `src/lib/tour/placement.ts`
- Test: `src/lib/tour/placement.test.ts`

**Interfaces:**
- Consumes: `TourSide` (Task 2).
- Produces:
  - `interface Rect { x: number; y: number; width: number; height: number }`
  - `spotlightRect(target: Rect, padding = 8): Rect`
  - `type PopoverPlacement = { mode: 'anchored'; x: number; y: number; side: TourSide } | { mode: 'centered' } | { mode: 'sheet' }`
  - `popoverPosition(target: Rect | null, popover: { width: number; height: number }, viewport: { width: number; height: number }, preferred: TourSide): PopoverPlacement`
  - constants `POPOVER_GAP = 12`, `VIEWPORT_MARGIN = 16`, `SHEET_BREAKPOINT = 640`

- [ ] **Step 1: Write failing tests** (viewport `1280×800`, popover `320×160`):
  - `spotlightRect({x:100,y:100,width:50,height:20})` → `{x:92,y:92,width:66,height:36}`.
  - target `{x:600,y:100,width:80,height:30}`, preferred `bottom` → `{ mode:'anchored', side:'bottom', y: 142, x: 480 }` (x = centre 640 − 160).
  - same target, preferred `top` → flips to `bottom` (no room above: 100 − 12 − 160 < 16).
  - target `{x:20,y:300,width:40,height:40}`, preferred `bottom` → `x` clamped to `16`.
  - target `{x:1200,y:300,width:60,height:200}`, preferred `right` → `side:'left'`, `x: 1200 - 12 - 320`.
  - target covering the viewport `{x:0,y:0,width:1280,height:800}` → `{ mode:'centered' }`.
  - `target null` → `{ mode:'centered' }`.
  - viewport width `639` → `{ mode:'sheet' }`, with or without target.

- [ ] **Step 2: Run** `npx vitest run src/lib/tour/placement.test.ts` → FAIL.

- [ ] **Step 3: Implement** per spec §4: order = preferred, opposite, then the remaining two in `top, bottom, left, right` order; a side fits when the popover box lies within `[VIEWPORT_MARGIN, viewport − VIEWPORT_MARGIN]` on that side's axis; cross axis centred on target then clamped.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `git commit -m "Place the tour popover next to its target"`

---

### Task 5: Tour body and overlay components

**Files:**
- Create: `src/components/tour/TourBody.tsx`, `src/components/tour/TourOverlay.tsx`

**Interfaces:**
- Consumes: `useTourStore` (Task 3), `parseTourBody` (Task 2), `spotlightRect`, `popoverPosition` (Task 4).
- Produces: `export function TourOverlay(): JSX.Element | null` (no props); `export function TourBody({ body }: { body: string })`.

No Vitest (node env, no DOM); checked by typecheck/lint here and on the test stack in Task 8.

- [ ] **Step 1: `TourBody`** renders `parseTourBody` parts: `text` → string, `em` → `<em className="not-italic text-zinc-100">`, `kbd` → `<kbd>` styled like the existing shortcut hints (look up the `kbd` styling used in `src/components/wall-editor/` and reuse its classes).

- [ ] **Step 2: `TourOverlay`** per spec §5, with these fixed choices:
  - `createPortal(…, document.body)`, root `fixed inset-0 z-[1000]` (above `WikiModal`; check its z-index and go one above).
  - Target measuring in one `useLayoutEffect` keyed on `stepIndex`: query `[data-tour="${step.target}"]`, zero-size = missing, `scrollIntoView({ block: 'nearest', inline: 'nearest' })` once, then `ResizeObserver` on target + `document.body` and a `resize` listener that re-measure into `useState<Rect | null>`. Popover size from a ref (`getBoundingClientRect`) after render.
  - SVG: `<mask id="tour-mask">` white rect + black `<rect rx={8}>` at `spotlightRect`; `<rect fill="rgba(0,0,0,0.6)" mask="url(#tour-mask)">` over the screen; outline rect `stroke` blue-500 at 60 % opacity, width 2. SVG has `pointer-events: auto` and swallows clicks (`onPointerDown` → `preventDefault`).
  - Transitions: `transition-[x,y,width,height] duration-200` on the rects and `transition-transform duration-200` on the popover, both disabled under `motion-reduce:`.
  - Popover: `role="dialog" aria-modal="true" aria-labelledby="tour-title"`, width 320 (`sheet`: `inset-x-0 bottom-0 rounded-t-lg`, full width). Footer: „Überspringen" left (hidden on the last step), progress dots + `${stepIndex + 1} / ${steps.length}`, „Zurück" (hidden on step 0), primary button text „Los geht's" (step 0), „Fertig" (last), else „Weiter". Primary button gets focus on every step; Tab/Shift+Tab cycle inside the popover.
  - Keys: `window.addEventListener('keydown', h, true)` while active; `ArrowRight`/`Enter` → `next`, `ArrowLeft` → `back`, `Escape` → `skip`; those keys `preventDefault()` + `stopImmediatePropagation()`.
  - Unmount cleanup: `useEffect(() => () => useTourStore.getState().reset(), [])` (Review Focus 2).

- [ ] **Step 3: Run** `npm run lint && npx tsc -b --noEmit` (or `npm run build` if `tsc -b --noEmit` is not configured) → Expected: no errors.

- [ ] **Step 4: Commit** `git commit -m "Draw the tour spotlight and popover"`

---

### Task 6: Wiring — targets, auto start, controls guard, restart

**Files:**
- Create: `src/components/tour/TourAutoStart.tsx`
- Modify: `src/components/EditorLayout.tsx`, `src/components/ProjectSelector.tsx`, `src/components/AssetSidebar.tsx`, `src/components/PropertiesPanel.tsx`, `src/components/VersionPanel.tsx`, `src/pages/EditorPage.tsx`, `src/lib/controlsLock.ts`, `src/components/WikiModal.tsx`
- Test: `src/lib/tour/targets.test.ts`

**Interfaces:**
- Consumes: `TOUR_STEPS`, `shouldAutoStartTour`, `useTourStore`, `TourOverlay`.
- Produces: `export function TourAutoStart(): null`.

- [ ] **Step 1: Write failing test** `targets.test.ts`: read every `.tsx` under `src/` with `node:fs` (`readdirSync(…, { recursive: true })`), join the contents, and for each `TOUR_STEPS` step with a `target` expect the source to contain `data-tour="${target}"`. Test name: `every tour target exists as a data-tour attribute`.

- [ ] **Step 2: Run** `npx vitest run src/lib/tour/targets.test.ts` → FAIL listing the ten missing targets.

- [ ] **Step 3: Add the attributes** at the places in spec §3's table: `project-selector` (ProjectSelector root), `nav-assets`, `nav-wiki`, `nav-users`, `viewer-button` (the `relative` wrapper div), `project-settings` (in EditorLayout header), `asset-sidebar`, `properties-panel`, `version-panel` (component roots), `editor-toolbar` (the container holding the `ToolButton`s in EditorPage, around line 745).

- [ ] **Step 4: Run** the test → PASS.

- [ ] **Step 5: Guards.** `controlsLock.ts`: both functions also return `true` when `useTourStore` `active`. `EditorPage.tsx` `handleKeyDown`: `if (useTourStore.getState().active) return;` directly after the book viewer guard.

- [ ] **Step 6: `TourAutoStart`** reads the predicate inputs with individual selectors (`authStore`: `meLoaded`, `isCurator`, `user?.onboardingCompletedAt`, `user?.role`; `editorStore`: `plannerViewMode`, `wallEditor !== null`, `isDialogOpen`; `useLocation().pathname`; `tourStore.active`), and in an effect calls `start(role)` once per mount (ref) when `shouldAutoStartTour` is true. Mount `<TourAutoStart />` and `<TourOverlay />` at the end of `EditorLayout`'s root div.

- [ ] **Step 7: Restart.** `WikiModal` header: button „Tour starten" (icon `Compass` from lucide, same ghost styling as the close button area), rendered only when `useAuthStore(s => s.isCurator)`; click → `onClose()` then `useTourStore.getState().start(role)`.

- [ ] **Step 8: Run** `npm run test && npm run lint && npm run build` → all pass.

- [ ] **Step 9: Commit** `git commit -m "Start the onboarding tour on the first dashboard visit"`

---

### Task 7: Documentation

**Files:**
- Modify: `src/wiki/project-management.md` (end of „Projekt-Dashboard"), `CLAUDE.md` (Architecture)

- [ ] **Step 1:** Wiki sentence: `Beim ersten Besuch führt dich eine kurze Tour durch das Dashboard. Du kannst sie jederzeit über **Tour starten** oben im Wiki erneut ansehen.`
- [ ] **Step 2:** `CLAUDE.md`: new `### Onboarding-Tour` section after „Live Collaboration": steps + texts in `lib/tour/steps.ts`, targets are `data-tour` attributes (`targets.test.ts` checks them), `User.onboarding_completed_at` via `POST /auth/me/onboarding`, `TourAutoStart` conditions (`lib/tour/autoStart.ts`), tour flag locks controls (`controlsLock`) and EditorPage keys, restart in `WikiModal`; new UI worth explaining needs a step + attribute.
- [ ] **Step 3:** `npm run test` (wiki `pages.test.ts` still green) → PASS.
- [ ] **Step 4: Commit** `git commit -m "Document the onboarding tour"`

---

### Task 8: Verify on the test stack

Deploy and check per the test-stack runbook in memory (`/root/CuraHub-test`, data in `./data`, `docker compose -p curahub-test up -d --build`; migrations apply on start). Ask the user before deploying.

- [ ] **Step 1:** `cd server && npm test` (DB-free suites) and `npm run test && npm run lint && npm run build` locally → pass. Note any pre-existing failures separately instead of fixing them.
- [ ] **Step 2:** Deploy the branch head to the test stack; confirm the migration ran (`onboarding_completed_at` column exists).
- [ ] **Step 3:** Run through spec §7 „Manual" list (headless Chrome over CDP through the SSH tunnel, see CLAUDE.md render-backend note): new account, existing account, skip on step 1, Esc mid-tour, prof 10 / admin 11 steps, step 8 centred without project, narrow window → sheet, collapsed sidebar → centred, G/R/S/V/E/⌘Z do nothing during the tour, dimmed-area clicks do nothing, wiki restart, logout mid-tour then login → controls not locked.
- [ ] **Step 4:** Report results with screenshots; no commit unless fixes were needed.
