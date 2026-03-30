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

### Backend (`server/` directory)
- `cd server && npm run dev` — nodemon + ts-node on port 3000
- `cd server && npm test` — Jest (ts-jest)
- `cd server && npx prisma migrate dev` — apply migrations
- `cd server && npx prisma studio` — database browser
- `cd server && npx prisma db seed` — seed via `prisma/seed.ts`

Both frontend and backend must run simultaneously for development. The backend requires a MySQL database configured via `DATABASE_URL` in `server/.env`.

---

## Tech Stack

### Frontend

| Layer | Library | Version |
|---|---|---|
| UI Framework | React | 19.2.0 |
| 3D Rendering | Three.js | 0.181.2 |
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

### Transform System (Blender-style)

Keyboard shortcuts: `G` grab, `R` rotate, `S` scale, `X/Y/Z` axis lock, `Shift` fine-tune, `Esc` cancel. Implemented via Three.js TransformControls + custom `ModalTransformSystem`.

### Backend API

Routes mounted per resource at `/auth`, `/upload`, `/assets`, `/instances`, `/projects`, `/walls`, `/restrictions`, `/public`. Each route file defines its own `authenticate` middleware (JWT verification). Access control uses nested Prisma queries to verify ownership.

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
- **Size limits** — image 10MB, video 200MB, model 50MB

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
- Renderer settings: `shadows`, `shadowMap.type = THREE.PCFSoftShadowMap`, tone mapping `THREE.ACESFilmicToneMapping`

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

**Player constants:** `PLAYER_HEIGHT = 1.8`, `PLAYER_SPEED = 5`. Always use delta time: `velocity * delta`.

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