# Touch-Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phones and tablets can walk published exhibitions at `/exhibition/:slug` with two fixed joysticks and tap artworks for their info.

**Architecture:** Pure helpers (detection, stick math, tap test, artwork pick) plus a tiny module store `touchInput` carry the logic; a DOM overlay `TouchControls` writes the store, `Player` and a new `TouchLook` read it inside the Canvas. A shared "walking" state replaces direct `document.pointerLockElement` checks so desktop (pointer lock) and touch (entered state) share raycaster, info overlay and book code.

**Tech Stack:** React 19, R3F 9, drei 10 (`PointerLockControls`, `KeyboardControls`), Rapier, three 0.186, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-touch-viewer-design.md`

## Global Constraints

- Branch `feat/touch-viewer` (on top of `feat/ar-export`). Never push, merge or touch production. Never stage unrelated dirty files (`.claude/`, `.mcp.json`, `.serena/`, `promo/`, `skills-lock.json`, `docs/superpowers/specs/2026-09-30-tag-nacht-licht-grobplan.md`, `.superpowers/`).
- Never run the app, a dev server, a browser or a DB locally. Local checks: `npm run test`, `npx eslint <touched files>`, `npx tsc -b`, `npm run build`. Device checks happen on the test stack (Task 6).
- Desktop behaviour must not change (pointer lock, crosshair, automatic info, wheel, keys, click-to-read).
- Values: left stick full deflection = existing `SPEED` (3.5 m/s); dead zone `STICK_DEAD_ZONE = 0.12` (fraction of radius); `LOOK_RATE = 140` °/s at full deflection; pitch clamp ±80°; tap = moved ≤ 10 px and lifted ≤ 300 ms; stick size ≈ 120 px (clamp 96–140 px from the short screen side); book reach = `BOOK_OPEN_DISTANCE` (`src/lib/book/geometry.ts`).
- German strings verbatim: „Tippen zum Betreten", „Zurück" (aria-label of the back button), „Näher herangehen zum Lesen", close button aria-label „Schließen".
- Render quality: mobile devices already resolve `'auto'` to `'low'` in `detectRenderQuality` (`src/lib/renderQuality.ts`) — no change; Task 1 adds a test that pins it.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Second finger lands on the canvas while a stick is held → must neither count as a tap on lift-off nor steal the stick (Task 5 test `isTap ignores a pointer that started on a stick` via the tap tracker's pointer bookkeeping).
2. Book reader / AR dialog opens while a stick is held → player stops, stick values reset, no movement continues behind the dialog (Task 4 test `locked controls reset touch input`).
3. Tab hidden or screen locked mid-walk → player stops (Task 4 test `visibility hidden resets touch input`).
4. Tapping an artwork that sits behind a modular wall → no info (Task 2 test `occluded by a wall`).
5. iPad (Mac UA, touch points 5) and a touch laptop (coarse + fine) → touch mode resp. desktop mode (Task 1 tests).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/touch/touchMode.ts` | `isTouchViewer`, `useTouchViewer` |
| `src/lib/touch/stick.ts` | `stickVector`, `applyLook`, `isTap`, constants |
| `src/lib/touch/touchInput.ts` | module store for move/look |
| `src/lib/touch/walking.ts` | shared walking state (pointer lock or touch-entered) |
| `src/lib/artworkPick.ts` | `pickArtworkAt` (from FPVArtworkRaycaster) |
| `src/components/touch/TouchControls.tsx` | the two sticks (DOM) |
| `src/components/touch/TouchLook.tsx` | camera look from the store (in Canvas) |
| `src/components/touch/TouchTapHandler.tsx` | tap → pick → info / book (in Canvas) |
| existing: `Player.tsx`, `FPVArtworkRaycaster.tsx`, `ArtworkInfoOverlay.tsx`, `ViewerPage.tsx`, `lib/book/viewerActions.ts`, `src/wiki/viewer.md`, `CLAUDE.md` | integration |

---

### Task 1: Pure touch helpers and stores

**Files:** Create `src/lib/touch/touchMode.ts`, `src/lib/touch/stick.ts`, `src/lib/touch/touchInput.ts`, `src/lib/touch/walking.ts`; Tests `src/lib/touch/touchMode.test.ts`, `src/lib/touch/stick.test.ts`, `src/lib/touch/walking.test.ts`; extend `src/lib/renderQuality` tests (create `src/lib/renderQuality.test.ts` if none).

**Interfaces — Produces:**
```ts
// touchMode.ts
export interface TouchEnv { coarse: boolean; fine: boolean; maxTouchPoints: number; ua: string }
export function isTouchViewer(env: TouchEnv): boolean
export function readTouchEnv(): TouchEnv          // matchMedia('(any-pointer: coarse)'), '(any-pointer: fine)', navigator
export function useTouchViewer(): boolean          // evaluated once on mount (useState initializer)
// stick.ts
export const STICK_DEAD_ZONE = 0.12; export const LOOK_RATE = 140; export const PITCH_LIMIT_DEG = 80
export const TAP_MAX_MOVE_PX = 10; export const TAP_MAX_MS = 300
export function stickVector(dx: number, dy: number, radius: number): { x: number; y: number }   // screen offsets → [-1,1]², clamped to unit circle, dead zone rescaled so output starts at 0 just outside it; y up = forward (screen dy negative → y positive)
export function applyLook(yaw: number, pitch: number, look: { x: number; y: number }, dt: number): { yaw: number; pitch: number }  // radians; yaw -= x*rate*dt, pitch += y*rate*dt, pitch clamped
export function isTap(start: { x: number; y: number; t: number }, end: { x: number; y: number; t: number }): boolean
// touchInput.ts
export const touchInput: { move: { x: number; y: number }; look: { x: number; y: number }; setMove(v): void; setLook(v): void; reset(): void }
// walking.ts
export function isWalking(): boolean               // !!document.pointerLockElement || touchWalking
export function setTouchWalking(on: boolean): void
export function subscribeWalking(fn: () => void): () => void   // fires on pointerlockchange and on setTouchWalking
export function useWalking(): boolean               // useSyncExternalStore
```

- [ ] **Step 1: Failing tests:** `isTouchViewer` — phone `{coarse:true, fine:false, 5, iPhone UA}` → true; `iPad desktop UA with touch` `{coarse:true, fine:false, 5, Macintosh UA}` → true; `{coarse:false, fine:true, 0, Macintosh}` → false; touch laptop `{coarse:true, fine:true, 10, Windows UA}` → false; Android → true. `stickVector(0,0,60)` → `{0,0}`; inside dead zone `(5,0,60)` → `{0,0}`; `(60,0,60)` → `{x:1,y:0}`; `(0,-60,60)` → `{x:0,y:1}`; `(120,0,60)` clamps to length 1; `(42.43,-42.43,60)` length ≈ 1 at 45°. `applyLook(0,0,{x:1,y:0},1)` yaw ≈ −140° in rad; pitch never exceeds ±80° (`{y:1}`, dt 10). `isTap` true for 5 px / 200 ms, false for 11 px or 301 ms. `walking`: `setTouchWalking(true)` → `isWalking()` true and subscriber called; false again → false. Render quality: `detectRenderQuality`-backed `resolveRenderQuality('auto')` with an iPhone UA stubbed → `'low'` (stub `navigator`/`document.createElement` as needed; if detection is cached, reset via any existing test hook or skip with a note).
- [ ] **Step 2:** `npx vitest run src/lib/touch src/lib/renderQuality.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS; `npx tsc -b` clean.
- [ ] **Step 5:** Commit `feat: touch viewer helpers (detection, sticks, tap, walking state)`.

### Task 2: `pickArtworkAt` and the shared walking state in the raycaster

**Files:** Create `src/lib/artworkPick.ts`, Test `src/lib/artworkPick.test.ts`; Modify `src/components/FPVArtworkRaycaster.tsx`.

**Interfaces:**
- Consumes: `isWalking()` (Task 1).
- Produces:
```ts
export interface ArtworkPick { group: THREE.Object3D; hit: THREE.Intersection; instanceId: number; info: unknown }
export function pickArtworkAt(ndc: { x: number; y: number }, camera: THREE.Camera, artworkRoots: THREE.Object3D[], occluders: THREE.Object3D[], raycaster?: THREE.Raycaster, maxDistance?: number): ArtworkPick | null
export function collectOccluders(scene: THREE.Object3D): THREE.Object3D[]   // meshes whose name is in OCCLUDER_NAMES (move the set here)
```
Uses `raycaster.setFromCamera(ndc, camera)`, then the existing two-step logic (artworks first, skip invisible, `findArtworkAncestor`; then occluders up to the hit distance). `FPVArtworkRaycaster` calls it with `{x:0,y:0}` and keeps its throttling, occluder refresh and store updates; its gate `!document.pointerLockElement` becomes `!isWalking()`, and in touch mode (`useTouchViewer()`) it returns early (touch picks only on tap).

- [ ] **Step 1: Failing tests** with a real three scene (PerspectiveCamera at origin looking −Z, an "artwork" group with `userData.instanceId/artworkInfo` and a plane at z=−3, a mesh named like an occluder): `hit at centre`; `miss in empty space` (ndc 0.9,0.9 → null); `occluded by a wall` (occluder plane at z=−2 → null); `invisible artwork skipped`; `occluder behind the artwork does not block` (occluder at z=−4 → hit).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement + refactor raycaster. **Step 4:** `npx vitest run src/lib/artworkPick.test.ts`, `npm run test`, `npx tsc -b` → pass. **Step 5:** Commit `refactor: share artwork picking between crosshair and tap`.

### Task 3: Sticks overlay

**Files:** Create `src/components/touch/TouchControls.tsx`; Test `src/components/touch/stickTracker.test.ts` for a pure `StickTracker` class extracted in `src/lib/touch/stickTracker.ts`.

**Interfaces:**
- Consumes: `stickVector`, `touchInput` (Task 1).
- Produces: `<TouchControls />` (renders two sticks bottom-left/bottom-right with `env(safe-area-inset-*)` insets, size `clamp(96px, 28vmin, 140px)`, semi-transparent, `touch-action:none`, `user-select:none`, z above the canvas but below dialogs). `StickTracker` (`pointerDown(id, x, y, centre)`, `pointerMove(id, x, y)`, `pointerUp(id)`, `value()`), one per stick, owns exactly one pointer id; left writes `touchInput.setMove`, right `touchInput.setLook`. `pointercancel` = up. Pointer capture on the stick element so the finger keeps steering after leaving it.

- [ ] **Step 1: Failing tests** for `StickTracker`: down+move gives `stickVector` value; a second pointer id on the same tracker is ignored; up resets to 0; move of an unknown id ignored; cancel resets.
- [ ] **Step 2:** FAIL. **Step 3:** Implement tracker + component. **Step 4:** tests, eslint, tsc → pass. **Step 5:** Commit `feat: twin joystick overlay for the touch viewer`.

### Task 4: Player and look integration

**Files:** Create `src/components/touch/TouchLook.tsx`; Modify `src/components/Player.tsx`; Test `src/lib/touch/touchInput.test.ts`.

**Interfaces:**
- Consumes: `touchInput`, `applyLook`, `useTouchViewer` (Task 1).
- Produces: `Player` takes `touch?: boolean`. In touch mode: no `PointerLockControls`; `<TouchLook />` mounted; `PlayerController` adds `touchInput.move` (x = strafe right, y = forward) to the keyboard direction before normalising, scaling target speed by the stick length (keyboard stays full speed). `TouchLook` in `useFrame`: reads yaw/pitch from `camera.rotation` with order `'YXZ'`, `applyLook(…, touchInput.look, delta)`, writes back. While `useControlsLocked()` or `paused`: `touchInput.reset()` and no look. A module-level helper `installTouchInputGuards(): () => void` resets on `visibilitychange` (hidden) and `blur`; mounted by `Player` in touch mode.

- [ ] **Step 1: Failing tests** (`touchInput.test.ts`): `reset zeroes move and look`; `visibility hidden resets touch input` (dispatch `visibilitychange` with `document.visibilityState` stubbed `'hidden'` after `installTouchInputGuards()`); `locked controls reset touch input` — extract `syncLock(locked: boolean)` used by TouchLook/Player and test it resets.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `npm run test`, eslint, tsc → pass. **Step 5:** Commit `feat: walk and look with the touch sticks`.

### Task 5: Viewer integration — enter/leave, tap, info panel, books, docs

**Files:** Create `src/components/touch/TouchTapHandler.tsx` (+ `src/lib/touch/tapTracker.ts` with test); Modify `src/pages/ViewerPage.tsx`, `src/components/ArtworkInfoOverlay.tsx`, `src/lib/book/viewerActions.ts`, `src/wiki/viewer.md`, `CLAUDE.md` (new short "### Touch-Viewer" section near the viewer/first-person notes).

**Interfaces:**
- Consumes: everything above; `pickArtworkAt`, `collectOccluders`; `openBookForInstance`, `bookInReach`, `BOOK_OPEN_DISTANCE`; `useEditorStore.setFpvHoveredInfo`; `useBookViewerStore.setBookInReach`.
- Produces:
  - `ViewerPage`: `const touch = useTouchViewer()`. Entry overlay text „Tippen zum Betreten" in touch mode; tap enters with `setTouchWalking(true)` instead of `requestPointerLock`; the "is locked" state for the overlay uses `useWalking()`. While walking in touch mode: `<TouchControls />` and a back button (top left, aria-label „Zurück") → `setTouchWalking(false)` + `touchInput.reset()`. `touch-action:none` on the canvas container in touch mode. Pass `touch` to `Player`/`PhysicsWorld` as needed. Header items (AR button, visitor count, title) must not overlap the sticks (bottom corners).
  - `TapTracker` (pure): tracks canvas pointers not owned by a stick (sticks stop propagation / mark the event), returns a tap only for a single pointer that satisfies `isTap`; any pointer that started on a stick never yields a tap. Test `isTap ignores a pointer that started on a stick`, plus tap / drag / long-press cases.
  - `TouchTapHandler` (in Canvas, touch mode only): on tap → NDC from the canvas rect → `pickArtworkAt` → if book and readable and `hit.distance ≤ BOOK_OPEN_DISTANCE` → `openBookForInstance`; else `setFpvHoveredInfo(info)` and `setBookInReach(book && readable ? id : null)`; miss → `setFpvHoveredInfo(null)`.
  - `ArtworkInfoOverlay` with `touch` prop/hook: visibility follows `useWalking()` instead of `pointerlockchange`; in touch mode: compact panel at the top (safe-area inset), close button ✕ (aria-label „Schließen") → `setFpvHoveredInfo(null)`; no wheel/click/key listeners; footer „Klicken zum Lesen" replaced by „Näher herangehen zum Lesen" when a book is shown but not in reach; desktop branch byte-for-byte the same behaviour.
  - `viewerActions`: `openBook`/`closeBook` only touch pointer lock when not in touch mode (closing a book in touch mode keeps walking, no `requestPointerLock`); `installFirstPersonBookClick` stays desktop-only.
  - Wiki `viewer.md`: short paragraph „Auf Handy und Tablet" (sticks, tap for info, book within reach, back button). CLAUDE.md: "### Touch-Viewer" — detection, `touchInput`, `walking.ts` replaces direct pointer-lock checks, `pickArtworkAt`, constants.
- [ ] **Step 1: Failing tests** for `TapTracker` (tap, drag > 10 px, > 300 ms, stick-owned pointer, two simultaneous canvas pointers → no tap) and for `viewerActions` touch branch (`closeBook` in touch mode does not request pointer lock — extend `viewerActions.test.ts`).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `npm run test` (incl. `src/wiki/pages.test.ts`), eslint on touched files, `npx tsc -b`, `npm run build` → pass. **Step 5:** Commit(s) `feat: touch mode in the public viewer` and `docs: touch viewer`.

### Task 6: Test stack (controller)

- [ ] Dump test DB, deploy `feat/touch-viewer` like part B (memory `curahub_test_environment.md`), check app healthy and AR exports untouched.
- [ ] Headless Chrome over CDP on the server with mobile emulation (`Emulation.setTouchEmulationEnabled`, `setDeviceMetricsOverride` 390×844, mobile UA): `/exhibition/yol` shows „Tippen zum Betreten"; synthetic touch (`Input.dispatchTouchEvent`) enters, left-stick drag moves the camera position, right-stick drag changes yaw, tap on a picture sets the info panel, back button returns. Use its own `--user-data-dir`.
- [ ] Hand the user the phone checklist from spec §5.
