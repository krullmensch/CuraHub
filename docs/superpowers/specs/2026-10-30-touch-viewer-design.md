# Touch-Viewer mit Doppel-Joystick — Design Spec
**Date:** 2026-10-30
**Status:** Approved (in chat), awaiting spec review
**Part:** A of the mobile viewer programme (see `2026-10-29-published-version-protection-design.md`, table at the top). Built on top of B (`feat/ar-export`), because both touch `ViewerPage`.

---

## Overview

The public viewer `/exhibition/:slug` today needs Pointer Lock, a mouse and WASD — on phones and tablets it cannot be walked at all. A adds a **touch mode**: a fixed joystick bottom left walks, a fixed joystick bottom right looks around, and tapping an artwork shows its info (no crosshair). Desktop stays exactly as it is.

Decisions taken in chat:

- **Two fixed sticks** (left walk, right look) — not swipe-to-look.
- **Tap instead of crosshair:** tapping an artwork shows its info; tapping empty space closes it; a book within reach opens directly.
- **Portrait and landscape**, layout adapts; **no fullscreen request**.
- Desktop behaviour (pointer lock, crosshair, automatic info, mouse wheel, keys) unchanged.

Success: on an iPhone and an Android phone a visitor taps „Tippen zum Betreten", walks and looks around with both thumbs at the same time, taps a picture to read its label, opens a book standing next to it, and can leave again — in portrait and landscape, at a usable frame rate in the largest exhibition.

Out of scope: the editor's first-person mode on touch devices (part C covers mobile curators), gyroscope look, swipe-to-look, fullscreen, gamepad support, changes to the desktop viewer.

---

## 1. Touch mode and controls

### Detection

`isTouchViewer(env: { coarse: boolean; fine: boolean; maxTouchPoints: number; ua: string }): boolean` (pure, `src/lib/touch/touchMode.ts`): true when the device has a coarse pointer and **no** fine pointer (`(any-pointer: fine)` false), or an iPad reporting a Mac UA with `maxTouchPoints > 1`. Touch laptops (touch + mouse) keep the desktop controls. Evaluated once on viewer mount (`useTouchViewer()` hook reading `matchMedia` + `navigator`).

### Entering and leaving

- Entry overlay text „Tippen zum Betreten" instead of „Klicken zum Betreten"; a tap enters without `requestPointerLock`.
- While walking, a small back button top left („Zurück", icon) returns to the entry overlay — the touch equivalent of Esc on desktop.
- All raycasts, players and overlays that today check `document.pointerLockElement` check a shared „walking" state instead (`isWalking()`: pointer lock on desktop, entered state in touch mode), so they work in both modes.

### Sticks (`src/components/touch/TouchControls.tsx`)

DOM overlay above the canvas, only in touch mode and only while walking.

- **Left stick** (bottom left) → walk. Displacement = speed: full deflection = today's `SPEED` (3.5 m/s). Dead zone 12 % of the radius.
- **Right stick** (bottom right) → look. Rate control: yaw/pitch speed = `LOOK_RATE` (≈ 140 °/s) × deflection, with the same dead zone; pitch clamped to ±80°. Release stops turning.
- Each stick tracks its own pointer id (multi-touch), keeps following the finger when it leaves the stick until it lifts, springs back to centre on lift.
- Fixed, semi-transparent, size ≈ 120 px (scaled to the short screen side), inset from the edges and `env(safe-area-inset-*)`.
- `touch-action: none` and `user-select: none` on the overlay and the canvas; no double-tap zoom.

### Wiring

- `touchInput` store (`src/lib/touch/touchInput.ts`, plain module store like `controlsLock`): `move: {x, y}`, `look: {x, y}`, `reset()`.
- `Player.tsx` adds the move vector to the keyboard direction (same physics, collisions, acceleration).
- A `TouchLook` component applies the look vector to the camera in `useFrame` (Euler order `'YXZ'`, as `PointerLockControls`); desktop keeps `PointerLockControls`.
- While `useControlsLocked()` is true (book open, dialog open) both sticks are ignored and their values reset.

---

## 2. Tap, info, books

### Tap on the scene

- A tap = one pointer on the canvas (not on a stick) that moves ≤ 10 px and lifts within ≤ 300 ms (`isTap(start, end)` pure helper).
- The artwork under the tap is found with the same logic as `FPVArtworkRaycaster`, extracted into the pure-ish helper `pickArtworkAt(ndc: {x, y}, camera, scene)` used by both: desktop passes the screen centre, touch passes the tap point. Walls still occlude artworks.
- Hit artwork → `ArtworkInfoOverlay` shows it. Tapping another artwork switches, tapping empty space closes it. The info stays while walking/looking; only a new tap changes it.
- Hit book within reach (`BOOK_OPEN_DISTANCE` = 2.5 m, `src/lib/book/geometry.ts`) → the book reader opens directly. Book farther away → its info with the line „Näher herangehen zum Lesen".

### Info panel in touch mode

- Compact, at the top edge, so it never covers the sticks; close button ✕.
- No mouse wheel, no click-to-toggle, no key shortcuts, no „Klicken zum Lesen" footer row.
- Desktop unchanged: crosshair, automatic info, existing gestures.

### Other overlays

- Book reader and AR QR dialog lock the sticks (`useControlsLocked`).
- „In AR ansehen" stays in the header; visitor counter and title move up if they collide with the sticks.

---

## 3. Performance

- In touch mode the automatic render quality (`resolveRenderQuality` in `src/lib/renderQuality.ts`, used by `useRenderQualitySettings`) resolves to `'low'` (lower DPR, no RectArea lights) instead of the detected hardware class; a manual choice in the quality menu still wins, as today.
- In touch mode the artwork raycast runs only on tap, not every frame.

---

## 4. Error handling

| Case | Behaviour |
|---|---|
| Finger slides off a stick | Stick follows it until lift; back to centre on lift |
| Tab hidden / screen locked / `pointercancel` | `touchInput.reset()` — both sticks 0, player stops |
| Touch + mouse device | Desktop controls (fine pointer present) |
| Rotation | Layout adapts, controls keep working |
| Browser gestures (scroll, pinch, double-tap zoom) | Suppressed on overlay and canvas |
| Book or dialog opens while a stick is held | Sticks reset and ignored until it closes |

---

## 5. Tests

- **Vitest (pure):** `isTouchViewer` (phone, iPad with Mac UA, touch laptop, desktop); `stickVector` (dead zone, clamp to the circle, normalisation); `applyLook` (deflection × dt → yaw/pitch, pitch clamp); `isTap` (distance/time limits); `pickArtworkAt` (hit, occlusion by a wall, empty space) with a small three.js scene.
- **Manual, on the test stack:** iPhone and Android, portrait and landscape: walk, look, both sticks at once, tap an artwork, open a book, AR button, back button, frame rate in „Yol".
