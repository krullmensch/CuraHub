# Maßstabsfigur + POV-Augenhöhe — Design Spec
**Date:** 2026-09-28
**Status:** Approved (in chat)

---

## Overview

Two changes:

1. **Maßstabsfigur** — curators can add one or more black, low-poly human figures (1.73 m tall) to an exhibition version to judge scale. Figures are saved with the version. Each figure has an "Im Viewer sichtbar" switch (default off) that decides whether the public viewer shows it.
2. **POV eye height** — the first-person camera sits at the eye height of a 1.73 m person: **1.62 m** (≈ 93.5 % of stature) instead of 1.60 m.

Out of scope: the figure in the 2D wall editor, collisions with the figure in first person, scaling or other poses, undo/redo for figures (walls have none either).

---

## 1. The model

- Built in Blender (Blender MCP): one faceted, neutral standing figure, arms slightly away from the body, **exactly 1.73 m** from the soles to the top of the head, feet at y = 0, centred on x/z = 0, facing +Z. About 400–800 triangles, flat normals, one mesh, no materials that matter (the client assigns its own).
- Exported as `public/models/scale-figure.glb`, no Draco (a few hundred triangles; not worth the decoder).
- Verified after export: bounding box height 1.73 m ± 5 mm, triangle count, file size (target < 50 KB).

---

## 2. Database & server

### Prisma model (`server/prisma/schema.prisma`)

```prisma
model ScaleFigure {
  id          Int               @id @default(autoincrement())
  version     ExhibitionVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  versionId   Int
  position_x  Float             @default(0)
  position_z  Float             @default(0)
  rotation_y  Float             @default(0)
  isPublic    Boolean           @default(false)
  createdAt   DateTime          @default(now())
}
```

`ExhibitionVersion` gets `scaleFigures ScaleFigure[]`. The figure always stands on the floor (no `position_y`) and has a fixed size (no scale). Migration via `npx prisma migrate dev --name scale_figures`.

### Route `server/src/routes/scaleFigures.ts`

Mounted at `/scale-figures` and `/api/scale-figures` in `server/src/index.ts`. Same shape as `walls.ts`: `authenticate`, access via `exhibitionAccessFilter` on the version, Zod schemas, `idempotency` on POST.

| Method | Path | Body / query | Notes |
|---|---|---|---|
| `GET` | `/scale-figures?versionId=:id` | — | ordered by `createdAt` |
| `POST` | `/scale-figures` | `{ versionId, position_x, position_z, rotation_y, isPublic? }` | returns created row |
| `PATCH` | `/scale-figures/:id` | any of `position_x`, `position_z`, `rotation_y`, `isPublic` | |
| `DELETE` | `/scale-figures/:id` | — | |

Validation: positions finite numbers within ±500 m, `rotation_y` finite, `isPublic` boolean.

### Versions (`server/src/routes/versions.ts`)

Every place that copies walls into a new version also copies figures:

- creating a version from client data: the request schema gets optional `scaleFigures: [{ position_x, position_z, rotation_y, isPublic }]`; if absent and a source version exists, figures are copied from the source.
- the second copy path (restore/branch around line 539) copies the source version's figures.
- the version GET responses that `include: { walls: true }` also include `scaleFigures: true`.

### Public (`server/src/routes/public.ts`)

The published version's response gets `scaleFigures`, filtered to `isPublic = true` in the Prisma include (`where: { isPublic: true }`), so private figures never leave the server.

---

## 3. Client

### Store (`src/store/editorStore.ts`)

```ts
export interface ScaleFigureData {
  id: number;            // negative = temp id, not yet persisted
  versionId?: number;
  position_x: number;
  position_z: number;
  rotation_y: number;
  isPublic: boolean;
}
```

- State: `localScaleFigures: ScaleFigureData[]`, `selectedFigureId: number | null`.
- Actions: `setLocalScaleFigures`, `addScaleFigure`, `updateScaleFigure`, `deleteScaleFigure`, `selectFigure`. They bump `localEditSeq` and set `hasUnsavedChanges` like the wall actions. `selectInstance`/`selectWall`/`selectZone`/`selectFigure` each clear the other three selections.
- Auto-sync: a third diff block after the walls, same pattern as `prevWalls` — `prevScaleFigures` snapshot (only positive ids), POST temp ids (replace temp id with the server id), PATCH changed fields, DELETE removed ones. Temp ids come from the existing `nextTempId()`; POSTs send an idempotency key via `idempotencyKeyFor`, whose `kind` union grows by `'figure'`. A `syncingFigureTempIds` set guards against double POSTs like `syncingWallTempIds`.
- `SaveVersionDialog` sends `scaleFigures` alongside `walls`.

### Loading

`ScaleFigures` component (editor) fetches `/api/scale-figures?versionId=` when `activeVersionId` changes, like `ModularWallsController` loads walls, and calls `setLocalScaleFigures`. In the viewer the figures come from the `/public` response and are passed as a prop.

### Rendering (`src/components/ScaleFigures.tsx`, new)

- `useGLTF('/models/scale-figure.glb')` once, `useGLTF.preload` at module level; per figure `scene.clone()`.
- One shared `MeshStandardMaterial` (`#111111`, roughness 0.9, metalness 0, `flatShading: true`) created in `useMemo` at module scope and applied to all clones.
- Each figure: `<group position={[x, 0, z]} rotation-y={rotation_y}>`. `React.memo` per figure.
- Editor: click selects (`selectFigure`, `stopPropagation`). The selected figure gets drei `TransformControls`:
  - translate: `showY={false}` (moves on X/Z only)
  - rotate: `showX={false} showZ={false}` (turns around Y only)
  - mode follows `transformMode` from the store (`G`/`R`; `S` is ignored for figures), commit on `mouseUp` via `updateScaleFigure`, orbit controls disabled while dragging (`setIsTransforming`, as in `ModularWallsController`).
- `Entf`/`Backspace` with a selected figure deletes it (in EditorPage's keyboard handler, next to the instance delete).
- Hidden while the 2D wall editor is open (`visible={false}`, not unmounted — same rule as other objects).
- No physics collider (first person walks through figures).

### Toolbar (`src/pages/EditorPage.tsx`)

New `ToolButton` with Lucide `PersonStanding`, tooltip "Maßstabsfigur hinzufügen", placed after the first-person button. On click: create a figure where the view ray through the screen centre meets the floor (else 3 m in front of the camera), `rotation_y` so it faces the camera, `isPublic: false`, then select it. The pose comes from the canvas via `scaleFigureBridge` (`src/lib/scaleFigure.ts`), because `orbitCameraState` is only updated on view-mode changes. The G/R buttons are enabled when a figure is selected (they currently check `selectedInstanceId`); X/Y/Z axis lock and S stay disabled for figures.

### Properties panel (`src/components/PropertiesPanel.tsx`)

When `selectedFigureId` is set, a section "Maßstabsfigur (1,73 m)":
- Position X / Z (m) and Rotation (°) number inputs, like the wall section
- Toggle button (`aria-pressed`) **"Im Viewer sichtbar"** / "Nur im Editor" → `isPublic` (no Switch primitive in `components/ui`)
- Button **"Entfernen"** → `deleteScaleFigure`

### Viewer (`src/pages/ViewerPage.tsx`)

Renders `<ScaleFigures figures={publicFigures} interactive={false} />`.

---

## 4. First-person eye height

Constants live in `src/lib/playerDimensions.ts` (Player.tsx pulls in Rapier, which must stay in the lazy physics chunk, so the store and ViewerPage import the constants from the lib). `Player.tsx` re-exports `PLAYER_EYE_OFFSET` for PhysicsWorld.

```ts
/** Eye height of a 1.73 m tall person (≈ 93.5 % of stature). */
export const PLAYER_EYE_HEIGHT = 1.62;
const PLAYER_CAPSULE_RADIUS = 0.3;
const PLAYER_CAPSULE_HALF_HEIGHT = 0.565;   // 2·0.565 + 2·0.3 = 1.73 m
const PLAYER_BODY_CENTER = PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS; // 0.865
export const PLAYER_EYE_OFFSET = PLAYER_EYE_HEIGHT - PLAYER_BODY_CENTER;    // 0.755
```

- `CapsuleCollider args={[PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS]}`.
- `DEFAULT_SPAWN` y = `PLAYER_BODY_CENTER`.
- `editorStore` default `firstPersonCameraState.position` y = `PLAYER_EYE_HEIGHT`.
- `ViewerPage` Canvas camera start y 1.7 → `PLAYER_EYE_HEIGHT`.
- `PhysicsWorld` already derives the body from `PLAYER_EYE_OFFSET` — no change.
- Saved first-person poses from before (eye at 1.60 m) spawn the body 2 cm low; the capsule is pushed out of the floor by the solver. Acceptable, no data migration.

---

## 5. Testing

- **Server (Jest, supertest against the dev DB like `auth.test.ts`, test users cleaned up before/after):** `scaleFigures.test.ts` — create/list/patch/delete with ownership (foreign user gets 404), Zod rejects bad input, `/public` returns only `isPublic` figures, creating a version from a source copies figures.
- **Client:** `npm run build` and `npm run lint` clean.
- **Visual (headless Chrome over CDP, WebGPU + `?renderer=webgl`):** add a figure, move and rotate it, toggle visibility, reload (persisted), open the public viewer (only public figures), first person: eye at 1.62 m (`camera.position.y` when standing).

---

## 6. Files

| File | Change |
|---|---|
| `public/models/scale-figure.glb` | new model |
| `server/prisma/schema.prisma` + migration | `ScaleFigure` model |
| `server/src/routes/scaleFigures.ts` | new route |
| `server/src/index.ts` | mount route |
| `server/src/routes/versions.ts` | copy + include figures |
| `server/src/routes/public.ts` | public figures |
| `server/src/tests/scaleFigures.test.ts` | new tests |
| `src/store/editorStore.ts` | state, actions, auto-sync, FP default |
| `src/components/ScaleFigures.tsx` | new component |
| `src/components/Scene.tsx` | mount `ScaleFigures` next to `ModularWallsController` |
| `src/components/SaveVersionDialog.tsx` | send figures |
| `src/components/PropertiesPanel.tsx` | figure section |
| `src/pages/EditorPage.tsx` | toolbar button, delete key, G/R enablement |
| `src/pages/ViewerPage.tsx` | public figures, camera start height |
| `src/components/Player.tsx` | capsule + eye height |
| `src/lib/playerDimensions.ts` | player/figure height constants |
| `src/lib/scaleFigure.ts` | model URL, spawn pose, canvas bridge |
| `src/components/ArtworkPlacement.tsx` | drop raycast ignores figures |
| `CLAUDE.md` | short "Maßstabsfigur" note + eye height |
