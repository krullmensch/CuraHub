# Onboarding-Tour im Dashboard — Design Spec
**Date:** 2026-10-29
**Status:** Approved (in chat), awaiting spec review

---

## Overview

The first time a curator (role `curator` or higher) opens the dashboard (`EditorLayout`, routes `/project` and `/exhibition/:projectSlug/edit`), a guided tour starts: the screen dims, one real UI element at a time is cut out of the dimming (spotlight), and a small popover next to it explains it in one or two sentences. About two minutes, 9 steps for curators, 10 for profs, 11 for admins. Skippable at any time, restartable from the wiki.

Decisions taken in chat:

- Form: **guided tour** that only explains (the user does not have to perform actions to advance). No interactive/hands-on mode, no checklist.
- Scope: **one main tour** on the dashboard. Deep topics (2D wall editor details, frames, collaboration, books, scale figure) are not steps of their own; the last step points to the wiki.
- Roles: **one extra step per role** — prof+ sees „Projekteinstellungen", admin additionally „Benutzerverwaltung".
- Existing accounts: **everyone sees the tour once**, including accounts that existed before the deploy.
- Technique: **own build** (no driver.js / react-joyride): pure step and placement modules + one overlay component.
- „Seen" state is stored **per account on the server** (`User.onboarding_completed_at`), not in localStorage.

Success: a new person can afterwards, without help, pick or create a project, upload media, place a work on a wall, switch to first person, save a version and publish.

Out of scope: tours on other pages (asset library, wall editor, viewer), waiting for user actions, demo content, a „Erste Schritte" checklist, analytics on how far people get, live sync of tour state between tabs, opening collapsed sidebars for a step.

---

## 1. Database & API

### Prisma (`server/prisma/schema.prisma`) — one additive migration

```prisma
model User {
  // existing fields …
  onboarding_completed_at DateTime?   // null = tour not finished or skipped yet
}
```

No default value and no backfill: every existing row is `null`, so every existing account sees the tour once (decision above).

### Routes (`server/src/routes/auth.ts`)

- `POST /auth/login`, `POST /auth/local-login` and `GET /auth/me` return `onboardingCompletedAt` (ISO string or `null`) inside `user`, next to `id`, `email`, `role`.
- New: `POST /auth/me/onboarding` — JWT required (same header parsing as `GET /auth/me`; 401 without/invalid token, 401 if the user no longer exists). Sets `onboarding_completed_at = now()` only when it is still `null` (idempotent: a second call keeps the first timestamp). Answers `{ onboardingCompletedAt }`.
- No reset endpoint: restarting the tour from the wiki is purely client-side and does not touch the column.

The route does not touch version content, so no `publishChange` is needed.

---

## 2. Frontend state

### `authStore` (`src/store/authStore.ts`)

- `User` gains `onboardingCompletedAt: string | null`. Persisted users from before the deploy have no such field; treat `undefined` like „unknown", not like `null`.
- New non-persisted field `meLoaded: boolean` (`false` on start and after `logout`), set to `true` when `refreshAuth()` succeeds. The `persist` config has no `partialize` today; add one that persists everything except `meLoaded` and the actions.
- New action `markOnboardingCompleted(at: string)` updates `user.onboardingCompletedAt` locally.

The auto start waits for `meLoaded`, so a stale persisted `user` never decides whether the tour starts.

### `tourStore` (`src/store/tourStore.ts`, new)

Zustand store in the style of `bookViewerStore`:

```ts
interface TourState {
  active: boolean;
  stepIndex: number;
  steps: TourStep[];          // already filtered for the role when the tour starts
  start: (role: AppRole) => void;
  next: () => void;           // on the last step = finish()
  back: () => void;           // no-op on step 0
  finish: () => void;         // „Fertig"
  skip: () => void;           // „Überspringen", Esc
}
```

`finish` and `skip` both close the tour (`active = false`, `stepIndex = 0`) and call `completeOnboarding()` (below). They do not wait for the request.

### `src/lib/tour/onboardingApi.ts` (new)

`completeOnboarding()`: `POST /auth/me/onboarding` with the token from `authStore`. On success → `markOnboardingCompleted(res.onboardingCompletedAt)`. On any failure → `markOnboardingCompleted(new Date().toISOString())` locally anyway, no toast, no retry. Effect: the tour does not come back in this session; on the next session `refreshAuth` delivers `null` again and the tour shows once more. Accepted on purpose — showing it twice is better than blocking anyone.

### Controls lock

- `src/lib/controlsLock.ts`: `useControlsLocked()` and `isControlsLocked()` also return `true` while `useTourStore` `active` is `true` — a separate flag, not `isDialogOpen` (the metadata dialog already owns that one and would clear it on close).
- `src/pages/EditorPage.tsx` `handleKeyDown`: add `if (useTourStore.getState().active) return;` next to the existing book viewer guard, because the editor's key handler does not ask the controls lock today. This blocks G/R/S, E, V, ⌘A, ⌘D, Delete and undo/redo while the tour runs.

---

## 3. Steps (`src/lib/tour/steps.ts`, pure)

```ts
export interface TourStep {
  id: string;
  target?: string;            // value of a data-tour attribute; none = centred
  placement?: 'top' | 'bottom' | 'left' | 'right';   // preferred side, default 'bottom'
  title: string;
  body: string;               // may contain <kbd>…</kbd> markers, rendered by the overlay
  minRole?: AppRole;          // default 'curator'
}

export const TOUR_STEPS: TourStep[];
export function stepsForRole(role: AppRole): TourStep[];
```

`stepsForRole` filters by `minRole` with the same role hierarchy as `authStore` (export `roleAtLeast` from `authStore` and reuse it, don't copy it). Role steps are filtered by role only, never by whether their target exists.

| # | id | target (`data-tour`) | where the attribute goes | minRole |
|---|---|---|---|---|
| 1 | `welcome` | — | — | |
| 2 | `projects` | `project-selector` | root element of `ProjectSelector` | |
| 3 | `assets` | `nav-assets` | „Assets" link in `EditorLayout` header | |
| 4 | `place` | `asset-sidebar` | root of `AssetSidebar` | |
| 5 | `tools` | `editor-toolbar` | toolbar container in `EditorPage` (the one holding the `ToolButton`s) | |
| 6 | `properties` | `properties-panel` | root of `PropertiesPanel` | |
| 7 | `versions` | `version-panel` | root of `VersionPanel` | |
| 8 | `publish` | `viewer-button` | „Viewer testen" button wrapper in `EditorLayout` | |
| 9 | `settings` | `project-settings` | „Projekteinstellungen" button in `EditorLayout` | `prof` |
| 10 | `users` | `nav-users` | „Benutzerverwaltung" link in `EditorLayout` | `admin` |
| 11 | `wiki` | `nav-wiki` | „Wiki" link in `EditorLayout` header | |

Texts (German, du-form like the wiki, at most two sentences):

1. **Willkommen bei CuraHub** — In zwei Minuten zeigen wir dir, wie du eine Ausstellung planst, prüfst und veröffentlichst.
2. **Deine Projekte** — Jedes Projekt ist eine Ausstellung mit eigenen Medien und Versionen. Hier wechselst du oder legst ein neues an.
3. **Medien hochladen** — Unter *Assets* lädst du Bilder, Videos, 3D-Modelle, Gaussian Splats und PDFs hoch, auch ganze Ordner per Drag & Drop.
4. **Werke platzieren** — Zieh ein Werk aus der Seitenleiste in den Raum, es rastet an Wand oder Boden ein. Klick wählt aus, <kbd>⇧</kbd> wählt mehrere.
5. **Werkzeuge** — <kbd>G</kbd> <kbd>R</kbd> <kbd>S</kbd> verschieben, drehen, skalieren. <kbd>E</kbd> öffnet den 2D-Wandeditor fürs genaue Hängen, <kbd>V</kbd> die Ego-Perspektive (<kbd>Esc</kbd> zurück).
6. **Eigenschaften** — Hier stellst du Maße, Rahmen und Passepartout des ausgewählten Werks ein.
7. **Versionen** — Änderungen werden automatisch gespeichert. Mit *Version speichern* hältst du einen Stand fest, mit Branches probierst du Varianten aus.
8. **Veröffentlichen** — Besucher:innen sehen nur die veröffentlichte Version. *Viewer testen* zeigt dir den öffentlichen Rundgang.
9. **Projekteinstellungen** — Hier änderst du Name und Poster der Ausstellung und lädst Kurator:innen ein.
10. **Benutzerverwaltung** — Hier vergibst du Rollen und hebst Ausstellungen auf der Startseite hervor.
11. **Mehr im Wiki** — Rahmen, Zusammenarbeit, Bücher und alle Tastenkürzel findest du hier. Die Tour kannst du dort jederzeit neu starten.

Buttons: step 1 „Los geht's" + „Überspringen"; steps 2–10 „Zurück" / „Weiter" + „Überspringen"; last step „Zurück" / „Fertig".

`body` markup: only `<kbd>X</kbd>` and `*word*` (italic, for UI labels). The overlay splits the string into React nodes itself — no `dangerouslySetInnerHTML`, no markdown library.

---

## 4. Placement (`src/lib/tour/placement.ts`, pure)

```ts
interface Rect { x: number; y: number; width: number; height: number }
interface Viewport { width: number; height: number }

export function spotlightRect(target: Rect, padding?: number): Rect;          // default padding 8 px
export function popoverPosition(
  target: Rect | null,
  popover: { width: number; height: number },
  viewport: Viewport,
  preferred: 'top' | 'bottom' | 'left' | 'right',
): { mode: 'anchored'; x: number; y: number; side: Side } | { mode: 'centered' } | { mode: 'sheet' };
```

Rules:

- `target === null` → `centered`.
- `viewport.width < 640` → `sheet` (popover as a full-width bottom sheet; spotlight still drawn when there is a target).
- Otherwise try the preferred side, then the opposite side, then the two others; first side where the popover fits inside the viewport with a 12 px gap to the target and 16 px margin to the viewport edge wins. Along the other axis the popover is centred on the target and clamped into the margins.
- No side fits → `centered` (spotlight still drawn).

---

## 5. Components

### `src/components/tour/TourOverlay.tsx` (new)

Mounted once in `EditorLayout`, renders nothing while `active` is `false`. While active, a portal to `document.body`, `z-index` above header, sidebars and `WikiModal`:

- **Target lookup:** `document.querySelector('[data-tour="…"]')` on every step change. A target that exists but has zero width or height counts as missing. Re-measured on `resize` and through a `ResizeObserver` on the target and on `document.body`; when the target disappears during a step (window narrowed, sidebar collapsed) the step falls back to centred without a spotlight. On step change, `target.scrollIntoView({ block: 'nearest', inline: 'nearest' })` once.
- **Dimming + spotlight:** one full-screen SVG; a `<mask>` with a white full rect and a black rounded rect (`rx` 8) at `spotlightRect`; filled `rgba(0,0,0,0.6)`. A 2 px `blue-500/60` stroke around the cut-out. The SVG takes all pointer events: clicks outside the popover do nothing (no navigation, no accidental abort, no clicks on the highlighted element).
- **Popover:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the title, focus moved to the primary button on every step and kept inside the popover (Tab cycles). `bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl`, width 320 px (sheet: full width, bottom, rounded top). Title in Funnel Display (`font-display`), body `text-sm text-zinc-300` (Albert Sans), `<kbd>` styled like existing shortcut hints. Footer: „Überspringen" as a ghost link on the left; progress dots + „3 / 9"; „Zurück" (ghost) and the primary button (`bg-blue-600 hover:bg-blue-500`) on the right.
- **Motion:** spotlight rect and popover move with a 200 ms transition between steps; `prefers-reduced-motion: reduce` → no transition.
- **Keys:** one `keydown` listener on `window` in the capture phase while active. `ArrowRight`/`Enter` → `next`, `ArrowLeft` → `back`, `Escape` → `skip`; for these keys `preventDefault` + `stopImmediatePropagation`, so neither EditorPage's handler nor `WikiModal`'s Esc fires. Other keys are left alone (EditorPage ignores them via the tour guard).

### `src/components/tour/TourAutoStart.tsx` (new)

Mounted once in `EditorLayout`, renders nothing. Starts the tour once per mount when all of these hold:

- `authStore`: `meLoaded && isCurator && user.onboardingCompletedAt === null`
- route is not the asset library (`!location.pathname.includes('/assets')`), so the editor sidebars are mounted
- `editorStore.plannerViewMode !== 'firstPerson'` and `editorStore.wallEditor === null`
- `tourStore.active === false`
- no other dialog is open (`editorStore.isDialogOpen === false`)

When the conditions become true later (e.g. the user first lands on `/assets`, then opens the editor), the tour starts then. A ref ensures it starts at most once per mount; after `finish`/`skip` `onboardingCompletedAt` is set, so it does not start again.

### Restart: `WikiModal` (`src/components/WikiModal.tsx`)

A small button „Tour starten" in the modal's header. Click → close the wiki modal, then `tourStore.start(user.role)`. Only rendered for curators and up (the modal is also only reachable from `EditorLayout`). Restarting does not reset `onboarding_completed_at`; finishing or skipping a restarted tour calls the (idempotent) endpoint again, which is harmless.

### `data-tour` attributes

Added at the eleven places in the table in §3. They are plain attributes, no behaviour; nothing else reads them.

---

## 6. Error cases

| Case | Behaviour |
|---|---|
| `POST /auth/me/onboarding` fails (offline, 5xx) | Tour closes anyway, state set locally, no toast. Next session shows the tour again. |
| Two tabs open | Both may start the tour; whoever finishes first sets the timestamp, the other call is a no-op. No sync. |
| Target missing at step start (no active project → no „Viewer testen", collapsed sidebar, narrow window) | Step shown centred without spotlight, not skipped. |
| Target disappears during a step | Re-measure gives no rect → centred. |
| Target off screen | `scrollIntoView` once per step. |
| Role `user` | Never reaches `EditorLayout`; `TourAutoStart` checks `isCurator` as well. |
| Narrow viewport (< 640 px) | Bottom sheet. |
| User tries to switch mode / navigate during the tour | Not possible: editor keys guarded, 3D controls locked, overlay swallows clicks outside the popover. |
| Persisted user from before the deploy (`onboardingCompletedAt` undefined) | Auto start waits for `meLoaded`; `refreshAuth` fills in the real value. |
| `refreshAuth` fails | `meLoaded` stays `false` → no auto start this session. |

---

## 7. Testing

**Vitest (frontend)**

- `src/lib/tour/steps.test.ts`: `stepsForRole('curator')` → 9 steps, `'prof'` → 10 (incl. `settings`), `'admin'` → 11 (incl. `settings`, `users`); order preserved; first is `welcome`, last is `wiki`.
- Same file, maintenance check: every `target` in `TOUR_STEPS` appears as `data-tour="<target>"` in some file under `src/` (read the files with `node:fs` in the test). Renaming or removing an attribute breaks the test instead of silently degrading to a centred step.
- `src/lib/tour/placement.test.ts`: preferred side fits; flips to the opposite side at the viewport edge; clamps along the cross axis; no side fits → `centered`; `null` target → `centered`; width < 640 → `sheet`; `spotlightRect` padding.
- `src/store/tourStore.test.ts`: `start` filters by role and resets to step 0; `back` on step 0 and `next` on the last step; `finish` and `skip` close the tour and call `completeOnboarding` exactly once (mocked); a rejected request still leaves the tour closed and `onboardingCompletedAt` set locally.
- Body markup parser (`*…*`, `<kbd>…</kbd>`, plain text) as a pure function in `steps.ts` or its own small module, tested on the eleven texts.

**Jest (server)**

- `POST /auth/me/onboarding`: 401 without token, 401 with an invalid token, sets the timestamp, second call keeps the first timestamp.
- `GET /auth/me` and both login routes include `onboardingCompletedAt`.

**Manual, on the test stack** (never locally — see the project's testing rule)

- New account → tour starts once, „Fertig" → reload → no tour.
- Existing account → tour starts once after the deploy.
- „Überspringen" on step 1 and Esc mid-tour → no tour after reload.
- Prof sees 10 steps, admin 11.
- Without an active project, step 8 is centred.
- Narrow window → bottom sheet; collapsed sidebar → step 4/6 centred.
- During the tour G/R/S/V/E and ⌘Z do nothing, clicks on the dimmed area do nothing.
- Wiki → „Tour starten" restarts it.
- `npm run lint`, `npm run test`, `cd server && npm test`.

---

## 8. Documentation

- `src/wiki/project-management.md`, end of „Projekt-Dashboard": one sentence that the tour can be restarted via „Tour starten" in the wiki.
- `CLAUDE.md`: short „Onboarding-Tour" section under Architecture (steps in `lib/tour/steps.ts`, `data-tour` attributes, `onboarding_completed_at`, tour guard in controlsLock and EditorPage, new UI elements that the tour should show need a `data-tour` attribute and a step).
