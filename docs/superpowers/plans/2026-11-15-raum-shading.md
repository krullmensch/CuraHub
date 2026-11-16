# Raum-Shading (Licht mit Richtung) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the room's light a direction so that wall corners, wall ends and modular-wall edges read in every view, without making the room darker on average.

**Architecture:** All room light values move into one pure module, `src/lib/roomLighting.ts`. It exposes the light rig per preset and a rough Lambert estimate of how bright each wall direction is. Vitest checks that the spread between wall directions and the mean brightness compared to today stay within the spec's limits. `Scene.tsx` and `Satellit.tsx` only render what the rig says. The final values are tuned against screenshots from the test stack.

**Tech Stack:** React 19, @react-three/fiber 9, three r186 (WebGPU + WebGL), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-raum-shading-design.md`

## Global Constraints

- No shadows, no post-processing, no new assets, no new UI settings.
- Mean front-wall irradiance ≈ today (estimate within ±10 %); spread between the four wall directions about ±15–25 %.
- Frame calibration `render = ACES(albedo_lin × 1,7)` under RectAreaLight 3,5 must hold on the mid-bright wall, so the downward RectAreaLight stays at 3,5.
- Window wall is −Z. The key light comes from that side.
- Never run the app locally. Visual checks happen on the test stack (headless Chrome over CDP, `--headless=new --enable-unsafe-webgpu`). Vitest for the pure module is fine.
- Comments in English, UI strings (none here) in German.

## Review Focus

1. Preset „Niedrig" (no RectAreaLights): its hemisphere-based rig must also show a spread, not just the RectAreaLight presets → test covers both rigs.
2. Orbit view (ceiling hidden): the top-down view must not look washed out or dark → screenshot check in Task 2.
3. Wall editor (`flat` modular wall, unlit) must stay unchanged → nothing in this plan touches `meshBasicMaterial` paths; check one screenshot.
4. Artworks at „Hoch" (lit) get darker on the walls facing away from the window → screenshot of one photo on the darkest wall; if it looks off, lower the spread toward 15 %.
5. AR export (`exportMode`) uses the same Scene lights → no extra handling; GLB export ignores lights anyway.

---

### Task 1: Light rig module + tests

**Files:**
- Create: `src/lib/roomLighting.ts`
- Test: `src/lib/roomLighting.test.ts`

**Interfaces:**
- Produces:
  - `type DirectionalLightSpec = { position: [number, number, number]; intensity: number; color: string }`
  - `type RoomLightRig = { ambient: number; hemisphere: { sky: string; ground: string; intensity: number } | null; directional: DirectionalLightSpec[]; rectDown: number; rectUp: number }` (rectDown/rectUp = 0 when the preset has no RectAreaLights)
  - `roomLightRig(rectAreaLights: boolean): RoomLightRig`
  - `LEGACY_ROOM_LIGHT_RIG: Record<'rect' | 'noRect', RoomLightRig>` (today's values, only for the comparison test)
  - `wallIrradiance(rig: RoomLightRig, normal: [number, number, number]): number`: ambient + hemisphere (vertical wall = (sky + ground) / 2 luminance × intensity, i.e. direction-independent) + Σ intensity × max(0, n · normalize(position)) + `RECT_WALL_SHARE` × (rectDown + rectUp), with `RECT_WALL_SHARE = 0.25` as a documented rough guess
  - `WALL_NORMALS: [number, number, number][]` = ±X, ±Z

- [ ] **Step 1: Write the failing tests** in `roomLighting.test.ts`:
  - `legacy rig matches Scene/Satellit today`: `LEGACY_ROOM_LIGHT_RIG.rect` has `ambient 0.4`, one directional at `[-6, 6, -4]`/0.3/`#f8f8ff`, `rectDown 3.5`, `rectUp 1.2`, `hemisphere null`; `.noRect` has `ambient 0.4`, hemisphere `#fff5e0`/`#f4efe8`/1.7, directionals `[-6,6,-4]`/0.3 and `[0,-10,0]`/1.2/`#fff5e0`, rect 0/0.
  - For `rect` in `[true, false]`:
    - `mean wall irradiance stays within 10 % of today`: `|mean(new) / mean(legacy) − 1| ≤ 0.10` over `WALL_NORMALS`.
    - `wall directions spread 15–25 %`: `max |value / mean − 1|` is in `[0.15, 0.25]`.
    - `four wall directions are distinct`: every pair differs by ≥ 3 % of the mean.
  - `downward area light keeps frame calibration`: `roomLightRig(true).rectDown === 3.5`.
  - `key light comes from the window side`: the directional with the highest intensity has `position[2] < 0`.

- [ ] **Step 2: Run** `npx vitest run src/lib/roomLighting.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `roomLighting.ts`.** Starting values (tune until the tests pass, keep these shapes):
  - `rect` rig: ambient ≈ 0.2; key `[-3, 6, -8]`, ≈ 0.9, `#fff5e0`; counter `[4, 5, 6]`, ≈ 0.25, `#f8f8ff`; rectDown 3.5; rectUp ≈ 0.6; hemisphere null.
  - `noRect` rig: ambient ≈ 0.15; hemisphere `#fff5e0`/`#f4efe8` lowered to ≈ 1.0; the same key and counter; keep `[0, -10, 0]`/1.2/`#fff5e0` (ceiling brightener); rect 0/0.
  - Key not axis-aligned, so ±X differ as well as ±Z.

- [ ] **Step 4: Run** `npx vitest run src/lib/roomLighting.test.ts` → PASS. Then `npm run lint` → no new errors.

- [ ] **Step 5: Commit** on branch `feat/room-shading` (create from `main`). Add the spec and this plan to the same commit:
```bash
git add src/lib/roomLighting.ts src/lib/roomLighting.test.ts docs/superpowers/specs/2026-11-15-raum-shading-design.md docs/superpowers/plans/2026-11-15-raum-shading.md
git commit -m "Room lighting rig with directional key light (pure module + tests)"
```

### Task 2: Render the rig + tune against screenshots

**Files:**
- Modify: `src/components/Scene.tsx:54-82` (light block)
- Modify: `src/components/Satellit.tsx:228-248` (the two `rectAreaLight` intensities)
- Modify: `src/lib/roomLighting.ts` (final values only)

**Interfaces:**
- Consumes: `roomLightRig(rectAreaLights)` from Task 1.

- [ ] **Step 1: Replace the hard-coded lights in `Scene.tsx`** with `const rig = useMemo(() => roomLightRig(rectAreaLights), [rectAreaLights])`: `<ambientLight intensity={rig.ambient} />`, `rig.hemisphere && <hemisphereLight args={[sky, ground, intensity]} />`, `rig.directional.map((l, i) => <directionalLight key={i} … />)`. Remove the stale commented-out key light and Environment lines.
- [ ] **Step 2: Satellit:** take the RectAreaLight intensities from `roomLightRig(true).rectDown` / `.rectUp` (do not render a light whose intensity is 0).
- [ ] **Step 3: Run** `npm run build` (tsc + vite) and `npm run lint` → both clean.
- [ ] **Step 4: Deploy the branch to the test stack** (as in the test-environment memory) and take before/after screenshots over CDP for WebGPU and `?renderer=webgl`, presets Niedrig/Mittel/Hoch: first person into a room corner, a modular-wall end in front of a white wall, the orbit home view (`H`), a close-up of an Aab-Weiß and an Alu frame, a photo on the darkest wall at „Hoch", and the wall editor open on a modular wall.
- [ ] **Step 5: Tune** the values in `roomLighting.ts` if the corners are still flat or the room looks darker or dramatic (anti-goals). Re-run `npx vitest run src/lib/roomLighting.test.ts` after every change → PASS.
- [ ] **Step 6: Commit**
```bash
git add src/components/Scene.tsx src/components/Satellit.tsx src/lib/roomLighting.ts
git commit -m "Render the directional room light rig in Scene and Satellit"
```
- [ ] **Step 7: Update CLAUDE.md** (Phase 7 / renderer note: where the room lights live now) in the same branch and commit.
