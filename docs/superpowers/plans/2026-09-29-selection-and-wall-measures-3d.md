# Auswahl-Kontur und Wandmaße im 3D — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution in this session:** caveman `cavecrew-builder` agents implement tasks (max. 2 files each, no Bash). The main thread installs dependencies, runs `npm test` / `npm run lint` / `npm run build` after each wave, commits, and does the visual check.

**Goal:** Selected artworks get a clear constant-width blue outline, and the wall measures of the 2D wall editor (hanging line, heights above floor, gaps) are drawn on all walls in the 3D orbit view, hidden by walls in front of them.

**Architecture:** Pure wall-space logic in `src/lib/wallEditor/` (measure toggles persistence, face collection, annotation geometry) with Vitest unit tests. Two R3F components render it: `WallMeasurements3D` (merged quad meshes per colour + depth-tested fixed-size sprites) and `SelectionOutline` (projects outline corners each frame into one SVG path over the canvas). The editor tool bar gets a "Maße" popover sharing a new `ToolbarPopoverButton` with the render settings gear.

**Tech Stack:** React 19, three r186 (WebGPU + WebGL), @react-three/fiber 9, Zustand 5, Zod 4, Vitest 5.0.2, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-29-selection-and-wall-measures-3d-design.md`

## Global Constraints

- All user-facing strings German.
- No `ShaderMaterial` / `onBeforeCompile` (WebGPU path); only classic materials (`MeshBasicMaterial`, `SpriteMaterial`) that three converts.
- No `any`; unknown + type guards / Zod for storage deserialisation.
- Three.js units are metres; wall coordinates `u` (right from left edge), `v` (world height), `d` (out of the face).
- Measures render only when `plannerViewMode === 'perspective'` and `useWallEditorView.phase === 'idle'`.
- Outline colour `#3b82f6` (`WE_COLORS.select`), stroke 2.5 px, no depth test.
- Line colours: hanging `WE_COLORS.hanging` (`#f59e0b`), floor leaders `#18181b`, gaps `WE_COLORS.spacing` (`#ec4899`). Line width 5 mm, 3 mm in front of the wall; labels 2 cm in front.
- Label pills: hanging bg `#f59e0b` text `#1c1917`; floor bg `rgba(24,24,27,0.85)` text `#fff`; gaps bg `#ec4899` text `#fff`.
- localStorage key for toggles: `curahub-wall-measures`. Defaults: hanging on, floor distances off, gaps off.
- Keep `useFrame` work out of `WallMeasurements3D` entirely.
- Code comments English, matching surrounding style (short, explain why).

## Review Focus

1. Hanging height above the face's height (e.g. 3 m on a 2.5 m wall) → no hanging line or label on that face instead of a line floating above the wall. Test in Task 3.
2. Artwork whose bottom edge touches or goes below the floor → no floor leader (no zero-length/negative line, no "Mitte" label at the floor). Test in Task 3.
3. Artworks on room walls before `Satellit` has published `roomFaces` (or artworks referencing a deleted wall) → silently skipped, no crash. Test in Task 3.
4. All toggles off → `faceAnnotations` returns nothing and the component renders `null`. Test in Task 3.
5. Selected artwork partly behind the camera (orbit very close) → outline path cleared instead of drawing lines across the screen. Guard in Task 6 (visual check in Task 10).

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `package.json` | modify | `vitest` devDependency, `test` script |
| `src/lib/wallEditor/measureToggles.ts` | create | read/write the three toggles from/to storage (Zod) |
| `src/lib/wallEditor/measureToggles.test.ts` | create | tests |
| `src/store/wallEditorViewStore.ts` | modify | init toggles from storage, persist on toggle |
| `src/lib/wallEditor/annotations.ts` | create | `collectMeasuredFaces`, `floorLeaders`, `faceAnnotations` |
| `src/lib/wallEditor/annotations.test.ts` | create | tests |
| `src/lib/measureLabelTextures.ts` | create | cached canvas pill textures for sprites |
| `src/components/WallMeasurements3D.tsx` | create | 3D rendering of the annotations |
| `src/components/Scene.tsx` | modify | mount `WallMeasurements3D` in the editor |
| `src/components/SelectionOutline.tsx` | create | tracker (in Canvas) + SVG layer (DOM) |
| `src/components/SelectableInstance.tsx` | modify | remove halo box |
| `src/components/ModelInstance.tsx` | modify | remove emissive tint + wireframe |
| `src/components/VideoInstance.tsx` | modify | remove selection colours/boxes |
| `src/components/SplatInstance.tsx` | modify | remove selection box, flag hit proxy |
| `src/components/wall-editor/WallEditorOverlay.tsx` | modify | 2D floor leaders |
| `src/components/wall-editor/WallEditorPanel.tsx` | modify | export `CmInput` |
| `src/components/ToolbarPopoverButton.tsx` | create | tool bar button + tooltip + popover |
| `src/components/MeasurementsControl.tsx` | create | "Maße" popover |
| `src/pages/EditorPage.tsx` | modify | use `ToolbarPopoverButton`, mount outline + control |

Waves (tasks in a wave touch disjoint files and can run in parallel):
- Wave 0: Task 1 (main thread)
- Wave 1: Tasks 2, 3, 4, 7, 8, 9
- Wave 2: Tasks 5, 6, 11, 12
- Wave 3: Task 13
- Wave 4: Task 10 (verification, main thread)

---

### Task 1: Vitest setup (main thread)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm i -D vitest@5.0.2
```

- [ ] **Step 2: Add script** — in `package.json` `"scripts"` add `"test": "vitest run"`.

- [ ] **Step 3: Verify runner** — `npx vitest run --passWithNoTests` → exits 0.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest for frontend unit tests"
```

---

### Task 2: Measure toggle persistence

**Files:**
- Create: `src/lib/wallEditor/measureToggles.ts`
- Create: `src/lib/wallEditor/measureToggles.test.ts`

**Interfaces:**
- Produces:
  - `interface MeasureToggles { showHangingLine: boolean; showFloorDistances: boolean; showGaps: boolean }`
  - `type MeasureToggleKey = keyof MeasureToggles`
  - `const MEASURE_TOGGLES_KEY = 'curahub-wall-measures'`
  - `const DEFAULT_MEASURE_TOGGLES: MeasureToggles`
  - `readMeasureToggles(storage: Pick<Storage, 'getItem'> | null): MeasureToggles`
  - `writeMeasureToggles(storage: Pick<Storage, 'setItem'> | null, toggles: MeasureToggles): void`
  - `browserStorage(): Storage | null`

- [ ] **Step 1: Write the failing test** — `src/lib/wallEditor/measureToggles.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
    DEFAULT_MEASURE_TOGGLES,
    MEASURE_TOGGLES_KEY,
    readMeasureToggles,
    writeMeasureToggles,
} from './measureToggles';

const fakeStorage = (initial: Record<string, string> = {}) => {
    const data: Record<string, string> = { ...initial };
    return {
        data,
        getItem: (key: string) => data[key] ?? null,
        setItem: (key: string, value: string) => { data[key] = value; },
    };
};

describe('readMeasureToggles', () => {
    test('defaults without storage', () => {
        expect(readMeasureToggles(null)).toEqual(DEFAULT_MEASURE_TOGGLES);
    });

    test('defaults when nothing is stored', () => {
        expect(readMeasureToggles(fakeStorage())).toEqual(DEFAULT_MEASURE_TOGGLES);
    });

    test('defaults for broken JSON', () => {
        expect(readMeasureToggles(fakeStorage({ [MEASURE_TOGGLES_KEY]: '{nope' }))).toEqual(DEFAULT_MEASURE_TOGGLES);
    });

    test('defaults for a non-object', () => {
        expect(readMeasureToggles(fakeStorage({ [MEASURE_TOGGLES_KEY]: '42' }))).toEqual(DEFAULT_MEASURE_TOGGLES);
    });

    test('keeps valid fields and defaults the rest', () => {
        const storage = fakeStorage({ [MEASURE_TOGGLES_KEY]: JSON.stringify({ showGaps: true, showFloorDistances: 'yes' }) });
        expect(readMeasureToggles(storage)).toEqual({ showHangingLine: true, showFloorDistances: false, showGaps: true });
    });

    test('defaults when getItem throws', () => {
        const storage = { getItem: () => { throw new Error('blocked'); } };
        expect(readMeasureToggles(storage)).toEqual(DEFAULT_MEASURE_TOGGLES);
    });
});

describe('writeMeasureToggles', () => {
    test('round trip', () => {
        const storage = fakeStorage();
        const toggles = { showHangingLine: false, showFloorDistances: true, showGaps: true };
        writeMeasureToggles(storage, toggles);
        expect(readMeasureToggles(storage)).toEqual(toggles);
    });

    test('ignores a throwing storage', () => {
        const storage = { setItem: () => { throw new Error('quota'); } };
        expect(() => writeMeasureToggles(storage, DEFAULT_MEASURE_TOGGLES)).not.toThrow();
    });

    test('ignores missing storage', () => {
        expect(() => writeMeasureToggles(null, DEFAULT_MEASURE_TOGGLES)).not.toThrow();
    });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/wallEditor/measureToggles.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/wallEditor/measureToggles.ts`:

```ts
import { z } from 'zod';

/** Which wall measures are shown — in the 2D wall editor and on the walls in 3D. Persisted per browser. */
export interface MeasureToggles {
    showHangingLine: boolean;
    showFloorDistances: boolean;
    showGaps: boolean;
}

export type MeasureToggleKey = keyof MeasureToggles;

export const MEASURE_TOGGLES_KEY = 'curahub-wall-measures';

export const DEFAULT_MEASURE_TOGGLES: MeasureToggles = {
    showHangingLine: true,
    showFloorDistances: false,
    showGaps: false,
};

// Each field falls back on its own, so one bad value does not reset the others.
const measureTogglesSchema = z.object({
    showHangingLine: z.boolean().catch(DEFAULT_MEASURE_TOGGLES.showHangingLine),
    showFloorDistances: z.boolean().catch(DEFAULT_MEASURE_TOGGLES.showFloorDistances),
    showGaps: z.boolean().catch(DEFAULT_MEASURE_TOGGLES.showGaps),
});

export function readMeasureToggles(storage: Pick<Storage, 'getItem'> | null): MeasureToggles {
    if (!storage) return { ...DEFAULT_MEASURE_TOGGLES };
    try {
        const raw = storage.getItem(MEASURE_TOGGLES_KEY);
        if (!raw) return { ...DEFAULT_MEASURE_TOGGLES };
        const parsed = measureTogglesSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : { ...DEFAULT_MEASURE_TOGGLES };
    } catch {
        return { ...DEFAULT_MEASURE_TOGGLES };
    }
}

export function writeMeasureToggles(storage: Pick<Storage, 'setItem'> | null, toggles: MeasureToggles): void {
    if (!storage) return;
    try {
        storage.setItem(MEASURE_TOGGLES_KEY, JSON.stringify(toggles));
    } catch {
        // storage full or blocked — keep the toggles for this session only
    }
}

/** window.localStorage, or null where it is unavailable (tests, blocked site data). */
export function browserStorage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}
```

- [ ] **Step 4: Run** `npx vitest run src/lib/wallEditor/measureToggles.test.ts` → PASS (9 tests).

- [ ] **Step 5: Commit** (main thread, after wave)

```bash
git add src/lib/wallEditor/measureToggles.ts src/lib/wallEditor/measureToggles.test.ts
git commit -m "feat: persist wall measure toggles"
```

---

### Task 3: Annotation geometry

**Files:**
- Create: `src/lib/wallEditor/annotations.ts`
- Create: `src/lib/wallEditor/annotations.test.ts`

**Interfaces:**
- Consumes: `MeasureToggles` (Task 2); existing `targetForInstance`, `targetKey`, `resolveFace` (`./faces`), `collectWallFace`, `WallFace` (`./wallArtworks`), `rowGaps`, `centerX`, `centerY`, `Rect` (`./layout`), `formatCm` (`./format`).
- Produces:
  - `type AnnotationKind = 'hanging' | 'floor' | 'gap'`
  - `interface AnnotationSegment { kind: AnnotationKind; u1: number; v1: number; u2: number; v2: number }`
  - `interface AnnotationLabel { kind: AnnotationKind; u: number; v: number; text: string; align: 'center' | 'start' }`
  - `interface FaceAnnotations { segments: AnnotationSegment[]; labels: AnnotationLabel[] }`
  - `interface FloorLeader { id: number; u: number; top: number; bottom: number; value: number; labelV: number }`
  - `collectMeasuredFaces(instances: ArtworkInstanceData[], walls: ModularWallData[], roomFaces: RoomFace[]): WallFace[]`
  - `floorLeaders(items: { id: number; rect: Rect }[], floorY: number): FloorLeader[]`
  - `faceAnnotations(face: { wallRect: Rect; items: { id: number; rect: Rect }[] }, toggles: MeasureToggles, hangingHeight: number): FaceAnnotations`
  - constants `HANGING_DASH = 0.06`, `HANGING_GAP = 0.04`, `END_CAP = 0.04`

- [ ] **Step 1: Write the failing test** — `src/lib/wallEditor/annotations.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { collectMeasuredFaces, faceAnnotations, floorLeaders, HANGING_DASH, HANGING_GAP } from './annotations';
import { rowGaps, type Rect } from './layout';
import type { MeasureToggles } from './measureToggles';

const ALL_ON: MeasureToggles = { showHangingLine: true, showFloorDistances: true, showGaps: true };
const ALL_OFF: MeasureToggles = { showHangingLine: false, showFloorDistances: false, showGaps: false };

// 4 m × 3 m wall at the origin, not rotated: front faces +Z, its left edge is at x = -2.
const wall: ModularWallData = {
    id: 1, position_x: 0, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
    width: 4, height: 3, thickness: 0.2, color: '#ffffff', isLocked: true,
};

const picture = (id: number, x: number, y: number, z: number, rotationY: number, wallId: number | null = 1): ArtworkInstanceData => ({
    id, wallId, frameStyle: 'none',
    artwork: { width: 50, height: 40, asset: { path: `/uploads/${id}.webp`, width: 1000, height: 800, dpi: 72, type: 'image' } },
    position_x: x, position_y: y, position_z: z,
    rotation_x: 0, rotation_y: rotationY, rotation_z: 0,
    scale_x: 1, scale_y: 1, scale_z: 1,
});

describe('collectMeasuredFaces', () => {
    test('groups artworks by wall face and drops empty faces', () => {
        const instances = [
            picture(1, 0, 1.5, 0.11, 0),
            picture(2, 1, 1.5, 0.11, 0),
            picture(3, 0, 1.5, -0.11, Math.PI),
        ];
        const faces = collectMeasuredFaces(instances, [wall], []);
        expect(faces.map((f) => f.key)).toEqual(['wall:1:front', 'wall:1:back']);
        expect(faces[0].items.map((i) => i.id)).toEqual([1, 2]);
        expect(faces[1].items.map((i) => i.id)).toEqual([3]);
    });

    test('skips artworks without a known face', () => {
        const instances = [picture(1, 0, 1.5, 0.11, 0, 99), picture(2, 0, 1.5, 0.11, 0, null)];
        expect(collectMeasuredFaces(instances, [wall], [])).toEqual([]);
    });

    test('artwork rect is centred on its anchor in wall coordinates', () => {
        const [face] = collectMeasuredFaces([picture(1, 0, 1.5, 0.11, 0)], [wall], []);
        const r = face.items[0].rect;
        expect(r.x + r.w / 2).toBeCloseTo(2);
        expect(r.y + r.h / 2).toBeCloseTo(1.5);
    });
});

const face = (rects: Rect[], wallRect: Rect = { x: 0, y: 0, w: 4, h: 3 }) => ({
    wallRect,
    items: rects.map((rect, i) => ({ id: i + 1, rect })),
});

describe('floorLeaders', () => {
    test('from the bottom edge down to the floor, labelled with the centre height', () => {
        const [leader] = floorLeaders([{ id: 7, rect: { x: 1, y: 1.3, w: 0.5, h: 0.4 } }], 0);
        expect(leader.id).toBe(7);
        expect(leader.u).toBeCloseTo(1.25);
        expect(leader.top).toBeCloseTo(1.3);
        expect(leader.bottom).toBe(0);
        expect(leader.value).toBeCloseTo(1.5);
        expect(leader.labelV).toBeCloseTo(0.65);
    });

    test('measures from the face bottom, not world zero', () => {
        const [leader] = floorLeaders([{ id: 1, rect: { x: 0, y: 1.2, w: 1, h: 0.4 } }], 0.2);
        expect(leader.bottom).toBeCloseTo(0.2);
        expect(leader.value).toBeCloseTo(1.2);
    });

    test('no leader for artworks touching or below the floor', () => {
        expect(floorLeaders([{ id: 1, rect: { x: 0, y: 0, w: 1, h: 1 } }, { id: 2, rect: { x: 2, y: -0.1, w: 1, h: 1 } }], 0)).toEqual([]);
    });
});

describe('faceAnnotations', () => {
    test('nothing when every toggle is off', () => {
        expect(faceAnnotations(face([{ x: 1, y: 1.3, w: 0.5, h: 0.4 }]), ALL_OFF, 1.5)).toEqual({ segments: [], labels: [] });
    });

    test('hanging line: dashes across the face at bottom + hanging height', () => {
        const { segments, labels } = faceAnnotations(face([]), { ...ALL_OFF, showHangingLine: true }, 1.5);
        const dashes = segments.filter((s) => s.kind === 'hanging');
        expect(dashes.length).toBe(Math.ceil(4 / (HANGING_DASH + HANGING_GAP)));
        for (const s of dashes) {
            expect(s.v1).toBeCloseTo(1.5);
            expect(s.v2).toBeCloseTo(1.5);
            expect(s.u2).toBeLessThanOrEqual(4 + 1e-9);
        }
        expect(dashes[0].u1).toBe(0);
        expect(labels).toEqual([{ kind: 'hanging', u: 0.05, v: 1.55, text: 'Hängehöhe 150 cm', align: 'start' }]);
    });

    test('hanging line follows a raised face bottom', () => {
        const { segments } = faceAnnotations(face([], { x: 0, y: 0.5, w: 2, h: 3 }), { ...ALL_OFF, showHangingLine: true }, 1.5);
        expect(segments[0].v1).toBeCloseTo(2);
    });

    test('no hanging line when it would lie above the face', () => {
        expect(faceAnnotations(face([], { x: 0, y: 0, w: 4, h: 2.5 }), { ...ALL_OFF, showHangingLine: true }, 3)).toEqual({ segments: [], labels: [] });
    });

    test('floor distances: leader with end caps and a centred label', () => {
        const { segments, labels } = faceAnnotations(face([{ x: 1, y: 1.3, w: 0.5, h: 0.4 }]), { ...ALL_OFF, showFloorDistances: true }, 1.5);
        expect(segments.filter((s) => s.kind === 'floor')).toHaveLength(3);
        expect(segments).toContainEqual({ kind: 'floor', u1: 1.25, v1: 1.3, u2: 1.25, v2: 0 });
        expect(labels).toEqual([{ kind: 'floor', u: 1.25, v: 0.65, text: 'Mitte 150 cm', align: 'center' }]);
    });

    test('gaps: one line with end caps per rowGaps measurement', () => {
        const rects = [{ x: 0.5, y: 1.3, w: 0.5, h: 0.4 }, { x: 1.3, y: 1.3, w: 0.5, h: 0.4 }];
        const { segments, labels } = faceAnnotations(face(rects), { ...ALL_OFF, showGaps: true }, 1.5);
        const gaps = rowGaps(rects);
        expect(gaps).toHaveLength(1);
        expect(segments.filter((s) => s.kind === 'gap')).toHaveLength(3);
        expect(segments).toContainEqual({ kind: 'gap', u1: gaps[0].x1, v1: gaps[0].y1, u2: gaps[0].x2, v2: gaps[0].y2 });
        expect(labels).toEqual([{ kind: 'gap', u: 1.15, v: 1.5, text: '30 cm', align: 'center' }]);
    });

    test('all toggles together', () => {
        const rects = [{ x: 0.5, y: 1.3, w: 0.5, h: 0.4 }, { x: 1.3, y: 1.3, w: 0.5, h: 0.4 }];
        const { labels } = faceAnnotations(face(rects), ALL_ON, 1.5);
        expect(labels.map((l) => l.kind).sort()).toEqual(['floor', 'floor', 'gap', 'hanging']);
    });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/wallEditor/annotations.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/wallEditor/annotations.ts`:

```ts
import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { resolveFace, targetForInstance, targetKey, type WallEditorTarget } from './faces';
import { collectWallFace, type WallFace } from './wallArtworks';
import { centerX, centerY, rowGaps, type Rect } from './layout';
import { formatCm } from './format';
import type { MeasureToggles } from './measureToggles';
import type { RoomFace } from './roomFaces';

/**
 * Wall measures (hanging line, heights above the floor, gaps) in wall coordinates, for any face —
 * not only the one open in the 2D wall editor. Renderers map (u, v) to screen or world themselves.
 */

export type AnnotationKind = 'hanging' | 'floor' | 'gap';

export interface AnnotationSegment {
    kind: AnnotationKind;
    u1: number;
    v1: number;
    u2: number;
    v2: number;
}

export interface AnnotationLabel {
    kind: AnnotationKind;
    u: number;
    v: number;
    text: string;
    /** 'start' = the label begins at (u, v), 'center' = it is centred on it. */
    align: 'center' | 'start';
}

export interface FaceAnnotations {
    segments: AnnotationSegment[];
    labels: AnnotationLabel[];
}

/** Vertical line from an artwork's bottom edge to the floor, labelled with its centre height. */
export interface FloorLeader {
    id: number;
    u: number;
    /** Bottom edge of the artwork. */
    top: number;
    /** The floor (face bottom). */
    bottom: number;
    /** Centre height above the floor. */
    value: number;
    /** Where the label sits: half way down the line. */
    labelV: number;
}

export const HANGING_DASH = 0.06;
export const HANGING_GAP = 0.04;
/** Length of the end caps across a dimension line. */
export const END_CAP = 0.04;

const MIN_LEADER = 0.005;

/** Every face (modular wall side or room wall) that carries at least one artwork. */
export function collectMeasuredFaces(instances: ArtworkInstanceData[], walls: ModularWallData[], roomFaces: RoomFace[]): WallFace[] {
    const groups = new Map<string, { target: WallEditorTarget; instances: ArtworkInstanceData[] }>();
    for (const inst of instances) {
        const target = targetForInstance(inst, walls, roomFaces);
        if (!target) continue;
        const key = targetKey(target);
        const group = groups.get(key);
        if (group) group.instances.push(inst);
        else groups.set(key, { target, instances: [inst] });
    }
    const faces: WallFace[] = [];
    for (const { target, instances: onFace } of groups.values()) {
        const resolved = resolveFace(target, walls, roomFaces);
        if (!resolved) continue;
        const face = collectWallFace(resolved, onFace);
        if (face.items.length > 0) faces.push(face);
    }
    return faces;
}

export function floorLeaders(items: { id: number; rect: Rect }[], floorY: number): FloorLeader[] {
    const leaders: FloorLeader[] = [];
    for (const { id, rect } of items) {
        if (rect.y - floorY <= MIN_LEADER) continue;
        leaders.push({
            id,
            u: centerX(rect),
            top: rect.y,
            bottom: floorY,
            value: centerY(rect) - floorY,
            labelV: (rect.y + floorY) / 2,
        });
    }
    return leaders;
}

const hCaps = (kind: AnnotationKind, u: number, v: number): AnnotationSegment =>
    ({ kind, u1: u - END_CAP / 2, v1: v, u2: u + END_CAP / 2, v2: v });
const vCaps = (kind: AnnotationKind, u: number, v: number): AnnotationSegment =>
    ({ kind, u1: u, v1: v - END_CAP / 2, u2: u, v2: v + END_CAP / 2 });

export function faceAnnotations(
    face: { wallRect: Rect; items: { id: number; rect: Rect }[] },
    toggles: MeasureToggles,
    hangingHeight: number,
): FaceAnnotations {
    const segments: AnnotationSegment[] = [];
    const labels: AnnotationLabel[] = [];
    const { wallRect } = face;

    // A hanging height above the face would float over the wall — skip it there.
    if (toggles.showHangingLine && hangingHeight <= wallRect.h) {
        const v = wallRect.y + hangingHeight;
        const step = HANGING_DASH + HANGING_GAP;
        // Indexed, not accumulated, so float drift cannot add or drop a dash.
        const count = Math.ceil(wallRect.w / step);
        for (let i = 0; i < count; i++) {
            const u = i * step;
            segments.push({ kind: 'hanging', u1: u, v1: v, u2: Math.min(u + HANGING_DASH, wallRect.w), v2: v });
        }
        labels.push({ kind: 'hanging', u: 0.05, v: v + 0.05, text: `Hängehöhe ${formatCm(hangingHeight)}`, align: 'start' });
    }

    if (toggles.showFloorDistances) {
        for (const l of floorLeaders(face.items, wallRect.y)) {
            segments.push({ kind: 'floor', u1: l.u, v1: l.top, u2: l.u, v2: l.bottom });
            segments.push(hCaps('floor', l.u, l.top), hCaps('floor', l.u, l.bottom));
            labels.push({ kind: 'floor', u: l.u, v: l.labelV, text: `Mitte ${formatCm(l.value)}`, align: 'center' });
        }
    }

    if (toggles.showGaps) {
        for (const m of rowGaps(face.items.map((i) => i.rect))) {
            segments.push({ kind: 'gap', u1: m.x1, v1: m.y1, u2: m.x2, v2: m.y2 });
            segments.push(vCaps('gap', m.x1, m.y1), vCaps('gap', m.x2, m.y2));
            labels.push({ kind: 'gap', u: (m.x1 + m.x2) / 2, v: (m.y1 + m.y2) / 2, text: formatCm(m.value), align: 'center' });
        }
    }

    return { segments, labels };
}
```

- [ ] **Step 4: Run** `npx vitest run src/lib/wallEditor/annotations.test.ts` → PASS (13 tests). If `u: 1.15` / `v: 1.55` comparisons fail on floating point, change those assertions to `toBeCloseTo` per field — do not change the implementation.

- [ ] **Step 5: Commit** (main thread)

```bash
git add src/lib/wallEditor/annotations.ts src/lib/wallEditor/annotations.test.ts
git commit -m "feat: wall measure annotations for every face"
```

---

### Task 4: Label textures

**Files:**
- Create: `src/lib/measureLabelTextures.ts`

**Interfaces:**
- Produces:
  - `interface LabelStyle { background: string; color: string }`
  - `interface LabelTexture { texture: THREE.CanvasTexture; width: number; height: number }` (CSS px)
  - `getLabelTexture(text: string, style: LabelStyle): LabelTexture`
  - `onLabelTexturesChanged(listener: () => void): () => void` (returns unsubscribe)

- [ ] **Step 1: Implement** — `src/lib/measureLabelTextures.ts`:

```ts
import * as THREE from 'three';

/**
 * Pill-shaped text labels for the wall measures in 3D, drawn once per text + colour into a canvas.
 * Textures are redrawn (and replaced) once the label font has loaded; listeners then rebuild.
 */

export interface LabelStyle {
    background: string;
    color: string;
}

export interface LabelTexture {
    texture: THREE.CanvasTexture;
    /** Size on screen in CSS pixels. */
    width: number;
    height: number;
}

const FONT = '600 12px "Albert Sans", system-ui, sans-serif';
const HEIGHT = 20;
const PAD_X = 7;
const RADIUS = 5;
// Drawn at twice the on-screen size so labels stay sharp on HiDPI screens.
const RESOLUTION = 2;

interface Entry extends LabelTexture {
    text: string;
    style: LabelStyle;
    canvas: HTMLCanvasElement;
}

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let fontRequested = false;

/** Draws the pill into `canvas` (resizing it) and returns its width in CSS pixels. */
function draw(canvas: HTMLCanvasElement, text: string, style: LabelStyle): number {
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = FONT;
    const width = Math.ceil(ctx.measureText(text).width + PAD_X * 2);
    canvas.width = width * RESOLUTION;
    canvas.height = HEIGHT * RESOLUTION;
    // Resizing the canvas resets the context state.
    ctx.scale(RESOLUTION, RESOLUTION);
    ctx.fillStyle = style.background;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, HEIGHT, RADIUS);
    ctx.fill();
    ctx.font = FONT;
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, HEIGHT / 2 + 0.5);
    return width;
}

function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
}

function redrawAll(): void {
    for (const entry of cache.values()) {
        entry.width = draw(entry.canvas, entry.text, entry.style);
        // A new texture: WebGPU textures cannot change size after creation.
        entry.texture.dispose();
        entry.texture = makeTexture(entry.canvas);
    }
    listeners.forEach((listener) => listener());
}

function requestFont(): void {
    if (fontRequested || typeof document === 'undefined' || !document.fonts) return;
    fontRequested = true;
    document.fonts.load(FONT).then(redrawAll, () => {});
}

export function getLabelTexture(text: string, style: LabelStyle): LabelTexture {
    const key = `${style.background}|${style.color}|${text}`;
    let entry = cache.get(key);
    if (!entry) {
        requestFont();
        const canvas = document.createElement('canvas');
        const width = draw(canvas, text, style);
        entry = { text, style, canvas, width, height: HEIGHT, texture: makeTexture(canvas) };
        cache.set(key, entry);
    }
    return entry;
}

export function onLabelTexturesChanged(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
```

- [ ] **Step 2: Verify** (main thread) `npx tsc -p tsconfig.app.json --noEmit` → no errors in this file.

- [ ] **Step 3: Commit** (main thread)

```bash
git add src/lib/measureLabelTextures.ts
git commit -m "feat: cached pill label textures for 3D measures"
```

---

### Task 5: WallMeasurements3D + mount

**Files:**
- Create: `src/components/WallMeasurements3D.tsx`
- Modify: `src/components/Scene.tsx` (import + mount after `{isEditor && <WallEditorRoomFace />}`)

**Interfaces:**
- Consumes: `collectMeasuredFaces`, `faceAnnotations`, `AnnotationKind` (Task 3); `getLabelTexture`, `onLabelTexturesChanged`, `LabelStyle` (Task 4); `wallToWorld` (`@/lib/wallEditor/geometry`); `WE_COLORS` (`./wall-editor/theme`); store fields `plannerViewMode`, `localInstances`, `localWalls` (editorStore), `phase`, `roomFaces`, `showHangingLine`, `showFloorDistances`, `showGaps`, `hangingHeight` (wallEditorViewStore).
- Produces: `export const WallMeasurements3D: () => JSX.Element | null`

- [ ] **Step 1: Implement** — `src/components/WallMeasurements3D.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import { collectMeasuredFaces, faceAnnotations, type AnnotationKind } from '@/lib/wallEditor/annotations';
import { wallToWorld, type WallFrame } from '@/lib/wallEditor/geometry';
import { getLabelTexture, onLabelTexturesChanged, type LabelStyle } from '@/lib/measureLabelTextures';
import { WE_COLORS } from './wall-editor/theme';

/**
 * The wall measures of the 2D wall editor (hanging line, heights above the floor, gaps) on every
 * wall with artworks, in the 3D orbit view. Lines lie on the wall; labels are sprites of constant
 * screen size. Both are depth-tested, so a wall in front hides them.
 */

const LINE_WIDTH = 0.005;
/** In front of the wall surface, behind the artworks (they sit further out). */
const LINE_D = 0.003;
const LABEL_D = 0.02;
const KINDS: AnnotationKind[] = ['hanging', 'floor', 'gap'];

const LINE_COLORS: Record<AnnotationKind, string> = {
    hanging: WE_COLORS.hanging,
    floor: '#18181b',
    gap: WE_COLORS.spacing,
};

const LABEL_STYLES: Record<AnnotationKind, LabelStyle> = {
    hanging: { background: WE_COLORS.hanging, color: '#1c1917' },
    floor: { background: 'rgba(24,24,27,0.85)', color: '#ffffff' },
    gap: { background: WE_COLORS.spacing, color: '#ffffff' },
};

const noRaycast = () => {};
const _p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

function pushQuad(out: number[], frame: WallFrame, u1: number, v1: number, u2: number, v2: number): void {
    const du = u2 - u1;
    const dv = v2 - v1;
    const len = Math.hypot(du, dv);
    if (len < 1e-6) return;
    const nu = (-dv / len) * (LINE_WIDTH / 2);
    const nv = (du / len) * (LINE_WIDTH / 2);
    wallToWorld(frame, u1 + nu, v1 + nv, LINE_D, _p[0]);
    wallToWorld(frame, u1 - nu, v1 - nv, LINE_D, _p[1]);
    wallToWorld(frame, u2 - nu, v2 - nv, LINE_D, _p[2]);
    wallToWorld(frame, u2 + nu, v2 + nv, LINE_D, _p[3]);
    for (const i of [0, 1, 2, 0, 2, 3]) out.push(_p[i].x, _p[i].y, _p[i].z);
}

interface PlacedLabel {
    key: string;
    kind: AnnotationKind;
    text: string;
    align: 'center' | 'start';
    position: [number, number, number];
}

export const WallMeasurements3D = () => {
    const viewMode = useEditorStore((s) => s.plannerViewMode);
    const instances = useEditorStore((s) => s.localInstances);
    const walls = useEditorStore((s) => s.localWalls);
    const phase = useWallEditorView((s) => s.phase);
    const roomFaces = useWallEditorView((s) => s.roomFaces);
    const showHangingLine = useWallEditorView((s) => s.showHangingLine);
    const showFloorDistances = useWallEditorView((s) => s.showFloorDistances);
    const showGaps = useWallEditorView((s) => s.showGaps);
    const hangingHeight = useWallEditorView((s) => s.hangingHeight);

    const visible = viewMode === 'perspective' && phase === 'idle' && (showHangingLine || showFloorDistances || showGaps);

    const built = useMemo(() => {
        if (!visible) return null;
        const toggles = { showHangingLine, showFloorDistances, showGaps };
        const positions: Record<AnnotationKind, number[]> = { hanging: [], floor: [], gap: [] };
        const labels: PlacedLabel[] = [];
        for (const face of collectMeasuredFaces(instances, walls, roomFaces)) {
            const { segments, labels: faceLabels } = faceAnnotations(face, toggles, hangingHeight);
            for (const s of segments) pushQuad(positions[s.kind], face.frame, s.u1, s.v1, s.u2, s.v2);
            faceLabels.forEach((l, i) => {
                const p = wallToWorld(face.frame, l.u, l.v, LABEL_D);
                labels.push({ key: `${face.key}:${i}`, kind: l.kind, text: l.text, align: l.align, position: [p.x, p.y, p.z] });
            });
        }
        const geometries = {} as Record<AnnotationKind, THREE.BufferGeometry | null>;
        for (const kind of KINDS) {
            if (positions[kind].length === 0) {
                geometries[kind] = null;
                continue;
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions[kind], 3));
            geometry.computeBoundingSphere();
            geometries[kind] = geometry;
        }
        return { geometries, labels };
    }, [visible, instances, walls, roomFaces, showHangingLine, showFloorDistances, showGaps, hangingHeight]);

    useEffect(() => () => {
        if (built) for (const kind of KINDS) built.geometries[kind]?.dispose();
    }, [built]);

    // Label textures are replaced once the font has loaded.
    const [textureVersion, setTextureVersion] = useState(0);
    useEffect(() => onLabelTexturesChanged(() => setTextureVersion((v) => v + 1)), []);

    if (!built) return null;
    return (
        <group>
            {KINDS.map((kind) => {
                const geometry = built.geometries[kind];
                return geometry ? (
                    <mesh key={kind} geometry={geometry} raycast={noRaycast} renderOrder={10}>
                        <meshBasicMaterial
                            color={LINE_COLORS[kind]}
                            transparent
                            opacity={0.9}
                            depthWrite={false}
                            toneMapped={false}
                            side={THREE.DoubleSide}
                            polygonOffset
                            polygonOffsetFactor={-2}
                            polygonOffsetUnits={-2}
                        />
                    </mesh>
                ) : null;
            })}
            {built.labels.map((l) => (
                <MeasureLabel key={l.key} label={l} textureVersion={textureVersion} />
            ))}
        </group>
    );
};

const CENTER_MID: [number, number] = [0.5, 0.5];
const CENTER_START: [number, number] = [0, 0.5];

const MeasureLabel = ({ label, textureVersion }: { label: PlacedLabel; textureVersion: number }) => {
    const camera = useThree((s) => s.camera);
    const viewportHeight = useThree((s) => s.size.height);
    const tex = useMemo(
        () => getLabelTexture(label.text, LABEL_STYLES[label.kind]),
        // textureVersion: the cache swaps textures after the font loads
        [label.text, label.kind, textureVersion], // eslint-disable-line react-hooks/exhaustive-deps
    );
    // With sizeAttenuation off, a sprite of scale s covers s · cot(fov/2) · H/2 pixels.
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
    const k = (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, viewportHeight);
    return (
        <sprite
            position={label.position}
            scale={[tex.width * k, tex.height * k, 1]}
            center={label.align === 'start' ? CENTER_START : CENTER_MID}
            raycast={noRaycast}
            renderOrder={11}
        >
            <spriteMaterial map={tex.texture} sizeAttenuation={false} depthWrite={false} transparent toneMapped={false} />
        </sprite>
    );
};
```

- [ ] **Step 2: Mount** — in `src/components/Scene.tsx` add `import { WallMeasurements3D } from './WallMeasurements3D';` next to the `WallEditorRoomFace` import, and directly after `{isEditor && <WallEditorRoomFace />}` add:

```tsx
                {/* Hanging line, heights above floor and gaps on the walls (orbit view only) */}
                {isEditor && <WallMeasurements3D />}
```

- [ ] **Step 3: Verify** (main thread) `npm run lint` and `npm run build` → no errors.

- [ ] **Step 4: Commit** (main thread)

```bash
git add src/components/WallMeasurements3D.tsx src/components/Scene.tsx
git commit -m "feat: show wall measures on the walls in the 3D view"
```

---

### Task 6: SelectionOutline

**Files:**
- Create: `src/components/SelectionOutline.tsx`

**Interfaces:**
- Consumes: `instanceRefMap`, `useEditorStore`, `WALL_PLACEMENT_OFFSET`, `ArtworkInstanceData` (editorStore); `artworkFrameLayout` (`@/lib/wallEditor/footprint`); `WE_COLORS` (`./wall-editor/theme`). Meshes may carry `userData.selectionBounds = true` (Task 8 sets it on the splat hit proxy): if any descendant has it, only those meshes count.
- Produces: `export const SelectionOutlineTracker: () => null` (inside `<Canvas>`), `export const SelectionOutlineSvg: () => JSX.Element` (DOM, absolutely positioned over the canvas).

- [ ] **Step 1: Implement** — `src/components/SelectionOutline.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { instanceRefMap, useEditorStore, WALL_PLACEMENT_OFFSET, type ArtworkInstanceData } from '@/store/editorStore';
import { artworkFrameLayout } from '@/lib/wallEditor/footprint';
import { WE_COLORS } from './wall-editor/theme';

/**
 * Outline of the selected artwork: its corners (in the artwork group's local space) are projected
 * every frame and written into one SVG path over the canvas. SVG instead of 3D lines gives a real
 * pixel width and works the same on WebGPU and WebGL (drei's Line uses a ShaderMaterial).
 */

let pathElement: SVGPathElement | null = null;

const setPath = (d: string) => {
    if (pathElement && pathElement.getAttribute('d') !== d) pathElement.setAttribute('d', d);
};

export const SelectionOutlineSvg = () => (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
        <path
            ref={(el) => { pathElement = el; }}
            fill="none"
            stroke={WE_COLORS.select}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
        />
    </svg>
);

interface OutlineShape {
    points: THREE.Vector3[];
    edges: [number, number][];
}

const RECT_EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]];
// Corner i: x = bit 0, y = bit 1, z = bit 2.
const BOX_EDGES: [number, number][] = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
];

const EPS = 1e-4;
const safe = (s: number) => (Math.abs(s) > EPS ? s : 1);

const _inverse = new THREE.Matrix4();
const _relative = new THREE.Matrix4();
const _meshBox = new THREE.Box3();

/** Bounds of the group's meshes in the group's local space (null until something has loaded). */
function localBounds(group: THREE.Object3D): THREE.Box3 | null {
    group.updateWorldMatrix(true, true);
    _inverse.copy(group.matrixWorld).invert();
    let flagged = false;
    group.traverse((o) => { if (o.userData.selectionBounds) flagged = true; });
    const box = new THREE.Box3();
    group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        if (flagged ? !o.userData.selectionBounds : o.userData.wallEditorIgnore) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox;
        if (!bb || bb.isEmpty()) return;
        _relative.multiplyMatrices(_inverse, mesh.matrixWorld);
        box.union(_meshBox.copy(bb).applyMatrix4(_relative));
    });
    return box.isEmpty() ? null : box;
}

function outlineShape(inst: ArtworkInstanceData, group: THREE.Object3D): OutlineShape | null {
    const type = inst.artwork.asset.type ?? 'image';
    if (type === 'image') {
        // The frame is instanced elsewhere, so it is computed from the layout. The layout is in
        // unscaled metres; the group carries the instance scale.
        const layout = artworkFrameLayout(inst);
        const sx = safe(inst.scale_x);
        const sy = safe(inst.scale_y);
        const z = (-WALL_PLACEMENT_OFFSET + layout.depth) / safe(inst.scale_z);
        return {
            points: [
                new THREE.Vector3(layout.left / sx, layout.bottom / sy, z),
                new THREE.Vector3(layout.right / sx, layout.bottom / sy, z),
                new THREE.Vector3(layout.right / sx, layout.top / sy, z),
                new THREE.Vector3(layout.left / sx, layout.top / sy, z),
            ],
            edges: RECT_EDGES,
        };
    }
    const box = localBounds(group);
    if (!box) return null;
    if (type === 'video') {
        const z = box.max.z;
        return {
            points: [
                new THREE.Vector3(box.min.x, box.min.y, z),
                new THREE.Vector3(box.max.x, box.min.y, z),
                new THREE.Vector3(box.max.x, box.max.y, z),
                new THREE.Vector3(box.min.x, box.max.y, z),
            ],
            edges: RECT_EDGES,
        };
    }
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
        points.push(new THREE.Vector3(
            i & 1 ? box.max.x : box.min.x,
            i & 2 ? box.max.y : box.min.y,
            i & 4 ? box.max.z : box.min.z,
        ));
    }
    return { points, edges: BOX_EDGES };
}

const _world = new THREE.Vector3();
const _view = new THREE.Vector3();

export const SelectionOutlineTracker = () => {
    const instance = useEditorStore((s) =>
        s.selectedInstanceId === null ? null : s.localInstances.find((i) => i.id === s.selectedInstanceId) ?? null);
    const active = useEditorStore((s) => s.plannerViewMode !== 'firstPerson' && !s.wallEditor);
    const shape = useRef<OutlineShape | null>(null);
    const screen = useRef<{ x: number; y: number }[]>([]);

    useEffect(() => {
        shape.current = null;
        if (!active || !instance) setPath('');
    }, [instance, active]);
    useEffect(() => () => setPath(''), []);

    useFrame(({ camera, size }) => {
        if (!active || !instance) return;
        const group = instanceRefMap.get(instance.id);
        if (!group) {
            setPath('');
            return;
        }
        // Models and splats load asynchronously: retry until they have bounds.
        if (!shape.current) shape.current = outlineShape(instance, group);
        const current = shape.current;
        if (!current) {
            setPath('');
            return;
        }
        group.updateWorldMatrix(true, false);
        const perspective = camera instanceof THREE.PerspectiveCamera;
        screen.current.length = 0;
        for (const p of current.points) {
            _world.copy(p).applyMatrix4(group.matrixWorld);
            // A corner behind the camera would project to the wrong side of the screen.
            if (perspective && _view.copy(_world).applyMatrix4(camera.matrixWorldInverse).z > -camera.near) {
                setPath('');
                return;
            }
            _world.project(camera);
            screen.current.push({ x: ((_world.x + 1) / 2) * size.width, y: ((1 - _world.y) / 2) * size.height });
        }
        const pts = screen.current;
        setPath(current.edges
            .map(([a, b]) => `M${pts[a].x.toFixed(1)} ${pts[a].y.toFixed(1)}L${pts[b].x.toFixed(1)} ${pts[b].y.toFixed(1)}`)
            .join(''));
    });

    return null;
};
```

- [ ] **Step 2: Verify** (main thread) `npm run lint` → no errors in this file (mounting happens in Task 13).

- [ ] **Step 3: Commit** (main thread)

```bash
git add src/components/SelectionOutline.tsx
git commit -m "feat: constant-width outline for the selected artwork"
```

---

### Task 7: Remove old selection visuals (images, models)

**Files:**
- Modify: `src/components/SelectableInstance.tsx` — delete the whole `{/* Selection halo … */}` block (`{selected && ( <mesh …> … </mesh> )}` around lines 126–137). Keep `selected` (still used for `forceMax`).
- Modify: `src/components/ModelInstance.tsx`:
  - delete the `// Selection highlight: apply emissive to all meshes` `useMemo` block,
  - delete the `{/* Bounding box wireframe — only when selected */}` block,
  - change the component signature `({ instance, selected }, ref)` to `({ instance }, ref)` (keep `selected` in the props interface — `PlacedArtworks` passes it to every instance type),
  - remove imports that become unused (check `useMemo` — still used by the bbox memo).

- [ ] **Step 1: Apply the edits above.**
- [ ] **Step 2: Verify** (main thread) `npm run lint` → no unused-variable errors.
- [ ] **Step 3: Commit** (main thread, together with Task 8): see Task 8.

---

### Task 8: Remove old selection visuals (videos, splats)

**Files:**
- Modify: `src/components/VideoInstance.tsx`:
  - in `getFrameProps`, use the unselected values only: projector `{ color: '#111', emissive: '#334155', emissiveIntensity: 0.15, frameSize: 0.01 }`, display `{ color: '#111', emissive: '#000000', emissiveIntensity: 0, frameSize: 0.03 }`, default `{ color: '#222', emissive: '#000000', emissiveIntensity: 0, frameSize: 0.04 }`,
  - delete both `{selected && ( … )}` blocks (monitor selection box, beamer selection plane),
  - drop `selected` from the destructured parameters `({ instance, selected, isEditor = true }, ref)` → `({ instance, isEditor = true }, ref)` if it has no other use (grep first); keep it in the props interface.
- Modify: `src/components/SplatInstance.tsx`:
  - the placeholder/selection box condition `(load.status !== 'ready' || selected)` → `load.status !== 'ready'`; its material becomes `opacity={0.35}` and loses the `depthTest` prop,
  - where `hitProxy` is created, add `hitProxy.userData.selectionBounds = true;` with comment `// SelectionOutline measures the splat by this box`,
  - drop `selected` from the destructured parameters if unused (keep it in the props interface).

- [ ] **Step 1: Apply the edits above.**
- [ ] **Step 2: Verify** (main thread) `npm run lint` + `npm run build`.
- [ ] **Step 3: Commit** (main thread)

```bash
git add src/components/SelectableInstance.tsx src/components/ModelInstance.tsx src/components/VideoInstance.tsx src/components/SplatInstance.tsx
git commit -m "refactor: drop per-type selection tints in favour of the outline"
```

---

### Task 9: 2D floor leaders

**Files:**
- Modify: `src/components/wall-editor/WallEditorOverlay.tsx`

**Interfaces:**
- Consumes: `floorLeaders` (Task 3) from `@/lib/wallEditor/annotations`; existing `MeasureLine`, `formatCm`, `rectOf`, `selectedSet`, `items`, `wallRect`, `vt`.

- [ ] **Step 1: Replace** the per-item pill loop inside `if (view.showFloorDistances) { … }`:

```tsx
        for (const item of items) {
            if (selectedSet.has(item.id)) continue;
            const r = rectOf(item);
            annotations.push(
                <Pill key={`fh${item.id}`} x={sx(centerX(r))} y={sy(centerY(r))} text={`Mitte ${formatCm(centerY(r) - wallRect.y)}`} color="rgba(24,24,27,0.85)" />,
            );
        }
```

with:

```tsx
        // Line from each artwork's bottom edge to the floor, its centre height half way down (same as 3D)
        const unselected = items.filter((i) => !selectedSet.has(i.id)).map((i) => ({ id: i.id, rect: rectOf(i) }));
        for (const l of floorLeaders(unselected, wallRect.y)) {
            annotations.push(
                <MeasureLine
                    key={`fh${l.id}`}
                    m={{ x1: l.u, y1: l.bottom, x2: l.u, y2: l.top, value: l.value }}
                    vt={vt}
                    color="rgba(24,24,27,0.85)"
                    label={`Mitte ${formatCm(l.value)}`}
                />,
            );
        }
```

Keep the `FloorChain` line for the selection after it. Add `import { floorLeaders } from '@/lib/wallEditor/annotations';`. Remove imports that become unused (`centerX`/`centerY`/`Pill` only if nothing else in the file uses them — grep).

- [ ] **Step 2: Verify** (main thread) `npm run lint`.
- [ ] **Step 3: Commit** (main thread)

```bash
git add src/components/wall-editor/WallEditorOverlay.tsx
git commit -m "feat: floor leaders for heights above floor in the 2D wall editor"
```

---

### Task 11: Store — persisted toggles

**Files:**
- Modify: `src/store/wallEditorViewStore.ts`

**Interfaces:**
- Consumes: `readMeasureToggles`, `writeMeasureToggles`, `browserStorage` (Task 2).

- [ ] **Step 1: Import** `import { browserStorage, readMeasureToggles, writeMeasureToggles } from '../lib/wallEditor/measureToggles';`

- [ ] **Step 2: Initial state** — replace

```ts
    showFloorDistances: false,
    showGaps: false,
    showHangingLine: true,
```

with

```ts
    ...readMeasureToggles(browserStorage()),
```

- [ ] **Step 3: Toggle** — replace

```ts
    toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<WallEditorViewState>),
```

with

```ts
    toggle: (key) => set((s) => {
        const next = { [key]: !s[key] } as Partial<WallEditorViewState>;
        // The measure toggles also drive the 3D view and survive a reload.
        if (key === 'showHangingLine' || key === 'showFloorDistances' || key === 'showGaps') {
            writeMeasureToggles(browserStorage(), {
                showHangingLine: s.showHangingLine,
                showFloorDistances: s.showFloorDistances,
                showGaps: s.showGaps,
                [key]: !s[key],
            });
        }
        return next;
    }),
```

- [ ] **Step 4: Verify** (main thread) `npm test`, `npm run lint`.
- [ ] **Step 5: Commit** (main thread)

```bash
git add src/store/wallEditorViewStore.ts
git commit -m "feat: wall measure toggles survive a reload"
```

---

### Task 12: ToolbarPopoverButton + MeasurementsControl

**Files:**
- Create: `src/components/ToolbarPopoverButton.tsx`
- Create: `src/components/MeasurementsControl.tsx`

(`CmInput` export: see Step 3 — a one-word change in `WallEditorPanel.tsx`, done by the main thread to keep this task at two files.)

**Interfaces:**
- Produces:
  - `ToolbarPopoverButton({ icon: ReactNode; tooltip: string; active?: boolean; children: ReactNode })`
  - `MeasurementsControl()` — no props.
- Consumes: `Popover`, `PopoverContent`, `PopoverTrigger` (`@/components/ui/popover`); `CmInput` (`./wall-editor/WallEditorPanel`); `cn` (`@/lib/utils`); store fields.

- [ ] **Step 1: Implement** `src/components/ToolbarPopoverButton.tsx` — markup and styles copied from `RenderSettingsButton` in `EditorPage.tsx` (lines 115–173), generalised:

```tsx
import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ToolbarPopoverButtonProps {
    icon: ReactNode;
    tooltip: string;
    /** Something inside is switched on — tinted even while closed. */
    active?: boolean;
    children: ReactNode;
}

/** Tool bar button that opens a popover above it (render settings, measures). */
export const ToolbarPopoverButton = ({ icon, tooltip, active, children }: ToolbarPopoverButtonProps) => {
    const [open, setOpen] = useState(false);
    const [hovered, setHovered] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <div style={{ position: 'relative' }}>
                <PopoverTrigger asChild>
                    <button
                        aria-label={tooltip}
                        onMouseEnter={() => setHovered(true)}
                        onMouseLeave={() => setHovered(false)}
                        style={{
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 8,
                            border: 'none',
                            background: open
                                ? 'rgba(59,130,246,0.7)'
                                : active
                                    ? 'rgba(59,130,246,0.35)'
                                    : hovered ? 'rgba(255,255,255,0.08)' : 'transparent',
                            color: open || active ? '#fff' : 'rgba(255,255,255,0.7)',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease, color 0.15s ease',
                        }}
                    >
                        {icon}
                    </button>
                </PopoverTrigger>
                {hovered && !open && (
                    <div style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 8px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: 'rgba(0,0,0,0.92)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        fontFamily: '"Albert Sans", sans-serif',
                    }}>
                        {tooltip}
                    </div>
                )}
            </div>
            <PopoverContent
                side="top"
                align="end"
                sideOffset={12}
                className="w-auto rounded-xl border-white/10 bg-black/80 p-4 backdrop-blur-xl"
            >
                {children}
            </PopoverContent>
        </Popover>
    );
};
```

- [ ] **Step 2: Implement** `src/components/MeasurementsControl.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ArrowDownToLine, BetweenHorizontalStart, Ruler, SeparatorHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import type { MeasureToggleKey } from '@/lib/wallEditor/measureToggles';
import { CmInput } from './wall-editor/WallEditorPanel';
import { ToolbarPopoverButton } from './ToolbarPopoverButton';

const ENTRIES: { key: MeasureToggleKey; label: string; icon: ReactNode }[] = [
    { key: 'showHangingLine', label: 'Hängehöhe anzeigen', icon: <SeparatorHorizontal className="h-4 w-4" /> },
    { key: 'showFloorDistances', label: 'Höhen über Boden anzeigen', icon: <ArrowDownToLine className="h-4 w-4" /> },
    { key: 'showGaps', label: 'Abstände zwischen Werken anzeigen', icon: <BetweenHorizontalStart className="h-4 w-4" /> },
];

/** Tool bar popover: the wall measures of the 2D wall editor, shown on the walls in 3D. */
export const MeasurementsControl = () => {
    const showHangingLine = useWallEditorView((s) => s.showHangingLine);
    const showFloorDistances = useWallEditorView((s) => s.showFloorDistances);
    const showGaps = useWallEditorView((s) => s.showGaps);
    const hangingHeight = useWallEditorView((s) => s.hangingHeight);
    const toggle = useWallEditorView((s) => s.toggle);
    const setHangingHeight = useWallEditorView((s) => s.setHangingHeight);
    const perspective = useEditorStore((s) => s.plannerViewMode === 'perspective');

    const values: Record<MeasureToggleKey, boolean> = { showHangingLine, showFloorDistances, showGaps };

    return (
        <ToolbarPopoverButton icon={<Ruler size={16} />} tooltip="Maße" active={showHangingLine || showFloorDistances || showGaps}>
            <div className="flex w-64 flex-col gap-1 text-white">
                <span className="mb-1 text-xs font-semibold text-zinc-300">Maße an den Wänden</span>
                {ENTRIES.map((entry) => (
                    <button
                        key={entry.key}
                        type="button"
                        aria-pressed={values[entry.key]}
                        onClick={() => toggle(entry.key)}
                        className={cn(
                            'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                            values[entry.key] ? 'bg-blue-500/70 text-white' : 'text-zinc-300 hover:bg-white/10',
                        )}
                    >
                        {entry.icon}
                        <span>{entry.label}</span>
                    </button>
                ))}
                <div className="mt-2">
                    <CmInput label="Hängehöhe (Bildmitte über Boden)" value={hangingHeight} onCommit={setHangingHeight} />
                </div>
                {!perspective && <p className="mt-2 text-[11px] text-zinc-400">Nur in der 3D-Ansicht sichtbar.</p>}
            </div>
        </ToolbarPopoverButton>
    );
};
```

- [ ] **Step 3: Export CmInput** (main thread) — in `src/components/wall-editor/WallEditorPanel.tsx` change `const CmInput = (` to `export const CmInput = (`.

- [ ] **Step 4: Verify** (main thread) `npm run lint`.
- [ ] **Step 5: Commit** (main thread)

```bash
git add src/components/ToolbarPopoverButton.tsx src/components/MeasurementsControl.tsx src/components/wall-editor/WallEditorPanel.tsx
git commit -m "feat: measures popover in the editor tool bar"
```

---

### Task 13: EditorPage wiring

**Files:**
- Modify: `src/pages/EditorPage.tsx`

**Interfaces:**
- Consumes: `ToolbarPopoverButton` (Task 12), `MeasurementsControl` (Task 12), `SelectionOutlineTracker`, `SelectionOutlineSvg` (Task 6).

- [ ] **Step 1: Render settings** — delete the `RenderSettingsButton` component (the `/** Gear in the tool bar … */` comment through its closing `};`). In the tool bar replace `<RenderSettingsButton />` with:

```tsx
          <MeasurementsControl />
          <ToolbarPopoverButton icon={<Settings size={16} />} tooltip="Darstellung">
            <RenderQualityControl className="flex-col items-stretch gap-3" />
          </ToolbarPopoverButton>
```

Remove the now-unused `Popover, PopoverContent, PopoverTrigger` import. Add imports:

```tsx
import { ToolbarPopoverButton } from '../components/ToolbarPopoverButton';
import { MeasurementsControl } from '../components/MeasurementsControl';
import { SelectionOutlineSvg, SelectionOutlineTracker } from '../components/SelectionOutline';
```

- [ ] **Step 2: Outline** — inside `<Canvas>` directly after `<ArtworkPlacement />` add `<SelectionOutlineTracker />`. Directly after `<SceneLoadingIndicator />` add:

```tsx
      {/* Outline of the selected artwork (projected by SelectionOutlineTracker) */}
      <SelectionOutlineSvg />
```

- [ ] **Step 3: Verify** (main thread) `npm run lint`, `npm run build`, `npm test`.
- [ ] **Step 4: Commit** (main thread)

```bash
git add src/pages/EditorPage.tsx
git commit -m "feat: wire selection outline and measures control into the editor"
```

---

### Task 10: Verification (main thread)

- [ ] **Step 1:** `npm test && npm run lint && npm run build` → all green.
- [ ] **Step 2:** Start frontend (`npm run dev`) and backend (`cd server && npm run dev`) via the preview tooling or headless Chrome over CDP (`--headless=new --enable-unsafe-webgpu`, see CLAUDE.md). Log in with a seed/test user, open a project with a modular wall and room-wall artworks.
- [ ] **Step 3: Outline** — select a framed picture, a video, a 3D model; screenshots near and far, WebGPU and `?renderer=webgl`. Expect: 2.5 px blue outline around the frame's outer edge / box edges, no blue tint on the artwork. Orbit very close so a corner goes behind the camera → outline disappears, no lines across the screen.
- [ ] **Step 4: Measures** — turn all three toggles on in the "Maße" popover. Expect dashed amber hanging line + label, dark floor leaders with "Mitte … cm", pink gap lines on all walls with artworks. Orbit behind a modular wall → the hidden face's measures are gone. Switch to Grundriss and Ego-Perspektive → none. Open the 2D editor → floor leaders with label half way down. Reload → toggles kept.
- [ ] **Step 5:** Click an artwork through a label → the artwork gets selected.
- [ ] **Step 6:** Update `CLAUDE.md` (Architecture → "2D Wall Editor": one paragraph on 3D measures + selection outline) and commit.
