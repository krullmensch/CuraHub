# Schutz veröffentlichter Versionen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Published exhibition versions become read-only on the server; the first edit of one in the editor opens a dialog that moves the work into a working copy (published later with „Neu veröffentlichen"), a new branch, or discards it.

**Architecture:** A pure server guard answers 409 `version_published` on every content write to a published version. The client keeps `activeVersionPublished` in editorStore; auto-sync and the wall-layout sync hold changes back while it is set and ask a small gate module to open the dialog once. Resolving the dialog either posts the local state as a new version (reusing the „Version speichern" payload) and switches to it, or restores the last persisted snapshots.

**Tech Stack:** Express 5 + Prisma (server, Jest/supertest), React 19 + Zustand 5 + Radix Dialog (client, Vitest).

**Spec:** `docs/superpowers/specs/2026-10-29-published-version-protection-design.md`

## Global Constraints

- All user-facing strings German, exactly as in the spec: „Diese Version ist veröffentlicht.", „Änderungen wären sonst sofort öffentlich sichtbar.", „Arbeitskopie anlegen", „Öffentlich bleibt der jetzige Stand, bis du neu veröffentlichst.", „Neuen Branch anlegen", „Verwerfen", „In Arbeitskopie von *Name* wechseln", „Deine eben gemachte Änderung wird dabei verworfen.", „Veröffentlicht · schreibgeschützt", „Arbeitskopie von v*N*", „Neu veröffentlichen", toast „Neu veröffentlicht", toast „Arbeitskopie konnte nicht angelegt werden.".
- 409 body exactly: `{ code: 'version_published', error: 'Diese Version ist veröffentlicht und schreibgeschützt.' }`.
- 409 is checked **before** `ensureNotClaimed` (published wins over 423).
- No Prisma migration.
- Never test against a local running app or local DB (user rule). Pure unit tests, lint, typecheck and build run locally; DB-backed Jest tests and the manual checks run on the test stack (`/root/CuraHub-test` on `Prohosting-18GB-Server`, `127.0.0.1:3002` via SSH tunnel).
- No `any`; Zod for request validation as elsewhere; `npm run lint` clean before done.
- Work on branch `feat/published-version-lock` (create from `main` before Task 1).

## Review Focus

1. **Mixed sync batch** — one batch where some requests answer 409 and others succeed (version published from another tab mid-batch): unsent/refused items must stay out of `prev*` so they are part of the copy, nothing is reverted, no error toast. → test in Task 5.
2. **Changes while the dialog is open** (drag continues, wall-editor nudge): the gate stays a single dialog and the copy taken on resolve contains every change made until then. → test in Task 2 (gate) + Task 6 (resolve reads state at resolve time).
3. **Unsynced temp ids in the copy** — a new artwork (negative id, `assetId` only) hanging on a new wall (negative id) at the moment of „Arbeitskopie anlegen": the snapshot must carry `assetId` and the right `wallIndex`. → test in Task 3.
4. **Version switch while the dialog is open** (VersionPanel click, project switch): the gate resets, the dialog closes, nothing is posted. → test in Task 2 + Task 4.
5. **Page unload while gated** — layoutSync's keepalive `flush` on `pagehide` must not PATCH a published version. → test in Task 5.

---

### Task 1: Server guard, wiring, version list field

**Files:**
- Create: `server/src/lib/versionWritable.ts`
- Create: `server/src/tests/versionWritable.test.ts` (pure, runs locally)
- Create: `server/src/tests/publishedVersionLock.test.ts` (DB-backed, style of `scaleFigures.test.ts`, runs on test stack)
- Modify: `server/src/routes/instances.ts` (POST ~l.41, PATCH ~l.196, DELETE ~l.268)
- Modify: `server/src/routes/walls.ts` (POST ~l.82, PATCH ~l.139, DELETE ~l.174)
- Modify: `server/src/routes/scaleFigures.ts` (POST ~l.64, PATCH ~l.91, DELETE ~l.113)
- Modify: `server/src/routes/versions.ts` (wall-layout PATCH ~l.204; list `select` ~l.106)

**Interfaces:**
- Produces: `ensureVersionWritable(res: Response, version: { is_published: boolean }): boolean` — sends the 409 and returns false when published, else true. Same shape as `ensureNotClaimed`.
- Produces: `GET /exhibitions/:eid/versions` rows additionally carry `published_at: string | null`.

- [ ] **Step 1: Write failing unit tests** in `versionWritable.test.ts` with a fake `res` (`status` jest.fn returning `{ json }`):
  - `returns true and sends nothing for an unpublished version` → `expect(ok).toBe(true); expect(res.status).not.toHaveBeenCalled()`
  - `sends 409 version_published for a published version` → `expect(ok).toBe(false); expect(res.status).toHaveBeenCalledWith(409); expect(json).toHaveBeenCalledWith({ code: 'version_published', error: 'Diese Version ist veröffentlicht und schreibgeschützt.' })`
- [ ] **Step 2:** `cd server && npx jest src/tests/versionWritable.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `ensureVersionWritable` in `server/src/lib/versionWritable.ts`.
- [ ] **Step 4:** same command → PASS.
- [ ] **Step 5: Wire the guard.** POST routes: after the access lookup of the version, `if (!ensureVersionWritable(res, version)) return;`. PATCH/DELETE: extend the existing `findFirst` with `include: { version: { select: { is_published: true } } }` and call `ensureVersionWritable(res, existing.version)` directly before `ensureNotClaimed`. wall-layout PATCH: load/select `is_published` with the access check and guard. Add `published_at: true` to the versions list `select`.
- [ ] **Step 6: Write the DB-backed test** `publishedVersionLock.test.ts` (setup like `scaleFigures.test.ts`: owner, project, exhibition, one unpublished and one published version (`is_published: true, published_at: new Date()`), one instance + wall + figure in each). Cases:
  - `POST /instances|/walls|/scale-figures on the published version → 409 version_published`
  - `PATCH and DELETE of rows in the published version → 409, rows unchanged in DB`
  - `PATCH wall-layout on the published version → 409`
  - `the same writes on the unpublished version succeed (201/200)`
  - `GET versions returns published_at for the published version`
- [ ] **Step 7:** `cd server && npx tsc --noEmit && npm run lint --if-present` → clean. (DB test runs in Task 7.)
- [ ] **Step 8: Commit** `feat(server): make published versions read-only (409 version_published)`.

---

### Task 2: Pure client modules — working copy + edit gate

**Files:**
- Create: `src/lib/versions/workingCopy.ts`, `src/lib/versions/workingCopy.test.ts`
- Create: `src/lib/publishedEditGate.ts`, `src/lib/publishedEditGate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // workingCopy.ts
  export interface VersionSummary {
    id: number; branch_name: string; parent_version_id: number | null;
    is_published: boolean; published_at: string | null; created_at: string;
    creator: { id: number; email: string };
  }
  export function openWorkingCopyOf(versions: VersionSummary[], publishedId: number): VersionSummary | null;
  /** The published version this one is the open working copy of, or null. */
  export function workingCopyParent(versions: VersionSummary[], versionId: number): VersionSummary | null;

  // publishedEditGate.ts
  export type GatePhase = 'idle' | 'asking' | 'resolving';
  export type GateChoice = 'workingCopy' | { branch: string } | 'discard' | { join: number };
  export const publishedEditGate: {
    request(undoDepth: number): void;      // idle → asking (stores undoDepth); no-op otherwise
    beginResolve(): void;                  // asking → resolving
    finish(): void;                        // → idle
    reset(): void;                         // → idle from any phase (version switch)
    getState(): { phase: GatePhase; undoDepth: number };
    subscribe(fn: () => void): () => void;
  };
  ```
- [ ] **Step 1: Failing tests** `workingCopy.test.ts`:
  - `finds the child on the same branch created after publishing`
  - `ignores children on other branches, published children, and children created before published_at`
  - `returns the newest when several match`
  - `returns null without a match / when publishedId is not published`
  - `workingCopyParent returns the published parent for a working copy and null otherwise`
- [ ] **Step 2: Failing tests** `publishedEditGate.test.ts`:
  - `request opens once and keeps the first undoDepth` → `request(3); request(5); expect(getState()).toEqual({ phase: 'asking', undoDepth: 3 })`
  - `subscribers are notified once per phase change`
  - `request during resolving is a no-op`
  - `finish and reset return to idle; a later request opens again`
- [ ] **Step 3:** `npx vitest run src/lib/versions src/lib/publishedEditGate.test.ts` → FAIL.
- [ ] **Step 4: Implement** both modules (gate = module-level state + listener `Set`, no React, no store import).
- [ ] **Step 5:** same command → PASS.
- [ ] **Step 6: Commit** `feat: working-copy lookup and published-edit gate`.

---

### Task 3: Extract the version snapshot payload

**Files:**
- Create: `src/lib/versions/snapshotPayload.ts`, `src/lib/versions/snapshotPayload.test.ts`
- Modify: `src/components/SaveVersionDialog.tsx` (body built inline ~l.38–90)

**Interfaces:**
- Produces: `buildVersionSnapshot(opts: { comment: string; branchName: string; sourceVersionId: number | null }): Record<string, unknown>` — exactly the JSON body `SaveVersionDialog` posts today (instances with `wallIndex`, walls, scale figures, and `hangingHeight`/`wallGuides` only when `isWallLayoutLoaded(sourceVersionId)`), read from `useEditorStore.getState()` / `useWallEditorView.getState()` at call time.
- Produces: `postVersionSnapshot(exhibitionId: number, token: string, opts: same): Promise<{ ok: true; id: number } | { ok: false; error: string }>` — POSTs `/api/exhibitions/:id/versions`, error = server `error` text or „Arbeitskopie konnte nicht angelegt werden.".

- [ ] **Step 1: Failing tests** (set store state directly):
  - `maps an unsynced artwork on an unsynced wall to assetId + wallIndex` → local wall `id: -7` at index 1, instance `id: -3, assetId: 42, wallId: -7` → `instances[0]` has `assetId: 42, wallIndex: 1`
  - `includes hangingHeight and wallGuides only when the layout is loaded for the source version`
  - `carries comment, branch_name and sourceVersionId`
- [ ] **Step 2:** `npx vitest run src/lib/versions/snapshotPayload.test.ts` → FAIL.
- [ ] **Step 3: Implement** by moving the existing inline body out of `SaveVersionDialog` unchanged; the dialog calls `buildVersionSnapshot`.
- [ ] **Step 4:** test → PASS; `npm run build` → no type errors.
- [ ] **Step 5: Commit** `refactor: share the version snapshot payload`.

---

### Task 4: Active version status

**Files:**
- Modify: `src/store/editorStore.ts` (state ~l.282, initial ~l.487, `setActiveVersion` ~l.705)
- Create: `src/lib/versions/versionStatus.ts`, `src/lib/versions/versionStatus.test.ts`
- Modify: `src/components/EditorLayout.tsx` (start next to `startEditorPresence`, ~l.70)

**Interfaces:**
- Consumes: `VersionSummary`, `workingCopyParent` (Task 2), `publishedEditGate.reset` (Task 2).
- Produces in editorStore: `activeVersionPublished: boolean`, `setActiveVersionPublished(v: boolean): void`. `setActiveVersion` and the project-activation path set it to `false`.
- Produces: `useVersionStatus` (Zustand) `{ versions: VersionSummary[]; workingCopyOf: VersionSummary | null }` and `startVersionStatus(): () => void` — refetches the list on `activeExhibitionId`, `activeVersionId` or `useLiveStore.versionsRevision` change, then sets `activeVersionPublished` and `workingCopyOf`; on `activeVersionId` change it calls `publishedEditGate.reset()` first. Stale responses (version changed meanwhile) are dropped.
- Produces: `refreshVersionStatus(): Promise<void>` (used after publishing in Task 6).

- [ ] **Step 1: Failing tests** (mock `fetch`, drive the store):
  - `sets activeVersionPublished from the fetched list`
  - `drops a response that arrives after the active version changed`
  - `resets the gate when the active version changes` → `publishedEditGate.request(0); setActiveVersion(2); expect(gate phase).toBe('idle')`
  - `refetches when versionsRevision increments`
  - `closes the gate when the active version is no longer published (unpublished/deleted elsewhere)` → gate `asking`, refetch returns it unpublished → `activeVersionPublished === false`, gate `idle` (spec §3, last row; the next sync then sends the held changes)
- [ ] **Step 2:** `npx vitest run src/lib/versions/versionStatus.test.ts` → FAIL.
- [ ] **Step 3: Implement** store fields + module; start it in `EditorLayout` with a `useEffect(() => startVersionStatus(), [])`.
- [ ] **Step 4:** test → PASS.
- [ ] **Step 5: Commit** `feat: track whether the active version is published`.

---

### Task 5: Hold back sync on published versions

**Files:**
- Modify: `src/store/editorStore.ts` (`syncToBackend` ~l.1124, refusal handling ~l.1495–1530)
- Modify: `src/lib/wallEditor/layoutSync.ts` (`send` ~l.98, `flush`, `load`)
- Test: `src/store/editorStore.published.test.ts`, `src/lib/wallEditor/layoutSync.published.test.ts`

**Interfaces:**
- Consumes: `activeVersionPublished`, `setActiveVersionPublished` (Task 4), `publishedEditGate.request` (Task 2).
- Produces in editorStore: `discardUnsyncedChanges(undoDepth: number): void` — sets `localInstances/localWalls/localScaleFigures` to the module's `prevInstances/prevWalls/prevScaleFigures`, truncates `pastInstances` to `undoDepth`, clears `futureInstances`, clears the instance/figure/wall selection of rows that no longer exist.
- Produces in layoutSync: `revertWallLayout(): void` — re-applies the last layout loaded from the server for the active version.

- [ ] **Step 1: Failing tests** `editorStore.published.test.ts` (mock `fetch`, use the store's existing test helpers/pattern from `editorStore.remote.test.ts`):
  - `sends nothing and requests the gate while the active version is published` → move an instance, flush the 150 ms debounce → `fetch` not called, gate `asking`, `undoDepth` = `pastInstances.length` before the change
  - `a 409 version_published in a mixed batch marks the version published, keeps the refused rows out of prev*, reverts nothing and shows no error toast` (Review Focus 1)
  - `discardUnsyncedChanges restores the persisted lists and drops undo steps after undoDepth`
- [ ] **Step 2: Failing tests** `layoutSync.published.test.ts`:
  - `does not PATCH while published and requests the gate`
  - `keepalive flush on pagehide sends nothing while published` (Review Focus 5)
  - `a 409 version_published marks the version published and requests the gate`
  - `revertWallLayout re-applies the last loaded layout`
- [ ] **Step 3:** `npx vitest run src/store/editorStore.published.test.ts src/lib/wallEditor/layoutSync.published.test.ts` → FAIL.
- [ ] **Step 4: Implement.** In `syncToBackend`, right after the `!activeVersionId` early return: if `activeVersionPublished`, `publishedEditGate.request(state.pastInstances.length)`, set `syncStatus: 'idle'`, return. Add `isVersionPublishedRefusal(res)` next to `refusedBy` (status 409 + body `code === 'version_published'`); a hit is handled like a 423 refusal for the `next*Map` bookkeeping (row stays at its persisted value in `prev*`) but without `restoreRefused` and toast; after `allSettled`, if any hit: `setActiveVersionPublished(true)` and `request(...)`. In layoutSync `send`/`flush`, skip when `activeVersionPublished` and request the gate; on 409 `version_published` do the same as the store.
- [ ] **Step 5:** tests → PASS; existing `npx vitest run` → all green.
- [ ] **Step 6: Commit** `feat: hold back edits of published versions until the curator decides`.

---

### Task 6: Dialog, header badge, „Neu veröffentlichen", wiki

**Files:**
- Create: `src/lib/versions/resolvePublishedEdit.ts`, `src/lib/versions/resolvePublishedEdit.test.ts`
- Create: `src/components/versions/PublishedVersionDialog.tsx`
- Create: `src/components/versions/PublishedVersionBadge.tsx`
- Modify: `src/components/EditorLayout.tsx` (mount dialog; badge next to `<ProjectSelector />` ~l.155)
- Modify: `src/wiki/project-management.md`

**Interfaces:**
- Consumes: gate (Task 2), `postVersionSnapshot` (Task 3), `useVersionStatus`, `refreshVersionStatus` (Task 4), `discardUnsyncedChanges`, `revertWallLayout` (Task 5), `openWorkingCopyOf` (Task 2).
- Produces: `resolvePublishedEdit(choice: GateChoice): Promise<{ ok: boolean; error?: string }>` — `beginResolve()`; for `'workingCopy'`/`{ branch }`: `postVersionSnapshot({ comment: 'Arbeitskopie' | 'Branch <name>', branchName: published branch | name, sourceVersionId: activeVersionId })` read **at this moment** (Review Focus 2), on success `setActiveVersion(id)` + `finish()`, on failure back to `asking` and return the error; for `'discard'`: `discardUnsyncedChanges(undoDepth)` + `revertWallLayout()` + `finish()`; for `{ join }`: discard, then `setActiveVersion(join)`.
- Produces: `publishWorkingCopy(): Promise<boolean>` — `PATCH …/versions/:activeVersionId/publish`, then `refreshVersionStatus()`, toast „Neu veröffentlicht".

- [ ] **Step 1: Failing tests** `resolvePublishedEdit.test.ts` (mock `fetch`):
  - `workingCopy posts the local state at resolve time on the published branch and switches to the new version` → change an instance after `request()`, then resolve → posted body contains the later position
  - `branch posts with the entered name`
  - `a failed POST keeps the gate asking, keeps local changes and returns 'Arbeitskopie konnte nicht angelegt werden.'` (or the server's text, e.g. duplicate branch)
  - `discard restores persisted state and closes the gate`
  - `join discards and switches to the given version`
- [ ] **Step 2:** `npx vitest run src/lib/versions/resolvePublishedEdit.test.ts` → FAIL.
- [ ] **Step 3: Implement** `resolvePublishedEdit.ts` and `publishWorkingCopy`.
- [ ] **Step 4:** tests → PASS.
- [ ] **Step 5: Build the UI.** `PublishedVersionDialog`: Radix Dialog open while gate phase ≠ `idle`; `setDialogOpen(true/false)` with it; copy from Global Constraints; „In Arbeitskopie von *Name* wechseln" first when `openWorkingCopyOf(versions, activeVersionId)` exists (Name = `nameForEmail(creator.email)` from `lib/live/presence.ts`); „Neuen Branch anlegen" only for `authStore.isCurator`, reveals a name input, server error shown under it; Esc / outside close = `'discard'`; buttons disabled while `resolving`. `PublishedVersionBadge`: „Veröffentlicht · schreibgeschützt" when `activeVersionPublished`; „Arbeitskopie von v*N*" + „Neu veröffentlichen" button when `workingCopyOf` is set (N = the published version's id as shown in VersionPanel). Wiki: one paragraph in `project-management.md` under the publishing section.
- [ ] **Step 6:** `npm run lint && npm run build && npx vitest run` → clean.
- [ ] **Step 7: Commit** `feat: dialog and badge for editing published versions`.

---

### Task 7: Verify on the test stack

- [ ] **Step 1:** Deploy the branch to `/root/CuraHub-test` as in the test-stack notes (archive of the branch, `docker compose -p curahub-test up -d --build`, data stays in `./data`).
- [ ] **Step 2:** Run the DB-backed server tests in the app container (`docker compose -p curahub-test exec -T app npx jest src/tests/publishedVersionLock.test.ts`; if dev deps are missing in the image, run them from a one-off `node:20` container on the compose network with `DATABASE_URL` of the test DB) → PASS.
- [ ] **Step 3:** Manual via `ssh -N -L 3002:127.0.0.1:3002 Prohosting-18GB-Server` → http://localhost:3002:
  - open published version → badge; move a work → dialog → „Arbeitskopie anlegen" → work stays moved, badge „Arbeitskopie von v*N*"; public viewer still shows the old position; „Neu veröffentlichen" → viewer shows the new one
  - „Verwerfen" → work jumps back, undo does not bring it back
  - two tabs: second tab offers „In Arbeitskopie von … wechseln"
  - publish the version that another tab is editing → that tab's next change opens the dialog
  - 2D wall editor: change hanging height on a published version → dialog
- [ ] **Step 4:** Report results; no merge/push without the user's go.
