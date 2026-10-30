# Mobile Planungsansicht mit AR an der Wand — Design Spec
**Date:** 2026-10-30
**Status:** Approved (in chat), awaiting spec review
**Part:** C of the mobile viewer programme (see `2026-10-29-published-version-protection-design.md`, table at the top). Built on top of A (`feat/touch-viewer`, for `isTouchViewer`) and therefore B and D.

---

## Overview

Logged-in curators who open the editor on a phone get a **mobile planning view** instead of the full editor: the 3D room of the active version, tap an artwork to read its info and change its frame and passepartout, and an asset list. From both, **„In AR an Wand"** shows one artwork — picture, passepartout and frame — at real size on a real wall, so a hanging can be tried on site. The AR model is built in the browser and never stored; `<model-viewer>` shows it (WebXR on Android, Quick Look on iOS via its automatic USDZ).

Decisions taken in chat:

- Phone view: **look + small edits** — orbit 3D view, tap an artwork for info, change frame and passepartout. No placing, moving, uploading, wall editor, first person.
- AR: a **placed artwork** goes with its own frame and passepartout; an artwork from the **asset list** first shows a small sheet to pick frame and passepartout (preset: the last combination, `defaultFrameStyle` / `defaultPassepartout`).
- Appears **automatically on phones** (touch device with short screen side < 600 px); tablets keep the full editor; „Vollen Editor öffnen" forces the full editor and is remembered per device.

Success: on a phone a curator opens a project, sees the room, taps a picture, switches its frame from Alu to oak, and with „In AR an Wand" sees that picture with frame and passepartout at its real size on the wall in front of them; from the asset list the same works for a picture that isn't hung yet.

Out of scope: placing or moving artworks on the phone, uploads, the 2D wall editor, first person, AR of models/splats/books, storing AR files, scale-figure editing, multi-selection.

---

## 1. Mobile view

### When

- `isMobilePlanner(env, override)` (pure, `src/lib/mobilePlanner/mode.ts`): `override === 'full'` → false; `override === 'mobile'` → true; otherwise `isTouchViewer(env)` (part A) **and** short screen side < 600 px.
- Override stored in localStorage `curahub-mobile-planner` (`'full' | 'mobile'`, absent = automatic). Links: „Vollen Editor öffnen" (mobile view footer) and „Mobile Ansicht" (only shown in the full editor's user menu on touch devices).
- `EditorLayout` renders `MobilePlannerLayout` instead of the editor UI for `/exhibition/:projectSlug/edit` and `/project` when the mode is on. `/exhibition/:projectSlug/assets` (asset library) is not changed.

### Layout (`src/components/mobile/MobilePlannerLayout.tsx`)

- Slim header: the existing `ProjectSelector` (project / exhibition / version) and part D's `PublishedVersionBadge` (incl. „Neu veröffentlichen" on a working copy) and the user menu.
- Top: the 3D room. Bottom: a sheet (half height, can be collapsed to a handle) with tabs **„Raum"** and **„Assets"**.
- The editor's data loading, auto-sync, live presence and claims run as in the full editor (same stores, same `EditorPage` canvas setup reduced to the mobile scene).

### 3D room

- The editor's `Scene` in perspective/orbit mode with `camera-controls` touch gestures (one finger orbit, two fingers zoom/pan). Home pose as in the editor (`cameraHomePose`).
- Not mounted: transform gizmo, selection marquee, multi-select, wall editor, first person, keyboard shortcuts, restriction zones editing, scale-figure editing.
- Tap on an artwork → `selectInstance(id)` (claims as usual; selection outline as usual). Tap on empty space → `clearInstanceSelection()`. Taps on walls/figures do nothing.

### Tab „Raum" (artwork selected)

- Title, artist, year, real size (cm).
- Frame and passepartout controls: the existing `src/components/properties/FrameControls.tsx` (profile, finish, passepartout width and placement), unchanged behaviour — edits go through the store actions it already uses (auto-sync, undo, part D's published-version dialog, live claims).
- Artwork held by someone else: controls disabled with „Wird gerade von *Name* bearbeitet" (`useHeldByOthers`).
- Button **„In AR an Wand"** (enabled when the artwork's real size is known, see §2).
- No selection: hint „Tippe ein Kunstwerk an."

### Tab „Assets"

- The project's assets as tiles (reusing the asset browser's data hook and thumbnails), search field, filter to images and videos.
- Each image/video tile: button **„In AR an Wand"** → frame sheet (§2). Models, splats, books: no button.
- No upload, no drag to place, no delete.

---

## 2. AR at the wall

### Size

Changed 2026-10-30 after testing (most artworks have no cm values): a placed artwork goes at its hung size (as in the editor: cm values or pixels/dpi, times its scale); the Room tab has „Breite / Höhe (cm)" fields (aspect kept) that change the hung size like the properties panel; the asset sheet has the same fields, preset the same way, used for AR only. AR is offered for pictures only.

### Frame sheet (asset list only)

Bottom sheet with `FrameControls` in a **local** state (not written to any instance), preset from `editorStore.defaultFrameStyle` / `defaultPassepartout`; choosing updates those defaults like the panel does. Buttons „In AR an Wand" and „Abbrechen".

### Building the model (`src/lib/mobilePlanner/arArtwork.ts` + a hidden mini canvas)

- One synthetic `ArtworkInstanceData` at the origin, facing +Z, centre at 0, with the chosen `frameStyle`, `passepartoutWidth`, `passepartoutPlacement`, the artwork's real size; for a placed artwork its own instance data with position/rotation reset.
- Rendered in a small offscreen R3F canvas with the **same components as the editor** (picture, `Passepartout`, frame via `FrameInstancer`) in part B's export mode (top texture tier, video still), so frame geometry, colours and textures match the editor exactly.
- When loaded (part B's `isExportSettled` logic): `prepareExportScene(scene, { maxTexture: 2048 })` → `GLTFExporter` binary → GLB `Blob` → object URL. Nothing is uploaded or stored; the URL is revoked when the AR sheet closes.

### Showing it

- `<model-viewer>` (`@google/model-viewer` 4.3.1, lazy-loaded only when AR is opened) in a full-screen sheet: `src` = the GLB object URL, `ar`, `ar-modes="webxr quick-look"`, `ar-placement="wall"`, `ar-scale="fixed"` (real size, no pinch scaling), plus a 3D preview with camera controls before entering AR.
- Button „In AR an Wand starten" (`activateAR()`); title and size line under the preview.
- iOS: model-viewer generates the USDZ from the GLB itself (Quick Look). Android: WebXR in Chrome (ARCore). `scene-viewer` is not used, it needs a public URL.
- AR not available (`canActivateAR === false`): the preview stays, with „AR wird auf diesem Gerät nicht unterstützt".

---

## 3. Error handling

| Case | Behaviour |
|---|---|
| No cm values | Size from pixels/dpi like the editor; editable in „Breite / Höhe (cm)" |
| Picture fails to load / export throws | Toast „AR-Modell konnte nicht erstellt werden." |
| Device without AR | 3D preview only + hint |
| Published version, frame changed | Part D's dialog (working copy / branch / discard) |
| Artwork held by another curator | Controls disabled with holder name |
| Override set to full editor | Full editor even on a phone; „Mobile Ansicht" in the user menu switches back |
| Rotation to landscape on a phone | Layout adapts; mode stays (decided once per page load) |

---

## 4. Tests

- **Vitest:** `isMobilePlanner` (phone, tablet, touch laptop, overrides); `arArtworkInstance(artwork, frame, passepartout)` builds the synthetic instance (origin, +Z, real size from cm, frame values); `arSizeLabel` / disabled reasons; asset filter (images/videos only get AR).
- **Manual, on the test stack (emulated phone via CDP, then real phones):** open a project on a phone width, tabs, tap an artwork, change frame (auto-sync PATCH visible), published-version dialog, asset list AR sheet, model-viewer opens with the generated GLB; on a real iPhone/Android: AR at a wall at real size.
