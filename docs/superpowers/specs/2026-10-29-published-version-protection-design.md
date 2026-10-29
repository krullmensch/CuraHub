# Schutz veröffentlichter Versionen — Design Spec
**Date:** 2026-10-29
**Status:** Approved (in chat), awaiting spec review

---

## Context: mobile viewer programme

This spec is part **D** of four sub-projects that make published exhibitions usable on phones. Each part gets its own spec → plan → implementation, in this order:

| # | Sub-project | Short |
|---|---|---|
| **D** | Protect published versions (this spec) | Published versions become read-only; editing one goes through a working copy or a new branch. |
| **B** | Whole-exhibition AR export | A server job renders each published version in headless Chromium with the app's own code and exports GLB (Android, Scene Viewer) + USDZ (iOS, AR Quick Look). New published version → new files, the old version's files are deleted. Videos become stills, splats/books are left out or shown as placeholders. No precise registration to the real Satellit — the visitor places the model by hand. |
| **A** | Twin-joystick viewer | Touch controls for `/view/:slug` (left stick walk, right stick look), tap instead of crosshair. |
| **C** | Mobile planning view | Logged-in curators get a simple 3D room view on phones; the asset browser offers "In AR an Wand" for one artwork with frame + passepartout at real size (`<model-viewer>`, GLB built in the browser, no storage). |

D comes first because B ties the export to the publish event — that only works if a published version never changes afterwards.

---

## Overview

Today a published version (`ExhibitionVersion.is_published`) stays fully editable: every change a curator makes to it is live in the public viewer at once. After D, published versions are **read-only on the server**. A curator who opens one can look at everything; the first change opens a dialog that sends the work into a **working copy** (new version on the same branch, published later with „Neu veröffentlichen") or a **new branch**, or discards it. The public keeps seeing the old state until the working copy is published.

Decisions taken in chat:

- Editing a published version always asks first: **„Arbeitskopie anlegen"** (default), **„Neuen Branch anlegen"**, **„Verwerfen"**.
- Changes are **collected** in the working copy; the public sees them only after **„Neu veröffentlichen"** (not live, not on every change).
- The lock is enforced **on the server** (409), not only in the UI, so a second tab, live collaboration or a race cannot change a published version.
- The working copy is created from the **current local state including the change that triggered the dialog** — the curator keeps working without redoing it.
- The **undo history is lost** when the editor switches into the working copy (same as every version switch today). Accepted.
- If an open working copy of that published version already exists (another curator), the dialog offers to **switch into it**; the triggering change is discarded in that case so no second parallel copy appears.

Success: nobody can change what the public sees except by publishing a version; a curator who starts editing a published version ends up in a working copy without losing the change they just made, and can publish it with one click.

Out of scope: artwork-level metadata (`PUT /artworks/:id` — title, splat height, book settings, cover) — it belongs to the asset and is shared across versions; B decides whether it triggers a re-export. Also out: keeping undo across the switch, locking unpublished versions, review/approval workflows before publishing, any schema migration.

---

## 1. Server

### `server/src/lib/versionWritable.ts` (new)

```ts
export class VersionPublishedError extends Error { code = 'version_published' as const; }

/** Throws VersionPublishedError when the version is published. */
export async function ensureVersionWritable(versionId: number): Promise<void>;

/** Sends the 409 for a VersionPublishedError; returns false for anything else. */
export function sendVersionPublished(res: Response, err: unknown): boolean;
```

Response body: `409 { code: 'version_published', error: 'Diese Version ist veröffentlicht und schreibgeschützt.' }`.

### Where it is called

After the access check (same place as `ensureNotClaimed`, and before it, so a published version answers 409 rather than 423):

| Route | Version from |
|---|---|
| `POST /instances`, `POST /walls`, `POST /scale-figures` | `versionId` in the body |
| `PATCH`/`DELETE /instances/:id`, `/walls/:id`, `/scale-figures/:id` | the row's `versionId` |
| `PATCH /exhibitions/:eid/versions/:vid/wall-layout` | `:vid` |

Not affected: `POST …/versions` (new snapshot), merge, publish, feature, delete version, artworks/assets.

The merge route creates a new version and never writes into the published one, so it needs no change.

### Open working copy

No new column. A version **W** is the open working copy of published version **P** when:

- `W.parent_version_id === P.id`
- `W.branch_name === P.branch_name`
- `!W.is_published`
- `W.created_at > P.published_at`

If several match, the newest wins. Derived on the client from the version list `GET …/versions` (it already carries `parent_version_id`, `branch_name`, `is_published`, `created_at`, creator; **add `published_at` to its `select`**); pure helper `openWorkingCopyOf(versions, publishedId)` in `src/lib/versions/workingCopy.ts`.

---

## 2. Client

### Store

`editorStore.activeVersionPublished: boolean` — set wherever the active version's metadata is loaded (version list fetch in the editor), refreshed when `liveStore.versionsRevision` changes (another tab published). Reset to `false` on `setActiveVersion` until the metadata for the new version is known.

### `src/lib/publishedEditGate.ts` (new, pure + Vitest)

Small state machine: `idle → asking → resolving → idle`.

- `request()` — called by auto-sync / layoutSync when they would send while `activeVersionPublished`. Opens the dialog once; further calls while `asking`/`resolving` are no-ops.
- `resolve(choice)` with `choice: 'workingCopy' | { branch: string } | 'discard' | { join: versionId }`.
- Subscribers (the dialog component) read the state.

### Auto-sync (`editorStore.ts`, `scheduleSync` / sync body) and `lib/wallEditor/layoutSync.ts`

- If `activeVersionPublished`: do not send anything, call `publishedEditGate.request()`. Local lists keep the change (the scene does not jump).
- On a `409 version_published` response (the version was published while this tab edited it): treat it like the case above — set `activeVersionPublished = true`, stop the rest of this sync run, `request()`. Never `restoreRefused` for this code.

### Resolving the dialog

- **Arbeitskopie / Neuer Branch:** `POST /exhibitions/:eid/versions` with the current local state — instances, walls, scale figures, hanging height, wall guides — exactly what „Version speichern" sends today; `sourceVersionId` = the published version; `branch_name` = the published version's branch (working copy) or the entered name (branch; curator+ only, duplicate names rejected by the server as today). Then `setActiveVersion(newId)`; the normal load path takes over. Error → toast, dialog stays open.
- **Verwerfen** and **In Arbeitskopie von *Name* wechseln:** reset `localInstances` / `localWalls` / `localScaleFigures` to the believed-persisted snapshots (`prevInstances` etc., same pattern as `restoreRefused`) and the wall layout to its last loaded state; drop the undo steps taken since the dialog opened. For „wechseln", then `setActiveVersion(workingCopyId)`.

### UI

- `src/components/versions/PublishedVersionDialog.tsx` — Radix Dialog, German, sets `isDialogOpen` while open (so `controlsLock` freezes the 3D controls and EditorPage's keys).
  - Title: „Diese Version ist veröffentlicht."
  - Text: „Änderungen wären sonst sofort öffentlich sichtbar."
  - Options: „Arbeitskopie anlegen" (primary; subline „Öffentlich bleibt der jetzige Stand, bis du neu veröffentlichst."), „Neuen Branch anlegen" (reveals a name field; hidden for roles below curator), „Verwerfen".
  - When an open working copy exists, first option: „In Arbeitskopie von *Name* wechseln" with the note „Deine eben gemachte Änderung wird dabei verworfen."
  - Esc / closing = „Verwerfen".
- Header badge next to `ProjectSelector`:
  - Published version: „Veröffentlicht · schreibgeschützt".
  - Open working copy of a published version: „Arbeitskopie von v*N*" + button **„Neu veröffentlichen"** → existing `PATCH …/publish` on the working copy; toast „Neu veröffentlicht". (B will hook its export job onto this publish.)
- Wiki: a short paragraph in `src/wiki/project-management.md` (where versions and publishing are described) explaining read-only published versions and working copies.

---

## 3. Error handling

| Case | Behaviour |
|---|---|
| Sync hits 409 `version_published` | Dialog, nothing reverted |
| Creating the working copy fails | Toast „Arbeitskopie konnte nicht angelegt werden.", dialog stays open, local change kept |
| Branch name taken | Server message shown under the name field |
| Two tabs of the same user | Each gets the dialog; the second sees the first's copy as „In Arbeitskopie … wechseln" |
| Published version deleted / unpublished meanwhile | Next version list refresh sets `activeVersionPublished = false`; the gate closes, sync resumes normally |

---

## 4. Tests

- **Jest (server):** `ensureVersionWritable` on published / unpublished / missing versions; each listed route answers 409 on a published version and works on an unpublished one; wall-layout PATCH the same; 409 wins over 423 (claimed and published).
- **Vitest (client):** `publishedEditGate` opens once, ignores repeated requests, resets after each choice; `openWorkingCopyOf` (match rules, newest wins, none); the sync sends nothing while `activeVersionPublished`; discard restores the persisted snapshots and drops the undo steps since the dialog opened.
- **Manual, on the test stack:** open published version → move a work → dialog → working copy → keep editing → „Neu veröffentlichen" → public viewer shows the new state; two tabs at once; publish from another tab while editing.
