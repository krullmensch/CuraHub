# CLAUDE.md — CuraHub Digital Exhibition Planer

This file gives Claude Code full context about the project — its architecture, tech stack, development phases, active bugs, and coding conventions. Read this before making any changes.

---

## Project Overview

**CuraHub** is a browser-based 3D exhibition planning tool built for **HSBI (Hochschule Bielefeld)**. Curators plan artwork placements in virtual exhibition rooms with real-time 3D preview, version history, and public viewer links. Users build virtual gallery spaces, place artworks (images, videos, 3D models) on walls, configure lighting, navigate in first-person, and save/export their exhibitions.

---

## Commands

### Frontend (root directory)
- `npm run dev` — Vite dev server on port 5173, proxies `/api`, `/auth`, `/upload`, `/uploads`, `/public` to backend
- `npm run build` — TypeScript check + Vite build
- `npm run lint` — ESLint
- `npm run test` — Vitest (pure logic in `src/lib/**/*.test.ts` and the store's selection logic in `src/store`)

### Backend (`server/` directory)
- `cd server && npm run dev` — nodemon + ts-node on port 3000
- `cd server && npm test` — Jest (ts-jest)
- `cd server && npx prisma migrate dev` — apply migrations
- `cd server && npx prisma studio` — database browser
- `cd server && npm run build && node dist/scripts/backfill-splats.js --apply` — convert existing splat assets to `.spz` and render their thumbnails

Both frontend and backend must run simultaneously for development. The backend requires a MySQL database configured via `DATABASE_URL` in `server/.env`.

### Project website (`site/` directory)
- `cd site && npm run dev` — Astro dev server (static site only, not the app)
- `cd site && npm run build` — static build into `site/dist` + dead-link check
- `cd site && npm test` — `node --test` for the site's pure helpers

---

## Tech Stack

### Frontend

| Layer | Library | Version |
|---|---|---|
| UI Framework | React | 19.2.0 |
| 3D Rendering | Three.js (WebGPURenderer, WebGLRenderer fallback) | 0.186.0 |
| Gaussian Splats (WebGL fallback) | @sparkjsdev/spark | 2.2.0 |
| React ↔ Three.js | @react-three/fiber | 9.4.2 |
| 3D Helpers | @react-three/drei | 10.7.7 |
| Physics | @react-three/rapier | 2.2.0 |
| State Management | Zustand | 5.0.9 |
| UI Components | Radix UI (Dialog, DropdownMenu, Label, Separator, Slot, Toast) | various |
| Styling | Tailwind CSS | 3.4.1 |
| Animations | tailwindcss-animate | 1.0.7 |
| Icons | Lucide React | 0.562.0 |
| Routing | React Router DOM | 7.10.1 |
| Markdown | react-markdown + remark-gfm | 10.1.0 / 4.0.1 |
| Class Utilities | clsx, tailwind-merge, class-variance-authority | latest |
| Build Tool | Vite (rolldown-vite) | 7.2.5 |
| Language | TypeScript | 5.9.3 |
| Linter | ESLint + typescript-eslint | 9.x / 8.x |
| 3D Text | troika-three-text | 0.52.4 |
| BVH Acceleration | three-mesh-bvh | 0.8.3 |
| Math Helpers | maath | 0.10.8 |
| Camera Controls | camera-controls | 3.1.0 |
| Validation | Zod | 4 |

### Backend

| Layer | Technology |
|---|---|
| Server | Express 5, TypeScript, CommonJS modules |
| Database | MySQL via Prisma 5.22 |
| Auth | JWT + bcryptjs |
| Media Processing | Sharp (images), fluent-ffmpeg (video), exif-parser |
| Upload | Multer with per-type size limits |

---

## Project Structure

```
CuraHub/
├── src/
│   ├── components/         # React + Three.js components
│   ├── pages/              # Route pages (Editor, Login, Home, Viewer)
│   ├── store/              # Zustand stores (editorStore, authStore)
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities (cn(), imageUtils)
│   ├── assets/             # Static assets, fonts
│   └── App.tsx             # Router with protected routes
├── server/
│   ├── src/
│   │   ├── routes/         # Express route handlers (per resource)
│   │   └── index.ts        # Server entry, middleware, static serving
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   └── uploads/            # User-uploaded files
├── public/                 # Static 3D models, assets
├── vite.config.ts          # Dev proxy to Express, @ alias
├── tailwind.config.js      # Design tokens via CSS variables
└── docker-compose.yml      # MySQL container
```

---

## Architecture

### Frontend Data Flow

The editor layout is structured as follows:

- **EditorLayout**
  - Header (ProjectSelector, user menu)
  - Canvas (Three.js)
    - Scene
      - PlannerCameraSystem (ortho / perspective / first-person)
      - Lighting (ambient + directional + point, shadows)
      - Grid (infinite grid, mode-dependent)
      - PlacedArtworks → SelectableInstance → ModelInstance / VideoInstance
      - ModularWallsController → ModularWallMesh
      - RestrictionZones (OBB visualization)
      - ArtworkPlacement (ghost preview during drag)
  - AssetSidebar (left, collapsible)
  - PropertiesPanel (right, collapsible)
  - VersionPanel (center overlay)

### State Management

- **editorStore** — large single store covering UI state, camera, selection, transforms, instances, walls, restriction zones, undo/redo history, and drag state
- **authStore** — JWT token + user info with `persist` middleware (localStorage key: `curahub-auth`)
- **Auto-sync** — Zustand subscription watches `localInstances` changes, debounces (150ms), then diffs against previous state to PATCH/POST/DELETE only what changed
- **Undo/Redo** — full snapshot stacks (`pastInstances[][]`, `futureInstances[][]`)

### Multi-Selection (3D editor)

- State: `selectedInstanceIds` (all selected artworks) next to `selectedInstanceId`, the **primary** one (last clicked/added, always part of the array). Set both only via `setInstanceSelection(ids, primary?)`, `toggleInstanceInSelection`, `pickInstance(id, additive)`, `selectAllInstances`, `selectInstance`; `clearInstanceSelection` spreads the empty state. Walls/zones stay single-select and clear the artwork selection. Single-object UI (video controls, "Wand öffnen") keeps reading the primary id.
- Gestures: click = only this artwork, ⇧-click = toggle, ⇧-drag = marquee (`SelectionMarquee` DOM overlay + `SelectionBridge` in the canvas: projected bounds overlap, a ray to the artwork's centre must not hit a wall first; OrbitControls are off while ⇧ is held via `shiftHeld`), ⌘/Ctrl+A = all, ⌘/Ctrl+D = duplicate, the sidebar's "Im Raum" list (`PlacedArtworkList`: ⌘-click toggle, ⇧-click range).
- Group transform: with more than one artwork the gizmo drives an invisible pivot at the selection's centre (`useSelectionPivot`); members follow via `applyGroupDelta` (translate/rotate rigidly about the pivot, scale each about its own centre) and are committed once on mouse-up (`finalizeGroupMember`, one undo step). `ModalTransformSystem` is not mounted — G/R/S only switch the gizmo mode.
- Pure modules: `instanceBounds` (world bounds, frame + passepartout included), `selectionTransform`, `instanceTransform` (floor clamp, wall detach), `selectionOperations` (align height/axis, distribute, scale, frame, duplicate — each returns the new instance list or null), `placedArtworkGroups`, `marquee`, `selectionFaces`. `MultiSelectionPanel` replaces the artwork panel for more than one artwork.
- 2D editor hand-over: opening a face takes the selected artworks on it (`openFaceWithSelection`), closing hands `wallEditorSelection` back to `selectedInstanceIds`.

### Transform System (Blender-style)

Keyboard shortcuts: `G` grab, `R` rotate, `S` scale, `X/Y/Z` axis lock, `Shift` fine-tune, `Esc` cancel. Implemented via Three.js TransformControls + custom `ModalTransformSystem`.

`F` (and the panel's "Focus" button) focuses the selection: `lib/focusSelection.ts` builds the bounds of the selected artworks (`instanceWorldBounds`), modular wall or scale figure, `lib/focusFraming.ts` (`focusDistance`, `boundsFocus`, pure) turns them into an orbit distance from the perspective camera's fov/aspect (`cameraInfoBridge`, set by `PlannerCameraSystem`) and stores it as `focusTarget.distance`. Not in first person or the 2D wall editor. Modular wall labels ("Wall A") are drawn only while that wall is selected.

### 2D Wall Editor

Frontal, Figma-like editing of one wall face (`src/components/wall-editor/`, `src/lib/wallEditor/`): any of the four faces of a modular wall, or a wall of the room model.

- State: `editorStore.wallEditor` is a `WallEditorTarget` (`{ kind: 'wall', wallId, side: 'front' | 'back' | 'left' | 'right' }` or `{ kind: 'room', faceId }`, see `lib/wallEditor/faces.ts`) plus `wallEditorSelection` (its own multi-selection; `selectedInstanceId` stays null while the editor is open). `openFaceOf(state)` resolves the target to a frame (memoised, usable as a selector). View, tools, toggles and the room faces live in `src/store/wallEditorViewStore.ts` (`phase`: idle → entering → active → leaving).
- Wall coordinates (`lib/wallEditor/geometry.ts`): `u` metres from the face's left edge as seen from in front of it, `v` world height above the floor, `d` distance in front of the face; right = up × normal. `left`/`right` are the narrow end faces (local −X/+X). An artwork's face comes from the direction it faces (`sideOfInstance`, fallback: position) — never compare Euler angles directly.
- Room walls: `Satellit` (with `publishWallFaces`) runs `extractRoomFaces` on the wall mesh once — large vertical planes that face into the room (checked against the floor mesh) become faces; windows/doors are found as uncovered areas. Artworks on room walls have `wallId = null` and belong to a face by position + facing (`instanceOnFace`). While a room face is open the room model is hidden and `WallEditorRoomFace` draws that face (mesh named "Wall", so drag & drop placement still hits it). Double-clicks on room walls are handled by a native listener in EditorPage (`wallEditorBridge.pick`), because R3F handlers on the room mesh would stop `onPointerMissed` from deselecting.
- Camera: `PlannerCameraSystem` flies the perspective camera to the frontal pose, then `WallEditorCamera` (orthographic, `zoom = pxPerM`) becomes the default camera. The DOM/SVG `WallEditorOverlay` uses the same wall ↔ screen mapping (`makeViewTransform`), so overlay and render line up pixel-perfectly.
- Hiding: other walls/artworks get `visible={false}` (not unmounted), the room meshes are hidden via `Satellit hideGeometry` (its lights stay on). `FrameInstancerRegistry` collapses frames whose anchor has a hidden ancestor.
- Drags move the Three.js groups directly (`applyDraft`, `wallEditorBridge.invalidate()`) and commit once on pointer-up via `commitWallOffsets` (one undo step, auto-sync PATCHes the positions). Footprints: framed pictures are computed from `artworkFrameLayout(inst)` (frame and passepartout, 7.5–21 mm of profile beyond the opening), everything else is measured from its meshes (`lib/wallEditor/footprint.ts`).
- Layout math (align, distribute, spacing, snapping, measuring) is pure and lives in `lib/wallEditor/layout.ts`; commands on the selection in `lib/wallEditor/operations.ts`.
- `artworkTextureManager` also sizes textures for orthographic cameras (on-screen size = `sizeM × pxPerM`).
- EditorPage's keyboard handler ignores everything but undo/redo while the editor is open; the overlay handles its own keys.
- Hanging height and ruler guides are stored per exhibition version (`ExhibitionVersion.hanging_height`, default 1.45 m, and `wall_guides`, keyed by `targetKey`). `lib/wallEditor/layoutSync.ts` (started by EditorPage) loads them from `GET …/versions/:vid/wall-layout` and PATCHes the full state 300 ms after a change; it never dispatches editor actions. Guides: `axis 'h'` = horizontal, value above the face's floor; `'v'` = vertical, value from its left edge (`lib/wallEditor/guides.ts`). Top ruler → horizontal guide, left ruler → vertical guide. Temporary → real wall ids and deleted walls reach the guides through `lib/wallEvents.ts`; the server rewrites the keys when versions are copied or merged (`server/src/lib/wallGuides.ts`).
- The panel has tabs Anordnen / Werk / Linien (`panelTab` in wallEditorViewStore; a selection switches to Werk until a tab is picked by hand). Scaling (S modal, corner handles, ±5 %, W×H fields) is always about the picture centre (Alt on a handle: opposite corner fixed), monitors excluded; math in `lib/wallEditor/scale.ts`, the preview is drawn by the overlay and committed once (`scaleArtworks` → `commitScaledArtworks`), because frame profiles come from instance data and a scaled group would stretch them.
- Measures in 3D: the toggles `showHangingLine` / `showFloorDistances` / `showGaps` are shared by 2D and 3D and persisted (`lib/wallEditor/measureToggles.ts`, localStorage `curahub-wall-measures`); the tool bar's "Maße" popover switches them too. `lib/wallEditor/annotations.ts` computes them for every face with artworks (`collectMeasuredFaces`, `faceAnnotations`, `floorLeaders` — pure, Vitest). `WallMeasurements3D` draws them in the orbit view only: lines as merged quads 3 mm in front of the wall (one mesh per colour), labels as `sizeAttenuation: false` sprites (textures from `lib/measureLabelTextures.ts`). Labels are depth-tested but slide along the view ray towards the camera (screen position unchanged) so they don't cut into their own wall at oblique angles, and hide when the camera is behind their face.

### Selection Outline

`SelectionOutline.tsx`: `SelectionOutlineTracker` (inside the Canvas) projects the selected artwork's corners every frame into one SVG path (`SelectionOutlineSvg`, over the canvas): constant 2.5 px, no depth test, same on WebGPU and WebGL. Framed pictures use `artworkFrameLayout` (the frame is instanced elsewhere), videos the front rectangle of their mesh bounds, models/splats the 12 box edges — only those bordering a camera-facing face (`lib/boxOutline.ts`, `visibleBoxEdges`; all 12 when the camera is inside the box, so room-sized captures keep their outline; no occlusion by other objects); a splat is measured by its `SplatHitProxy` box (`userData.selectionBounds`). The instance components no longer tint or box the selection themselves.

### Picture Frames & Passepartouts

Modelled on two real ranges: HALBE magnet frames (halbe-rahmen.de) and Max Aab solid-wood frames (aab-bilderrahmen.com, data in `docs/frames-aab-bilderrahmen.md`). Per instance: `frameStyle` (`"<profile>-<finish>"`, e.g. `alu8-silber-matt`, `aab102-aab-kirsche`, or `'none'`; `frameStyle()` cuts at the first `-`), `passepartoutWidth` (cm at the sides, 0 = none) and `passepartoutPlacement` (`center` | `optical-center` | `golden-ratio`). One catalogue, `src/lib/frameStyles.ts`, is the single source of truth; `server/src/lib/frameStyles.ts` mirrors the profile → finish table for API validation (and maps the first catalogue's legacy ids like `alu-silver`, so does `frameStyleOf` on the client).

- Catalogue: 14 profiles — HALBE Alu 6/7/8/12/14/18 and Holz 10/16/20/22, Aab 116/102/107/111 — with the maker's face width and depth from their cross-sections, 29 finishes (Aab ids prefixed `aab-`), and only the combinations each maker sells (`PROFILE_FINISHES`, 88 styles). Profiles and finishes carry a `manufacturer`; the panel groups profiles by `FRAME_LINES` (maker · material). `styleForProfile` keeps the colour, else the same family of the same maker, else the closest-looking colour (OKLab distance, `lookDistance`). Aab profiles have `formats` (the picture sizes Aab makes them for; the panel warns outside). The frame opening is always exactly the picture (or passepartout) — no rebate covers it.
- Layout: `framedArtworkLayout()` is the one place that knows where frame, board and picture go (opening size and offset, picture z, outer bounds). SelectableInstance, the drag ghost, the wall editor footprint (`artworkFrameLayout`), the floor clamp and the panel's "Außenmaß" all use it. The picture's centre is the anchor; a passepartout grows the frame around it, downwards more than upwards for the optical centre (HALBE: top = 0.93 × mean) and the golden ratio (bottom = 0.618 × sum).
- Geometry (`src/lib/frameProfileGeometry.ts`): generated from the profile cross-section — no model file. Per profile one corner piece (the W × W square outside an opening corner, split along the 45° mitre) and one 1 m edge that instances stretch in length only. Corners and edges meet exactly at the opening corners and share no faces (nothing to z-fight). The inner reveal reaches 2 mm behind the picture surface (`LIP_OVERLAP`) so no sliver of the hollow profile shows at grazing angles.
- Box frame (Aab 111, `objectDepth` = 15 mm): the picture/board sits `objectDepth` deeper (`framedArtworkLayout`), and the geometry gets a second group — a 3 mm white spacer strip flush with the lip from the glass down to the back board, with baked occlusion in its vertex colours. `getFrameStyleMaterial(style)` returns `[finish, spacer]` for it, so it is still one InstancedMesh pair per style.
- UVs: U along the moulding in metres, V around the cross-section in metres (seam on the hidden back face), so a veneer texture wraps around the profile and turns at the mitre; the edge's stretch doesn't show because the grain only varies across V.
- Textures (`src/lib/frameTextures.ts`, pure functions): wood grain per species (`SPECIES`: oak/ash pores, walnut streaks, spruce late-wood lines, sipo ribbons, …) and brushed steel; smooth lacquers (`kind: 'lacquer'`, Aab Weiß/Lichtgrau) have no textures. Generated in `workers/frameTexture.worker.ts` (~100 ms per finish). `frameMaterials.getFrameMaterial` returns the material at once in the finish's average colour and attaches the textures when they arrive (`onFrameTexturesReady` → FrameInstancer invalidates). No canvas, no `onBeforeCompile` — WebGPU converts these materials to NodeMaterials and would drop a shader patch.
- Colours: albedos calibrated so the frame renders like the maker's photos under the gallery lighting + ACES: model `render = ACES(albedo_lin × 1.7)` (three's ACESFilmic, exposure 1.1), inverted per target colour. Aab's photos were first scaled ×1.17 (linear) so Aab Weiß is as bright as HALBE's white — see `docs/frames-aab-bilderrahmen.md` §5. `THREE.Color('#hex')` converts to linear — build byte data from the hex directly (`rgbOf`), not from a Color.
- Metals get `getFrameEnvironment()`, a small procedural equirect "gallery" (the scene has no environment map; without it anodised aluminium reflects black and chrome looks like grey paint).
- Passepartout (`src/components/Passepartout.tsx`): KLUG museum board, white, 1.5 mm, 45° bevel — the window at the back is exactly the picture. One mesh per matted picture; the frame's soft shadow on the board is baked into vertex colours (no shadow maps in the scene).
- Instancing: `FrameInstancerRegistry` groups slots **by style**; `FrameInstancer` mounts one InstancedMesh pair per style in use (geometry per profile, material per finish), so a room with three styles costs six draw calls.
- New drops take `editorStore.defaultFrameStyle` / `defaultPassepartout` (the last ones picked in the panel), which the drag ghost previews.
- Planned, not built yet: glass and a custom frame option — see `docs/frames-aab-bilderrahmen.md`. Coloured passepartouts are not wanted (white museum board only).

### Render Backends (WebGPU + WebGL fallback)

- `src/lib/rendererBackend.ts` decides per Canvas: WebGPU (`WebGPURenderer`) when a hardware adapter exists, otherwise the **classic `WebGLRenderer`** (never WebGPURenderer's WebGL2 backend). Override: `?renderer=webgl|webgpu` or the "Renderer" select in `RenderQualityControl` (localStorage `curahub-renderer`).
- `usePreparedRenderer()` creates the GPU device **before** `<Canvas>` mounts; the R3F `gl` factory must resolve immediately. R3F re-runs its async `configure()` on every Canvas render and, after awaiting a slow factory, works on a stale store snapshot (second camera with `aspect = 0` → black canvas).
- Everything WebGPU-only (`three/webgpu`, TSL, splat addon) lives in `src/lib/webgpuSupport.ts` (own chunk `vendor-three-webgpu`). Components get it via `getWebGPUSupport(gl)` after checking `isWebGPURenderer(gl)`.
- WebGPURenderer ignores `material.toneMapped`. `webgpuSupport` turns the renderer's tone mapping off and tone-maps converted classic materials with `toneMapped: true` per material, so photos/videos/street view stay untonemapped like on WebGL. Custom node materials (glass, grid) call `applySceneToneMapping` themselves.
- No `ShaderMaterial`/`onBeforeCompile` on the WebGPU path: port to TSL in `webgpuSupport` (see window glass, editor grid) and keep the GLSL version for WebGL.
- Use `getMaxAnisotropy(gl)` / `getMaxTextureSize(gl)` instead of `gl.capabilities`.
- Browser panes/tabs of agents run hidden (no rAF): verify rendering with headless Chrome over CDP (`--headless=new --enable-unsafe-webgpu`).

### Gaussian Splats

- Asset/medium type `splat` (`.ply`, `.sog`, `.spz`, `.splat`, `.ksplat`, max 1 GB). Server (`server/src/lib/splats.ts`) validates headers and tells splat PLYs from mesh PLYs.
- **Every upload is converted to `.spz`** (`server/src/lib/spz.ts` + `splatReaders.ts`), roughly a tenth of a raw INRIA PLY, and the source file is deleted — like the GLB pipeline. `metadata.originalFormat`/`originalSize` keep what was uploaded. `.ksplat` has no reader and stays as it is; a `.sog` that cannot be converted is rejected (no backend of ours reads SOG directly). The encoders are the exact inverse of three.js r186's `SPZLoader`/`GaussianSplatPLYLoader`, so a converted capture renders like its source (verified attribute by attribute in `server/src/tests/splatConvert.test.ts`).
- SOG v2 (`.sog`, PlayCanvas/SuperSplat) is read as what it is: a zip (fflate) of `meta.json` plus lossless WebP planes (decoded with sharp), dequantised into SPZ's arrays. An *unbundled* SOG export (a folder of `meta.json` + WebPs) is zipped into a `.sog` in the browser (`src/lib/uploadFiles.ts`) before upload, so its WebPs never become image assets.
- Asset-browser thumbnails are rasterised on the CPU during the upload (`server/src/lib/splatThumbnail.ts`): splats sorted back to front and composited as round Gaussians, written as the usual `-thumb-512/256.webp` pair. `SplatPreviewTile` shows it; captures from before fall back to the badge.
- `node dist/scripts/backfill-splats.js --apply` converts and thumbnails existing splat assets (dry run by default); `--rethumbnail` renders every thumbnail again.
- `SplatInstance` stands on the floor like `model3d`: capture flipped upright (`SPLAT_UP_FLIP`), anchored at the bottom centre of its robust (1–99 %) bounds. Clicks hit a box proxy (`SplatHitProxy`), not the splats.
- Real size: splat files have no unit (photo-trained captures come out in an arbitrary scale). The curator sets the real height once in the panel (`SplatHeightControl` → `PUT /artworks/:id { height }`, cm, null = file units as metres); `splatRealScale` scales every placement of that capture in an extra group, so instance scale stays relative. `modelBBoxMap` keeps the file-unit size and PropertiesPanel applies the factor itself.
- WebGPU: three.js `GaussianSplat`, parsed in `src/workers/splatParse.worker.ts`, geometry cached per URL. WebGL: Spark (`src/lib/sparkSupport.ts`, one `SparkRenderer` per renderer, `onDirty` → `invalidate`).
- `GaussianSplat` smears splats in render targets — hide splats (`hideSplats`) during offscreen captures such as the glass reflection.

### Maßstabsfigur (scale figure)

- Black person, exactly 1.73 m (`SCALE_FIGURE_HEIGHT` = `PLAYER_STATURE`, `src/lib/playerDimensions.ts`), model `public/models/scale-figure.glb` (mesh `ScaleFigure`, 3270 triangles, faces +Z, half-span 0.30 m). It is the `Character` of SHUTDOWN.gallery's "Quarantine Diary" scene, extracted, scaled and centred by `scripts/build-scale-figure.py` (Python stdlib; run command in the file header).
- Table `ScaleFigure` per version (`position_x/z`, `rotation_y`, `isPublic`), route `/scale-figures`, copied with versions and merges; `/public` returns only `isPublic` figures.
- Store: `localScaleFigures`, `selectedFigureId` (exclusive with instance/wall/zone selection), auto-sync diff block like walls, no undo.
- `ScaleFigures.tsx`: one shared geometry + two shared materials, `TransformControls` (X/Z move, Y turn, tilt removed in `onChange`), hidden in the wall editor, no collider. New figures: toolbar button → `scaleFigureBridge.spawnPose()` (screen-centre ray on the floor, facing the camera).
- Artwork drops ignore figures (`userData.scaleFigure`).

### Bücher (PDF auf Sockel)

- Asset type / medium `book` (`.pdf`, max 200 MB, `%PDF-` signature checked). The PDF lives in `<uploads>/.books/` (dot-directory, never served by `express.static`) and is only served by `GET /api/books/:assetId/pdf` (project access, or `Artwork.publicReadable` + an instance in a published version **of the asset's own project** — `publishedPlacementWhere` in `server/src/lib/bookAccess.ts`; else 404). Extensionless so Cloudflare keeps `Range`. `/public` returns book instances without `metadata.pdfFile`; `publicReadable` only gates opening, the book itself always stands there.
- `lib/bookJobs.ts` queue (like `videoJobs`): `pdfinfo` → `pdftoppm` page 1 (`execFile`, 30/60 s SIGKILL) → sharp cover `<stem>-cover-<n>.webp` + thumbs; `Asset.path` is the cover, the job creates the `Artwork` (page size in cm). Cover changes bump `metadata.coverVersion` → new file names (no cache busting needed). Failures land in `metadata.processingError`. `poppler-utils` is in the Docker image.
- Settings: `PUT /artworks/:id` (`depth` cm or null = auto, `publicReadable`), `POST|DELETE /assets/:id/cover`. One form, `BookSettingsForm`, in two modes: `mode="inline"` in the right sidebar for a selected book (`BookPropertiesActions`; text fields commit on blur/Enter, the thickness slider on the native `change` event, „Automatisch", the checkbox and cover actions at once; no success toasts; fields re-sync per field when fresh instance data arrives, keyed by instance id) and `mode="dialog"` in `BookSettingsDialog` (asset browser double-click; „Speichern" saves all, a thickness that wasn't edited is not sent). Pure helpers in `lib/book/settingsForm.ts`. `VideoProcessingBadge` is reused (phases `cover`, `tiers` added); server `INSTANCE_MEDIA` includes `book`.
- 3D (`components/book/`): one instance = pedestal (1.10 m, book + 10 cm/side, min 40 × 40 cm) + closed book lying flat (cover +Y, top edge −Z, spine −X). Sizes in `lib/book/geometry.ts`. Clicks hit a `BoxHitProxy` (`lib/boxHitProxy.ts`, shared with splats; book + 1 cm, ≥ 5 cm high). Books never scale (`isFixedSizeMedium`), pedestal collider in first person.
- Books in any selection (single or group) get gizmo rotate Y only / translate without Y; commits force them upright on the floor (`y = 0`), yaw read from the quaternion (`'YXZ'`, so yaw beyond 90° survives). Book double-clicks don't pass through to walls behind.
- Viewer: `bookViewerStore` + `lib/book/viewerActions.ts` (store before `exitPointerLock`; close button re-locks, ESC leaves first person in the editor). Every control asks `useControlsLocked()` (`isDialogOpen || book`). `BookViewerOverlay` (lazy, pdfjs-dist 5.7 — no `isEvalSupported` option, no eval; ESC stops propagation so the editor's escape handler doesn't also fire) is `react-pageflip`/`page-flip` 2.0.7 in the look of the zine flipbook (`BookFlipbook.tsx`/`.css`: light stage, matte curl, paper grain, spine shadow, centred covers, single page below 300 px page width); pages still come from pdf.js and are rendered into canvases only within 6 pages of the current one (`lib/book/flipPages.ts`: page size, preload window, render scale). Editor: double-click / „Buch öffnen"; first person: crosshair within 2.5 m + click (footer row „Klicken zum Lesen" in the `ArtworkInfoOverlay` info panel, shown when `bookInReachId` is the hovered artwork; the click doesn't toggle the panel).

### Live Collaboration (WebSockets)

Design and steps: `docs/superpowers/specs/2026-10-03-live-collaboration-design.md` (all five steps built: channel + presence, claims, live changes, others in the scene, viewer blobs; user manual: `src/wiki/collaboration.md`).

- One `ws` server on the API's HTTP server, path `/api/live` (`/live` behind Vite's proxy, which has `ws: true`). State is in memory (one Node process). `server/src/live/hub.ts` is socket-free (injected `send` + access resolvers, Jest with fake timers); `live/server.ts` binds it to `ws` (setup gate 503, origin check in `live/origin.ts`, ping every 15 s).
- Handshake: first message `hello { session, token? }` within 5 s — JWT in the message, never in the URL. `session` = one UUID per tab, bound to the first user that used it; a closed tab stays listed for 10 s (grace) so reconnects don't flicker.
- Editor: `startEditorPresence()` (EditorLayout) sends `where { exhibitionId, versionId, mode }` (`orbit` | `firstPerson` | `wallEditor`); access = `exhibitionAccessFilter`. The server answers with one `presence` list per exhibition, plus `publicVisitors`. Public viewer: `visit { slug }` (published exhibitions only) → `visitors { count }`.
- Client: `src/lib/live/liveClient.ts` (socket-free, reconnect backoff 1 → 15 s, Vitest with a fake socket), `liveConnection.ts` wires it to `authStore`/`liveStore`; `src/components/live/PresenceAvatars.tsx` = header bar, version-graph avatars, viewer counter. Pure helpers in `src/lib/live/presence.ts`.
- Apache needs `upgrade=websocket` on `ProxyPass` (2.4.47+), see `deploy/apache/curahub.conf`.
- Claims ("Sperren", never call them locks — `ModularWall.isLocked` is "Wand fixieren"): selecting claims. Keys `instance:<id>` / `wall:<id>` / `figure:<id>`, database ids only; a wall's group includes the artworks hanging on it. `claim { seq, groups }` always carries the full set (`lib/live/claims.ts` `desiredClaimGroups`, sent by `ClaimSync` with an 800 ms linger for dropped keys). editorStore asks `lib/live/claimGate.ts` (`heldBy`) in `instanceSelection`, `selectInstance`, `toggleInstanceInSelection`, `selectWall`, `selectFigure`, the wall editor selection, and in undo/redo (`keepHeldInstances`); liveConnection fills the gate from `claims` messages. Server: `PATCH`/`DELETE` on instances, walls, figures call `ensureNotClaimed` (`server/src/live/claimGuard.ts`) after the access check → 423; auto-sync sends `X-Live-Session` (`lib/live/session.ts`) and undoes refused changes (`restoreRefused`) instead of retrying. 5 min without input clears the selection.
- Live changes: routes call `publishChange` / `publishVersionEvent` (`server/src/live/broadcast.ts`, hub via `live/registry.ts`) after the response; every new write route that touches a version's content must do the same. Messages `version { seq }` on entering, `changed { seq, by, kind, op, data }`, `versions { event }`. Client: `ChangeSequence` (gaps → full merge), `applyRemoteChange` / `mergeRemoteState` in editorStore (write local list + auto-sync snapshot + undo history, never mark dirty; rules in `lib/live/remoteChanges.ts`), `applyRemoteWallLayout` in layoutSync, `versionsRevision` in liveStore → VersionPanel refetches.
- Others in the scene (`components/live/LiveSceneLayer.tsx`, `RemoteSelections.tsx`, mounted in EditorPage): live drags are detected by comparing held objects' actual Three.js poses (`DragTracker` in `lib/live/sceneSync.ts`), so new ways of moving objects need no extra wiring — but walls and figures must stay registered in `lib/live/sceneObjects.ts`. Receivers restore an object's own pose before the saved change is applied (`remotePreviews.release`). Camera poses via `lib/live/cameraPose.ts` → `pose`; avatars from `lib/live/avatarPoses.ts`. Default walls are posted with `isDefault` (server creates each label once per version).
- Public viewer: visitors' poses go only to other visitors of the exhibition, under a random `visitorId` (never the session id); `gone` when they leave. `VisitorBlobs` (lazy) = spring chain (`lib/live/blobChain.ts`) → metaballs in three's `MarchingCubes`.
- Avatars: `boring-avatars` (variant `beam`, palette `avatarPalette(color)`), `PresenceAvatar` / `SelfAvatar` / `HolderBadge` in `components/live/PresenceAvatars.tsx`; `useHeldByOthers()` (`hooks/use-held-claims.ts`) for lists.

### Backend API

Routes mounted per resource at `/auth`, `/upload`, `/assets`, `/instances`, `/projects`, `/walls`, `/scale-figures`, `/restrictions`, `/public`. Each route file defines its own `authenticate` middleware (JWT verification). Access control uses nested Prisma queries to verify ownership.

### Setup & Deployment

- Fresh install = `docker compose up -d` + web wizard at `/setup` (runbook: `docs/deployment.md`, Apache snippet: `deploy/apache/curahub.conf`). The `init` service writes `db_root_password`, `db_password`, `jwt_secret` into volume `secrets` (`/run/curahub-secrets`); `lib/loadSecretEnv` fills `DATABASE_URL`/`JWT_SECRET` from them when unset (env always wins) — import it first in every entry point and script. `JWT_SECRET` comes from `lib/jwtSecret` only (production refuses to start without one).
- `SystemSetting` (`setup_completed_at`, `public_url`); `lib/setupState` caches it. Until completion `lib/setupGate` answers 503 `setup_required` on every API namespace; the one-time code is printed to the log, setup tokens are signed with an in-memory secret (never `JWT_SECRET`). `/setup` routes 404 afterwards; `scripts/reset-setup.js` re-opens.
- Local emergency accounts: `User.email` without `@`, bcrypt hash, `POST /auth/local-login` („Notfall-Login" on the login page); `scripts/reset-local-admin.js <name>`.
- CORS: `CORS_ORIGINS` else `public_url`; `trust proxy` = loopback + private ranges; `cf-connecting-ip` only with `BEHIND_CLOUDFLARE=true` (`lib/rateLimit`). System checks (`lib/systemChecks`) show in the wizard and on `/users`.

### Project website (`site/`)

Public German site on GitHub Pages (`https://krullmensch.github.io/CuraHub/`): landing page, wiki, setup guide. Astro 7, own `package.json` (Node ≥ 22.12 for the site; the app's Docker image stays on Node 20), plain CSS, no client framework; the app's build, lint (`globalIgnores`) and Docker image (`.dockerignore`) ignore `site/`.

- One source for texts: the wiki pages are `src/wiki/*.md` in the order of `src/wiki/pages.json` (also read by `WikiView`; `src/wiki/pages.test.ts` keeps both in step), the setup guide is `docs/deployment.md`. Never copy them into `site/`. `site/src/pages/setup.astro` splits the rendered runbook HTML to insert the wizard screenshots above the installation steps, so `docs/deployment.md` must keep a `## Neuinstallation` heading followed by a numbered list, or the site build fails.
- Internal links only through `url()` (`site/src/lib/url.ts`); `base` lives in `site/astro.config.mjs`. `npm run build` = `astro build` + `site/scripts/check-links.mjs`, so a dead internal link fails the build.
- `remarkRepoLinks` turns inline code that is a path to an existing repo file into a GitHub link.
- Screenshots: PNGs in `site/src/assets/screenshots/`, names + alt texts in `site/src/lib/shots.mjs`; `site/src/lib/shots.test.mjs` fails when a listed PNG is missing. Captured by hand with `node site/scripts/capture-screenshots.mjs <base-url> [shot …]` (headless Chrome over CDP, never run by CI; credentials only from `CURAHUB_SHOT_USER`/`CURAHUB_SHOT_PASSWORD`, the wizard's code from `CURAHUB_SETUP_CODE`), the state of each shot is in `site/scripts/shots.config.mjs`. The demo exhibition "Licht und Landschaft" (slug `licht-und-landschaft`) lives on the test stack; its works are credited in `site/src/assets/screenshots/CREDITS.md`. Headless Chrome has no Pointer Lock, so the viewer shot uses a stand-in in `shots.config.mjs`.
- Legal pages: any `site/src/content/legal/<name>.md` (see `site/src/content.config.ts`, `site/src/pages/[legal].astro`) becomes `/<name>/`; `impressum.md` also adds the footer link. The folder is empty until the site owner writes one.
- `.github/workflows/site.yml` builds on pull requests and deploys only from `main` (push to `main` or a manual run on `main`); it runs only when `site/`, `src/wiki/`, `docs/deployment.md`, the fonts, the hero video or `deploy/` change.

### Database Schema (key models)

- `User → Project → Exhibition → ExhibitionVersion → ArtworkInstance`
- `ExhibitionVersion → ModularWall → ArtworkInstance` (wall-mounted)
- `ExhibitionVersion → RestrictionZone`
- `Asset → Artwork → ArtworkInstance`
- Versions support a `parent_version_id` for branching history.

### Media Pipeline

- **Images** — client-side resize to 2500px max as WebP 80%, server extracts EXIF
- **Video** — server transcodes to H.264 MP4 via ffmpeg, generates thumbnails
- **3D Models** — direct upload (GLB/GLTF/OBJ/FBX), 50MB limit
- **Gaussian Splats** — PLY/SOG/SPZ/SPLAT converted to `.spz` on the server (thumbnail rendered on the CPU), KSPLAT stored as uploaded, 1GB limit
- **Size limits** — image 10MB, video 200MB, model 50MB
- **Folder uploads** — drag & drop of folders and the "Ordner hochladen" picker walk folders recursively (`src/lib/uploadFiles.ts`, the one place that knows which files the client sends). OS clutter (`.DS_Store`, `__MACOSX`, dotfiles) is dropped silently; every other unsupported file is listed in the upload modal as a hint.

---

## Project Architecture & Phases

### Phase 1 — Project Foundation

**Goal:** Establish the base project structure and tooling.

- Vite + React + TypeScript scaffold
- Tailwind CSS with `tailwindcss-animate` configured
- Radix UI primitives installed for accessible overlays, dropdowns, toasts
- `clsx` + `tailwind-merge` utility pattern (shadcn/ui-style `cn()` helper)
- ESLint with `eslint-plugin-react-hooks` and `typescript-eslint` configured
- React Router DOM for route-level navigation (e.g., `/editor`, `/preview`, `/export`)
- Base Zustand store skeleton with typed slices

**Conventions established in this phase:**
- All component files: `PascalCase.tsx`
- All hook files: `use-camelCase.ts`
- Store slices in `src/store/slices/`
- Types in `src/types/`

---

### Phase 2 — 3D Scene Architecture

**Goal:** Set up the core Three.js canvas and render pipeline.

- `<Canvas>` from `@react-three/fiber` as the root 3D context
- Camera config: `PerspectiveCamera`, FOV ~75, near `0.01`, far `1000`
- `@react-three/drei` helpers in use: `Environment`, `useGLTF`, `useTexture`, `Html`, `TransformControls`, `BakeShadows`, `PresentationControls`
- `@react-three/rapier` physics world wraps the scene for collision and gravity
- Scene render order: physics world → room geometry → artworks → lighting → post-processing
- `three-mesh-bvh` applied to complex room meshes for raycast performance
- Frame loop: use `useFrame` with `delta` for time-independent animations; never mutate state inside `useFrame`
- Renderer settings: no shadows (`CANVAS_SHADOWS`, `PCFShadowMap` — `PCFSoftShadowMap` is gone in r186), tone mapping `THREE.ACESFilmicToneMapping` (exposure 1.1)

**Key components:**
- `<SceneCanvas />` — root canvas wrapper
- `<PhysicsWorld />` — Rapier `<Physics>` provider
- `<ExhibitionRoom />` — walls, floor, ceiling geometry
- `<SceneLighting />` — light setup, shadow casters

---

### Phase 3 — Exhibition Space / Room Builder

**Goal:** Allow users to construct gallery rooms with configurable geometry.

- Walls, floors, and ceilings are `THREE.BoxGeometry` meshes with `RigidBody type="fixed"` colliders from Rapier
- Mesh normals face inward for interior rendering
- Wall thickness: minimum `0.1` units to prevent light leaking (see Known Issues)
- Room dimensions stored in Zustand: `{ width, height, depth }` with reactive updates
- `MeshStandardMaterial` used throughout for PBR lighting compatibility
- `castShadow` and `receiveShadow` enabled on all architectural surfaces
- UV mapping for wall textures uses `THREE.RepeatWrapping`

**Pattern for room geometry:** Always use `RigidBody type="fixed"` with `colliders="cuboid"` for all static architectural surfaces.

---

### Phase 4 — Asset Management / Asset Browser

**Goal:** Provide a sidebar panel for managing and previewing all exhibition assets.

- Asset types supported: `image` (JPG/PNG/WebP), `video` (MP4/WebM), `model` (GLB/GLTF/OBJ/FBX), `audio` (MP3/WAV)
- Assets stored in Zustand as typed `Asset[]` with `id`, `type`, `url`, `name`, `metadata`
- **Video preview** — uses `<video>` HTML element with `muted autoPlay loop` inside an `Html` drei component or as a 2D thumbnail
- **3D Model preview** — **NOT YET IMPLEMENTED** (see Feature Requests). Target: a small isolated `<Canvas>` per asset card with `<PresentationControls>` orbit and `useGLTF` loader
- Asset uploads handled via Multer on the backend with per-type size limits
- `useGLTF.preload()` called at module level for all known model paths
- `useTexture` from Drei handles image assets with suspense boundary

**Asset Browser component structure:**
- `AssetBrowserPanel.tsx` — sidebar shell
- `AssetGrid.tsx` — grid of AssetCard
- `AssetCard.tsx` — thumbnail, name, type badge
- `AssetCardModel.tsx` — isolated mini-canvas for GLB preview (TODO)
- `AssetCardVideo.tsx` — video element thumbnail
- `useAssetStore.ts` — Zustand slice

---

### Phase 5 — Artwork Placement System

**Goal:** Let users drag assets from the Asset Browser onto walls and configure their placement.

- Artwork placed on a wall creates an `ArtworkInstance` in Zustand with `{ id, assetId, wallId, position, rotation, scale }`
- Placement uses raycasting via `useThree` + pointer events on wall meshes
- `TransformControls` from Drei enables move/rotate/scale when an artwork is selected
- Selection state tracked in Zustand: `selectedArtworkId: string | null`
- **Bounding box**: `THREE.BoxHelper` or `<Box3Helper>` — visibility MUST be tied to `selectedArtworkId === artwork.id` (see Known Issues)
- Each artwork type renders differently:
  - Image → `PlaneGeometry` + `MeshBasicMaterial` with texture
  - Video → `PlaneGeometry` + `MeshBasicMaterial` with `VideoTexture`
  - 3D Model → `useGLTF` loaded mesh, positioned in world space
- Ref maps used for 3D object access: `instanceRefMap`, `videoRefMap` (`Map<number, THREE.Group>`)

**Critical: Artwork ID generation** — Always use `crypto.randomUUID()` or `nanoid()`. Never use `Date.now()` or array index — these cause duplicates on rapid auto-save (see Known Issues).

---

### Phase 6 — First Person Viewer / Navigation

**Goal:** Allow users to walk through the exhibition in first-person.

- First-person camera uses Rapier `RigidBody` + `KinematicCharacterController` or a manual approach with `useFrame` velocity updates
- Pointer lock API engaged on canvas click for mouse-look
- WASD movement with `useKeyboardControls` from Drei
- Collision detection handled by Rapier capsule collider on the player body
- `camera-controls` used in editor mode; raw Three.js camera manipulation in first-person mode — do not mix the two
- Camera modes: `'orthographic' | 'perspective' | 'firstPerson'` (type: `PlannerViewMode`)
- **Video performance** — VideoTexture updates every frame by default. For first-person mode, throttle `videoTexture.needsUpdate` to every 2nd frame, or use `requestVideoFrameCallback` (see Known Issues)

**Player constants** (`src/lib/playerDimensions.ts`): stature 1.73 m, eye height 1.62 m, capsule radius 0.3 / half height 0.565 (body centre 0.865). Import them from the lib, not from `Player.tsx` (Rapier chunk). Always use delta time: `velocity * delta`.

---

### Phase 7 — Lighting System

**Goal:** Illuminate the exhibition space with configurable, shadow-casting lights.

- Light types in use: `AmbientLight`, `DirectionalLight`, `PointLight`, `SpotLight`
- All non-ambient lights have `castShadow = true`
- Shadow camera frustum must be tightly fitted to the room — oversized frustums degrade shadow quality
- `shadowMap.mapSize`: default `1024×1024`; increase to `2048` only for key lights
- **Light leak fix** — wall geometry must have non-zero thickness. Planar (zero-thickness) walls cause light bleeding. Minimum recommended thickness: `0.15` world units. Also ensure `side = THREE.FrontSide` is NOT used on interior surfaces — use `THREE.BackSide` for inside-facing walls or `THREE.DoubleSide` if needed (see Known Issues)
- Lights stored in Zustand as `LightConfig[]` with `{ id, type, position, intensity, color, castShadow }`
- `BakeShadows` from Drei can be toggled for static scenes to improve performance

---

### Phase 8 — Save / Load / Version System

**Goal:** Persist the exhibition state reliably across sessions with full version history.

- Zustand `persist` middleware for auth state (localStorage key: `curahub-auth`)
- **Auto-sync** — Zustand subscription watches `localInstances` changes, debounces at 150ms, then diffs against previous state to PATCH/POST/DELETE only what changed. Never use `useEffect` on the full store object — this causes re-render loops (see Known Issues)
- Save format: serialized JSON of `{ room, artworks, lights, assets, metadata }`
- Version history: full snapshot stacks (`pastInstances[][]`, `futureInstances[][]`) with branching via `parent_version_id`
- Export: `JSON.stringify` store snapshot → `Blob` → `URL.createObjectURL` → anchor download
- Import: `FileReader` → `JSON.parse` → `zustand.setState` with Zod validation

**Auto-save rule:** The save function must only **write** state — it must never **dispatch** store mutations like `addArtwork`. Those must only ever be called from explicit user actions (drag-drop, button click).

---

### Phase 9 — UI / Editor Interface

**Goal:** Build the editor shell with panels, toolbars, and inspection controls.

- Layout: full-screen `<Canvas>` behind DOM overlay panels
- Panels use Radix UI `Dialog`, `DropdownMenu`, and custom sidebar components
- Toasts via `@radix-ui/react-toast` for save confirmations, errors, asset load feedback
- Inspector / PropertiesPanel shows position XYZ, scale, and material settings for the selected artwork or light
- Toolbar: mode switcher (Edit / First Person / Preview), light add button, export button
- VersionPanel as a center overlay for browsing and restoring versions
- All DOM overlay elements use `position: absolute` or `fixed` with `pointer-events: none` on the container and `pointer-events: auto` on interactive children, to pass clicks through to the canvas
- Typography: **Funnel Display** (headings), **Albert Sans** (body)
- Dark mode via Tailwind `class` strategy; semantic color tokens: primary, secondary, muted, accent, destructive

---

## Known Bugs & Active Issues

These are **confirmed bugs** that need to be fixed. Understand the root cause before editing related code.

---

### 🐛 Bug 1 — Auto-Save Creates Duplicate Artwork Instances

**Symptom:** After editing, hundreds of copies of the same artwork appear stacked on the wall.

**Root cause:** The auto-save `useEffect` is subscribed to the entire Zustand store object or a non-stable selector. Because `setState` triggers a re-render, the effect re-runs and calls `addArtwork` on each cycle instead of only saving state.

**Fix strategy:**
1. Move auto-save to a Zustand `subscribe` call outside React's render cycle, debounced at 150ms.
2. Ensure the save function only **writes** state, never **dispatches** store mutations.
3. If using `useEffect`, add an `isSaving` ref guard to prevent re-entrant calls.
4. Audit all `addArtwork` call sites — only explicit user actions (drag-drop, button click) should trigger them.

---

### 🐛 Bug 2 — Bounding Box Visible When Object Is Not Selected

**Symptom:** `BoxHelper` or `Box3Helper` is visible around 3D objects (like the duck model) even when they are not selected.

**Root cause:** The helper's `visible` prop is either hardcoded `true`, not tied to selection state, or the `selectedArtworkId` comparison has a type mismatch (`string` vs `number`) or stale closure.

**Fix strategy:** Use conditional rendering — `{isSelected && <boxHelper />}` — rather than `visible={isSelected}` on a `<primitive>`. Three.js helpers don't reliably respect the `visible` flag when propagated through R3F this way. The `isSelected` value must be read directly from the Zustand store inside the component via a selector: `(s) => s.selectedArtworkId === artwork.id`.

---

### 🐛 Bug 3 — First Person Viewer Lag on Video Artwork

**Symptom:** Frame rate drops significantly when the player looks at a wall displaying a video artwork.

**Root cause:** `THREE.VideoTexture` sets `needsUpdate = true` every frame by default, causing GPU texture uploads every frame and stalling the render pipeline.

**Fix strategy:**
1. Throttle `videoTexture.needsUpdate` to every 2nd frame inside `useFrame` using a frame counter.
2. Prefer `requestVideoFrameCallback` on the `<video>` element — this only triggers GPU uploads when a new decoded frame is actually available, eliminating unnecessary uploads entirely.
3. Ensure `mesh.frustumCulled = true` so off-screen video meshes stop updating.
4. Cap video asset resolution at 1080p — 4K VideoTextures are a guaranteed performance problem.

---

### 🐛 Bug 4 — Light Leaking Under Objects and Walls

**Symptom:** Light bleeds through floor/wall intersections and under placed 3D objects even when meshes visually touch.

**Root cause:** Three.js shadow map `shadowBias` misconfiguration, zero-thickness or very thin wall geometry, and potential gaps between Rapier colliders and visual meshes.

**Fix strategy:**
1. Set `shadow.bias = -0.0005` and `shadow.normalBias = 0.02` on each shadow-casting light.
2. Ensure all walls are at least `0.1–0.15` world units thick — zero-thickness planes will always leak.
3. Extend floors by `+0.01` into adjoining wall meshes to close geometry seams at corners.
4. Verify `MeshStandardMaterial` uses `side={THREE.FrontSide}` only when normals are correctly oriented; use `THREE.DoubleSide` on interior surfaces if in doubt.
5. Set `contactSkin={0}` on Rapier `RigidBody` for visual objects so colliders match mesh bounds exactly.

---

### 🚀 Feature Request — 3D Model Preview in Asset Browser

**Goal:** Show a live rotating preview of GLB/GLTF models in the Asset Browser, matching the existing video preview UX.

**Implementation strategy:** Render a small isolated `<Canvas>` per asset card (not shared with the main scene) using `PresentationControls` + `Stage` from Drei. Call `scene.clone()` on the GLTF result — this is critical to prevent the shared GLTF cache from being mutated by `TransformControls` in the main scene.

**Performance rules:**
- Use `dpr={[1, 1.5]}` — never full device pixel ratio for thumbnails.
- Only mount the Canvas when the card is visible, using `IntersectionObserver`.
- Call `useGLTF.preload(url)` when the asset is first added to the store.
- Lazy-mount on hover or after a 300ms delay to avoid blocking the main scene on initial load.

---

## Coding Conventions

### TypeScript
- Strict mode enabled: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- No `any` — use `unknown` + type guards
- Union types for enums: `type PlannerViewMode = 'orthographic' | 'perspective' | 'firstPerson'`
- Zod schemas for all API request validation and storage deserialization
- Path alias `@/*` maps to `src/*`
- Three.js types from `@types/three` — always import `THREE` as a namespace

### Naming
- **PascalCase** for components: `ProjectSelector`, `ArtworkPlacement`
- **camelCase** for hooks, functions, variables: `useEditorStore`, `fetchProjects`
- **UPPER_SNAKE_CASE** for constants: `GL_CONFIG`, `JWT_SECRET`, `SIZE_LIMITS`
- **kebab-case** for file slugs and URL paths

### React + R3F
- Functional components with hooks only — no class components
- Never create Three.js objects (geometries, materials) inside component render — use `useMemo`
- Dispose geometries and materials in `useEffect` cleanup or via `useGLTF`'s built-in cache
- Use `useThree()` for renderer/camera/scene access only inside the R3F component tree
- Keep `useFrame` callbacks lean — no state mutations, no heavy computation
- Selective Zustand subscriptions to minimize re-renders: always use individual property selectors

### Zustand
- Two stores: `editorStore` (scene/editor state) and `authStore` (auth + persist)
- Selectors must be shallow when selecting objects — use `shallow` from `zustand/shallow`
- Functional state updates: `set((state) => ({ ... }))` for immutability
- Actions co-located with their slice, not in components

### Key Patterns

| Pattern | Implementation |
|---|---|
| Selective store selectors | Individual property selectors instead of destructuring |
| Ref maps for 3D objects | `instanceRefMap`, `videoRefMap` (Map<number, THREE.Group>) |
| Debounced auto-sync | 150ms timeout, diff-based PATCH/POST/DELETE |
| Slug generation | Sanitize + collision avoidance + blocked slug list |
| Functional state updates | `set((state) => ({ ... }))` for immutability |
| Compound UI components | Card, Dialog, DropdownMenu via Radix + forwardRef |
| Protected routes | `<ProtectedRoute>` wrapper checking auth store |
| Vite dev proxy | All API paths proxied to `localhost:3000` |

### Performance
- `<Suspense>` boundaries around every async 3D asset load
- `React.memo` on pure 3D components that receive only primitive props
- BVH acceleration on room geometry for all raycasts
- Video textures: always throttled (see Bug 3 fix)
- Use `InstancedMesh` if the same artwork/object is repeated more than ~10×

### Key Conventions (Database & Units)
- Transforms stored as individual floats (`position_x`, `position_y`, `position_z`, etc.) in the database — **not** as JSON arrays.
- Three.js units = meters. Artwork physical dimensions stored in cm in the database, converted at render time.
- `instanceRefMap` and `videoRefMap` are global `Map<number, THREE.Group | HTMLVideoElement>` for imperative access to Three.js objects outside React.
- The UI language is **German** — all user-facing strings, labels, toasts, and error messages must be in German.
- Fonts: "Funnel Display" (display) and "Albert Sans" (body) configured via Tailwind config.

---

## Claude Code Guidelines

- **Before adding a new feature**, check whether a Drei helper or Radix primitive already covers it.
- **When fixing the bounding box bug**, search for all `BoxHelper`, `Box3Helper`, and `EdgesGeometry` usages.
- **When fixing auto-save**, search for all `useEffect` blocks that call any `add*` or `set*` store action.
- **Do not refactor working code** when fixing a specific bug — minimal, targeted changes only.
- **Preserve existing Zustand slice structure** — do not rename actions or selectors without updating all consumers.
- **Test in first-person mode** after any lighting or video change — that is where performance regressions appear first.
- All new components need TypeScript types — no implicit `any` props.
- Run `npm run lint` before considering any task done.