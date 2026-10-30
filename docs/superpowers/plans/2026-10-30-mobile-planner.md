# Mobile Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On phones, logged-in curators get a mobile planning view (orbit room, tap artwork, change frame/passepartout, asset list) and can see one artwork with frame and passepartout at real size on a real wall via `<model-viewer>`.

**Architecture:** `EditorLayout` switches to `MobilePlannerLayout` when `isMobilePlanner()` is true; the editor's stores, auto-sync, claims and `EditorPage` canvas keep running, with editor-only tools switched off by a `mobile` flag. AR builds a GLB in the browser from one synthetic instance rendered roomless in a hidden mini canvas in part B's export mode (`prepareExportScene` + `GLTFExporter`), shown by a lazy-loaded `<model-viewer>`.

**Tech Stack:** React 19, R3F 9, three 0.186, Zustand 5, `@google/model-viewer` 4.3.1 (new), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-mobile-planner-design.md`

## Global Constraints

- Branch `feat/mobile-planner` (on top of `feat/touch-viewer`). Never push, merge, touch production; never stage unrelated dirty files (`.claude/`, `.mcp.json`, `.serena/`, `promo/`, `skills-lock.json`, `docs/superpowers/specs/2026-09-30-tag-nacht-licht-grobplan.md`, `.superpowers/`).
- Never run the app, a dev server, a browser or a DB locally. Local checks: `npm run test`, `npx eslint <touched files>`, `npx tsc -b`, `npm run build`.
- Mobile mode: touch device (`isTouchViewer`, part A) **and** short screen side `< 600` px; override localStorage key `curahub-mobile-planner` = `'full' | 'mobile'`.
- AR: `<model-viewer>` attributes `ar`, `ar-modes="webxr quick-look"`, `ar-placement="wall"`, `ar-scale="fixed"`; lazy-loaded only when AR opens; GLB from `GLTFExporter` binary, `prepareExportScene(…, { maxTexture: 2048 })`; object URL revoked on close; nothing uploaded.
- Desktop editor, tablets, the public viewer and part B's server export must behave exactly as before.
- German strings verbatim: „Vollen Editor öffnen", „Mobile Ansicht", tabs „Raum" / „Assets", „Tippe ein Kunstwerk an.", „In AR an Wand", „In AR an Wand starten", „Abbrechen", „Wird gerade von {Name} bearbeitet", „Maße fehlen – am Rechner eintragen", „AR-Modell konnte nicht erstellt werden.", „AR wird auf diesem Gerät nicht unterstützt".
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Artwork without real size (`artwork.width/height` null) → AR button disabled with the hint, never a 0-size model (Task 1 test `missing size disables AR`).
2. Frame change on a published version from the phone → part D's dialog, nothing sent (Task 4: uses the same `commitLocalChange` path; Task 1 test pins that the helpers only return new lists, never write).
3. Leaving AR / switching artworks quickly → no leaked object URLs, no stale GLB shown for another artwork (Task 3 test `builder ignores a superseded request`).
4. Touch laptop or tablet → full editor; override `'mobile'` forces mobile even there (Task 1 tests).
5. Synthetic AR instance must not leak into the editor store / auto-sync (never in `localInstances`) (Task 3: builder renders its own `viewerInstances`, test asserts store untouched).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/mobilePlanner/mode.ts` | `isMobilePlanner`, override read/write, `useMobilePlanner` |
| `src/lib/mobilePlanner/arArtwork.ts` | synthetic AR instance, disabled reason, AR-able asset filter |
| `src/lib/frameEdits.ts` | pure frame/passepartout list updates (shared with PropertiesPanel) |
| `src/components/arExport/useSettledExport.ts` | settle loop extracted from `ArExportPage` |
| `src/components/mobile/ArtworkArBuilder.tsx` | hidden mini canvas → GLB blob |
| `src/components/mobile/ArWallSheet.tsx` | `<model-viewer>` sheet (lazy) |
| `src/components/mobile/MobilePlannerLayout.tsx`, `RoomTab.tsx`, `AssetsTab.tsx`, `FrameSheet.tsx` | the mobile UI |

---

### Task 1: Pure helpers

**Files:** Create `src/lib/mobilePlanner/mode.ts`, `src/lib/mobilePlanner/arArtwork.ts`, `src/lib/frameEdits.ts` (+ tests `mode.test.ts`, `arArtwork.test.ts`, `src/lib/frameEdits.test.ts`); Modify `src/components/PropertiesPanel.tsx` to use `frameEdits` (no behaviour change).

**Interfaces — Produces:**
```ts
// mode.ts
export type PlannerOverride = 'full' | 'mobile' | null
export const MOBILE_PLANNER_KEY = 'curahub-mobile-planner'
export const MOBILE_SHORT_SIDE = 600
export function isMobilePlanner(env: TouchEnv & { width: number; height: number }, override: PlannerOverride): boolean
export function readPlannerOverride(): PlannerOverride        // try/catch around localStorage
export function writePlannerOverride(v: PlannerOverride): void
export function useMobilePlanner(): { mobile: boolean; setOverride(v: PlannerOverride): void }  // evaluated once + on setOverride
// arArtwork.ts
export function arDisabledReason(artwork: { width?: number | null; height?: number | null }): string | null   // „Maße fehlen – am Rechner eintragen" when either ≤ 0 / null
export function canOfferAr(assetType: string | undefined): boolean                 // 'image' | 'video' only
export function arArtworkInstance(base: ArtworkInstanceData | ArArtworkSource, frame: { frameStyle: FrameStyleId; passepartout: PassepartoutValue }): ArtworkInstanceData
//   id -1, wallId null, position (0, centre height so the bottom of the outer bounds sits at y=0 is NOT needed — centre at origin), rotation 0, facing +Z, scale 1 (real size comes from artwork.width/height in cm), medium 'frame' for images / 'monitor' kept for placed videos? → for AR always 'frame' with the video's still (spec: still as picture)
export interface ArArtworkSource { artworkId?: number; assetId?: number; artwork: ArtworkInstanceData['artwork'] }
// frameEdits.ts
export function withFrameStyle(list: ArtworkInstanceData[], id: number, frameStyle: FrameStyleId): ArtworkInstanceData[]
export function withPassepartout(list: ArtworkInstanceData[], id: number, value: PassepartoutValue): ArtworkInstanceData[]  // clamps width to [0, MAX_PASSEPARTOUT_WIDTH_CM]
```

- [ ] **Step 1: Failing tests:** `isMobilePlanner` — iPhone 390×844 → true; iPad 820×1180 coarse → false (short side ≥ 600); phone landscape 844×390 → true; touch laptop → false; override `'full'` on phone → false; override `'mobile'` on desktop → true. `arDisabledReason({width:null,height:50})` → „Maße fehlen – am Rechner eintragen" (`missing size disables AR`); `{40,50}` → null; `{0,50}` → hint. `canOfferAr` image/video true; model3d/splat/book false. `arArtworkInstance` from a placed instance at x=3, rotation_y=1.2, scale 1.5 → position 0,0,0, rotation 0, scale 1, same `artwork`, given frame values, `wallId` null, `id` −1. `withFrameStyle` changes only that id and returns a new array (input unchanged); `withPassepartout` clamps 99 → `MAX_PASSEPARTOUT_WIDTH_CM`, −3 → 0.
- [ ] **Step 2:** `npx vitest run src/lib/mobilePlanner src/lib/frameEdits.test.ts` → FAIL.
- [ ] **Step 3:** Implement; switch `PropertiesPanel` handlers to `withFrameStyle` / `withPassepartout` (keep setters, refs and defaults exactly).
- [ ] **Step 4:** Tests pass; `npm run test`, `npx tsc -b`, eslint → clean.
- [ ] **Step 5:** Commit `feat: mobile planner helpers (mode, AR instance, frame edits)`.

**Real size check:** before Step 3, read how an instance's picture size is derived (`artworkFrameLayout`, `framedArtworkLayout`, instance `scale_*` vs `artwork.width/height` vs pixel/dpi) and make `arArtworkInstance` produce the artwork's real cm size at scale 1; add a test asserting `artworkFrameLayout(arArtworkInstance(…))` opening size equals `width/100 × height/100` m. If the layout derives size from pixels/dpi, ledger a ruling and set the scale so the opening equals the real size.

### Task 2: Shared settle loop and roomless scene

**Files:** Create `src/components/arExport/useSettledExport.ts`; Modify `src/pages/ArExportPage.tsx` (use the hook, behaviour unchanged), `src/components/Scene.tsx` (prop `roomless?: boolean`: no `Satellit`, no room-only parts; lights stay).

**Interfaces — Produces:**
```ts
export interface SettledExportOptions { requireRoom: boolean; quietMs?: number; deadlineMs?: number }
export function useSettledExport(session: ExportSession, run: (deadline: boolean, skipped: Set<number>) => Promise<void>, onFatal: (err: unknown) => void, opts: SettledExportOptions): void
```
Moves the poll/quiet/deadline/skip/hide-works logic of `ExportRunner` verbatim; `requireRoom: true` keeps the „Raum nicht geladen" rule for the page, `false` for the single-artwork builder.

- [ ] Steps: existing `src/lib/arExport/*.test.ts` stay green (they cover `ExportSession` and settle rules); `npm run test`, `npx tsc -b`, `npm run build` (ArExportPage still its own chunk) → pass; commit `refactor: share the export settle loop, roomless scene`.

### Task 3: AR builder and `<model-viewer>` sheet

**Files:** Create `src/components/mobile/ArtworkArBuilder.tsx`, `src/components/mobile/ArWallSheet.tsx`, `src/lib/mobilePlanner/arRequest.ts` (+ `arRequest.test.ts`), `src/types/model-viewer.d.ts`; Modify `package.json` (`@google/model-viewer@4.3.1`), `vite.config.ts` only if needed to keep it out of shared vendor chunks.

**Interfaces:**
- Consumes: `arArtworkInstance`, `useSettledExport`, `Scene roomless`, `ExportModeContext`, `ExportSession`, `prepareExportScene`, `GLTFExporter`.
- Produces:
```ts
// arRequest.ts — pure request bookkeeping
export class ArRequests { start(key: string): number; isCurrent(token: number): boolean; cancel(): void }
// ArtworkArBuilder.tsx
export function ArtworkArBuilder(props: { instance: ArtworkInstanceData; onDone(glb: Blob): void; onError(err: unknown): void }): JSX.Element  // hidden 1×1 canvas (classic WebGLRenderer, frameloop demand, camera.layers.disableAll like the export page), <ExportModeContext.Provider value={{active:true, maxTexture:2048, session}}>, <Scene isEditor={false} roomless viewerInstances={[instance]} viewerWalls={[]} viewerScaleFigures={[]} />; on settle: prepareExportScene → GLTFExporter.parseAsync(binary) → onDone(blob)
// ArWallSheet.tsx (default export, lazy)
export default function ArWallSheet(props: { instance: ArtworkInstanceData; title: string; sizeLabel: string; onClose(): void }): JSX.Element
```
Sheet: full screen, builds via `ArtworkArBuilder`, shows spinner, then `<model-viewer src={url} ar ar-modes="webxr quick-look" ar-placement="wall" ar-scale="fixed" camera-controls>` with „In AR an Wand starten" (`activateAR()`), hint „AR wird auf diesem Gerät nicht unterstützt" when `canActivateAR` is false after load, error toast „AR-Modell konnte nicht erstellt werden.", `URL.revokeObjectURL` on close/replace, sets `isDialogOpen` while open. `import('@google/model-viewer')` inside the sheet only.
- [ ] **Step 1: Failing tests** (`arRequest.test.ts`): `builder ignores a superseded request` — start A, start B → A not current, B current; `cancel` makes the current one stale.
- [ ] **Step 2:** FAIL. **Step 3:** `npm install @google/model-viewer@4.3.1`; implement. Builder never touches `useEditorStore.localInstances` (renders its own `viewerInstances`). **Step 4:** tests, eslint, tsc, `npm run build` — check model-viewer lands in its own lazy chunk (grep `dist/assets`), not in the editor's initial chunks. **Step 5:** commit `feat: build an artwork GLB in the browser and show it at the wall`.

### Task 4: Mobile layout

**Files:** Create `src/components/mobile/MobilePlannerLayout.tsx`, `RoomTab.tsx`, `AssetsTab.tsx`, `FrameSheet.tsx`; Modify `src/components/EditorLayout.tsx` (switch + „Mobile Ansicht" in the user menu on touch devices), `src/pages/EditorPage.tsx` (prop `mobile?: boolean`: no transform gizmo, marquee, wall editor entry, first person, keyboard handler, restriction-zone and figure editing; tap selection only for artworks).

**Interfaces:**
- Consumes: Task 1–3 exports; `ProjectSelector`, `PublishedVersionBadge`, `FrameControls`, `useHeldByOthers`, `selectInstance`, `clearInstanceSelection`, `commitLocalChange`, `defaultFrameStyle` / `defaultPassepartout` + setters, the asset list request used by `AssetSidebar` (`/api/assets?…`).
- Produces: `EditorLayout` renders `<MobilePlannerLayout />` (which itself mounts `<EditorPage isVisible mobile />`) when `useMobilePlanner().mobile` and the route is the editor route; asset route unchanged.
  - Header: `ProjectSelector`, `PublishedVersionBadge`, user menu; footer link „Vollen Editor öffnen" → `setOverride('full')`.
  - Sheet with tabs „Raum" / „Assets", collapsible to a handle; canvas above.
  - `RoomTab`: no selection → „Tippe ein Kunstwerk an."; selection → title/artist/year/„B × H cm", `FrameControls` wired to `withFrameStyle` / `withPassepartout` + `commitLocalChange` + default setters (same as PropertiesPanel), disabled with „Wird gerade von {Name} bearbeitet" when held by others, „In AR an Wand" (disabled with `arDisabledReason`) → `ArWallSheet` with `arArtworkInstance(selected, its frame)`.
  - `AssetsTab`: tiles (thumbnail, title), search, only `canOfferAr` types get „In AR an Wand" → `FrameSheet` (local state preset from defaults, „In AR an Wand" / „Abbrechen"; choosing updates defaults) → `ArWallSheet`.
- [ ] **Step 1: Failing test** for any pure piece extracted while building (e.g. `assetSearch(assets, query)` in `src/lib/mobilePlanner/assetSearch.ts`: case-insensitive on title/filename, empty query returns all, only images/videos) → FAIL → implement → PASS.
- [ ] **Step 2:** Implement layout; desktop `EditorLayout` path byte-for-byte unchanged when not mobile.
- [ ] **Step 3:** `npm run test`, eslint touched files, `npx tsc -b`, `npm run build` → pass.
- [ ] **Step 4:** Commit `feat: mobile planning view`.

### Task 5: Docs

- [ ] `src/wiki/project-management.md` or the editor wiki page: short „Auf dem Handy planen" paragraph (automatic on phones, room/assets tabs, frame changes, AR at the wall, needs real size, „Vollen Editor öffnen"). `CLAUDE.md`: short „### Mobile Planungsansicht" section (mode + override key, `MobilePlannerLayout`, `EditorPage mobile`, `frameEdits`, AR builder = roomless export-mode mini canvas + `useSettledExport`, model-viewer lazy). `npm run test` (wiki test) → pass. Commit `docs: mobile planning view`.

### Task 6: Test stack (controller)

- [ ] Dump test DB, deploy `feat/mobile-planner`, rebuild (memory `curahub_test_environment.md`).
- [ ] CDP phone emulation (390×844, touch, iPhone UA) needs a login: use the probe only for the public parts; for the editor, hand the user the checklist (login is the user's; never enter passwords). Check at least that the build serves and that desktop `/exhibition/:slug/edit` still loads its chunks (HTTP 200 for the JS files).
- [ ] User checklist: phone → mobile view appears; tabs; tap artwork; change frame (published version → dialog); assets AR sheet; AR on a wall at real size (iPhone + Android); „Vollen Editor öffnen" and back.
