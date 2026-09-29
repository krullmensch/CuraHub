# 2D-Wandeditor: Feinschliff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hängehöhe (Standard 145 cm) und Hilfslinien pro Ausstellungsversion speichern, Hilfslinien richtig herum aus den Linealen ziehen und in einem Tab „Linien" verwalten, Werk-Eigenschaften und Skalieren (S, Eck-Griffe, Felder, ±5 %) im 2D-Wandeditor.

**Architecture:** Server: zwei neue Spalten an `ExhibitionVersion` plus reine Key-Umrechnung in `server/src/lib/wallGuides.ts`, neue Route `…/wall-layout` (GET/PATCH), Kopieren beim Versionsspeichern/Mergen. Client: `wallEditorViewStore` hält `guidesByFace` und `hangingHeight`, `lib/wallEditor/layoutSync.ts` lädt/speichert außerhalb von React. Das Panel bekommt Tabs „Anordnen | Werk | Linien"; Skalieren ist reine Mathematik in `lib/wallEditor/scale.ts`, Vorschau im Overlay, ein Commit am Ende.

**Tech Stack:** React 19, Zustand 5, TypeScript 5.9, Vite (rolldown-vite 7.2.5), neu Vitest + Zod 4 im Frontend; Express 5, Prisma 5.22 (MySQL), Jest im Server.

**Spec:** `docs/superpowers/specs/2026-09-27-wandeditor-feinschliff-design.md`

## Global Constraints

- Alle sichtbaren Texte auf **Deutsch**.
- Kein `any` — `unknown` + Type Guards.
- Intern Meter, im UI Zentimeter über `formatCm` / `parseCm` / `CmInput` aus `src/lib/wallEditor/format.ts`.
- Hängehöhe: Standard **1,45 m**, erlaubt **0,01–9,99 m**.
- Hilfslinien: `axis: 'h'` = waagrecht, `value` = Meter über der Unterkante der Wandseite (`wallRect.y`); `axis: 'v'` = senkrecht, `value` = Meter ab linker Kante (`wallRect.x`). Werte **−100 … 100 m**, höchstens **200** Linien pro Seite.
- Face-Keys = `targetKey()` aus `src/lib/wallEditor/faces.ts`: `wall:<wallId>:<side>` oder `room:<key>:<idx>`.
- Speichern der Wand-Layouts: 300 ms Debounce, vollständiger Stand pro PATCH, Speicherfunktion schreibt nur (keine Store-Aktionen, siehe Bug 1 in CLAUDE.md).
- Jede Instanz-Änderung genau ein `commitLocalChange` (= ein Undo-Schritt).
- Skalieren immer um die Bildmitte; Monitore (`asset.type === 'video' && medium === 'monitor'`) nie skalieren.
- Code-Kommentare englisch, Stil der Umgebung (4 Leerzeichen in `wall-editor/` und `lib/wallEditor/`, 2 in `editorStore.ts`, `SaveVersionDialog.tsx`, `EditorPage.tsx`).
- Branch `feat/wall-editor-finetuning` (existiert). `.serena/` nie committen. Commit-Nachrichten enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Vor jedem Commit: `npm run lint` und `npx tsc -b` im Root (Server-Tasks: `cd server && npm run build && npm test`).

## Voraussetzungen für manuelle Prüfungen

MySQL läuft (`docker compose up -d`), Backend `cd server && npm run dev` (Port 3000), Frontend über `preview_start` / `npm run dev` (Port 5173), eingeloggt, eine Ausstellung mit mindestens einer Stellwand und einem Bild geöffnet. Browser-Panes laufen ohne rAF: DOM/SVG-Overlay lässt sich prüfen, das 3D-Bild nur bei sichtbarem Pane oder per headless Chrome (siehe CLAUDE.md, „Render Backends").

## Dateiübersicht

| Datei | Neu/Ändern | Verantwortung |
|---|---|---|
| `vitest.config.ts`, `package.json`, `tsconfig.node.json` | Neu/Ändern | Vitest für reine Logik in `src/lib/` |
| `src/lib/wallEditor/guides.ts` (+ `.test.ts`) | Neu | Hilfslinien-Mathematik, Zod-Parse der Layout-Antwort, Key-Umbenennung |
| `server/prisma/schema.prisma`, `server/prisma/migrations/20260927120000_wall_layout/migration.sql` | Ändern/Neu | `hanging_height`, `wall_guides` |
| `server/src/lib/wallGuides.ts` (+ `server/src/tests/wallGuides.test.ts`) | Neu | Zod-Schemas, Keys beim Kopieren umschreiben, Keys gelöschter Wände entfernen |
| `server/src/routes/versions.ts` | Ändern | GET/PATCH `wall-layout`, Kopieren in POST und Merge |
| `server/src/routes/walls.ts` | Ändern | Beim Löschen Guides der Wand entfernen |
| `src/lib/wallEvents.ts` | Neu | Wand-ID ersetzt / Wand gelöscht (ohne Imports, damit editorStore es nutzen kann) |
| `src/store/editorStore.ts` | Ändern | Wand-Events auslösen |
| `src/store/wallEditorViewStore.ts` | Ändern | `guidesByFace`, Hängehöhe ohne localStorage, Ausblenden/Sperren, Hover, Panel-Tab |
| `src/lib/wallEditor/layoutSync.ts` | Neu | Laden/Speichern von Hängehöhe + Hilfslinien |
| `src/pages/EditorPage.tsx`, `src/components/SaveVersionDialog.tsx` | Ändern | Sync starten, Layout beim Versionsspeichern mitschicken |
| `src/components/wall-editor/WallEditorRulers.tsx` | Ändern | Lineal → Achse getauscht, Marker aus Wandkoordinaten |
| `src/components/wall-editor/WallEditorOverlay.tsx` | Ändern | Hilfslinien pro Seite, Hängelinie ziehen, Skalieren |
| `src/components/wall-editor/theme.ts` | Ändern | `HANDLE_PX` |
| `src/components/wall-editor/PanelPrimitives.tsx` | Neu | `CmInput`, `Section`, `IconAction` (aus WallEditorPanel) |
| `src/components/wall-editor/WallEditorPanel.tsx` | Ändern | Tabs, Tab „Anordnen" (bisheriger Inhalt) |
| `src/components/wall-editor/WallEditorGuidesTab.tsx` | Neu | Tab „Linien" |
| `src/components/wall-editor/WallEditorArtworkTab.tsx` | Neu | Tab „Werk" |
| `src/components/wall-editor/WallEditorChrome.tsx` | Ändern | Tab beim Öffnen zurücksetzen |
| `src/lib/passepartout.ts` | Neu | `PassepartoutValue`, `NO_PASSEPARTOUT`, `passepartoutOf` |
| `src/components/properties/NumericInput.tsx`, `src/components/properties/FrameControls.tsx` | Neu | Aus PropertiesPanel verschoben |
| `src/components/PropertiesPanel.tsx` | Ändern | Importiert die verschobenen Teile |
| `src/lib/wallEditor/scale.ts` (+ `.test.ts`) | Neu | Skalier-Faktoren, Einrasten, Grenzen |
| `src/lib/wallEditor/footprint.ts` | Ändern | `pictureSize(inst)` |
| `src/lib/wallEditor/wallArtworks.ts` | Ändern | `isPicture`, `isScalable`, `scaleArtworks`, `resizeArtwork`, `commitScaledArtworks` |
| `src/lib/wallEditor/operations.ts` | Ändern | Skalieren, Bildmaß, Rahmen, Passepartout, Medium für die Auswahl |
| `src/wiki/2d-wall-editor.md`, `CLAUDE.md` | Ändern | Doku |

---

### Task 1: Vitest und reine Hilfslinien-Logik

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (Scripts, Abhängigkeiten), `tsconfig.node.json`
- Create: `src/lib/wallEditor/guides.ts`
- Test: `src/lib/wallEditor/guides.test.ts`

**Interfaces:**
- Produces (`src/lib/wallEditor/guides.ts`):
  - `type GuideAxis = 'h' | 'v'`
  - `interface StoredGuide { axis: GuideAxis; value: number }`
  - `type WallGuides = Record<string, StoredGuide[]>`
  - `interface WallLayout { hangingHeight: number; guides: WallGuides }`
  - Konstanten `DEFAULT_HANGING_HEIGHT = 1.45`, `MIN_HANGING_HEIGHT = 0.01`, `MAX_HANGING_HEIGHT = 9.99`, `MAX_GUIDES_PER_FACE = 200`
  - `parseWallLayout(json: unknown): WallLayout`
  - `guideToWall(g: StoredGuide, wall: Rect): number`
  - `wallToGuideValue(axis: GuideAxis, wallValue: number, wall: Rect): number`
  - `clampGuideValue(axis: GuideAxis, value: number, wall: Rect): number`
  - `sortGuides<T extends StoredGuide>(guides: T[]): T[]`
  - `flipGuide<T extends StoredGuide>(g: T, wall: Rect): T`
  - `hasGuideAt(guides: StoredGuide[], axis: GuideAxis, value: number): boolean`
  - `newGuideValue(axis: GuideAxis, viewCenter: { u: number; v: number }, wall: Rect): number`
  - `serializeGuides(byFace: Record<string, readonly StoredGuide[]>): WallGuides`
  - `renameWallKeys<T>(byFace: Record<string, T>, from: number, to: number): Record<string, T>`
  - `dropWallKeys<T>(byFace: Record<string, T>, wallId: number): Record<string, T>`

- [ ] **Step 1: Abhängigkeiten installieren**

```bash
npm install zod@^4.1.13
```

```bash
npm install -D vitest@^5.0.2
```

Falls die zweite Installation an einem Peer-Konflikt mit `rolldown-vite` scheitert: `npm install -D vitest@^4` verwenden und das im Commit erwähnen.

- [ ] **Step 2: Vitest einrichten**

`vitest.config.ts` (neu):

```ts
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Unit tests for pure logic in src/lib (no DOM, no Three.js scene).
export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
});
```

In `package.json` unter `"scripts"` nach `"lint": "eslint ."` ergänzen:

```json
    "test": "vitest run",
```

In `tsconfig.node.json` die letzte Zeile ändern:

```json
  "include": ["vite.config.ts", "vitest.config.ts"]
```

- [ ] **Step 3: Failing test schreiben**

`src/lib/wallEditor/guides.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rect } from './layout';
import {
    DEFAULT_HANGING_HEIGHT,
    clampGuideValue,
    dropWallKeys,
    flipGuide,
    guideToWall,
    hasGuideAt,
    newGuideValue,
    parseWallLayout,
    renameWallKeys,
    serializeGuides,
    sortGuides,
    wallToGuideValue,
    type StoredGuide,
} from './guides';

// A face whose floor sits 10 cm below the frame origin (like room walls).
const wall: Rect = { x: 0, y: -0.1, w: 4, h: 3 };

describe('guide ↔ wall coordinates', () => {
    it('measures horizontal guides from the floor and vertical ones from the left edge', () => {
        expect(guideToWall({ axis: 'h', value: 1.45 }, wall)).toBeCloseTo(1.35);
        expect(guideToWall({ axis: 'v', value: 2 }, wall)).toBeCloseTo(2);
    });

    it('converts wall positions back to guide values', () => {
        expect(wallToGuideValue('h', 1.35, wall)).toBeCloseTo(1.45);
        expect(wallToGuideValue('v', 2, wall)).toBeCloseTo(2);
    });

    it('clamps values to the face', () => {
        expect(clampGuideValue('h', 5, wall)).toBe(3);
        expect(clampGuideValue('v', -1, wall)).toBe(0);
        expect(clampGuideValue('v', 3.5, wall)).toBe(3.5);
    });
});

describe('sortGuides', () => {
    it('lists horizontal guides top to bottom, then vertical ones left to right', () => {
        const guides: StoredGuide[] = [
            { axis: 'v', value: 3 },
            { axis: 'h', value: 1 },
            { axis: 'v', value: 0.5 },
            { axis: 'h', value: 2.5 },
        ];
        expect(sortGuides(guides)).toEqual([
            { axis: 'h', value: 2.5 },
            { axis: 'h', value: 1 },
            { axis: 'v', value: 0.5 },
            { axis: 'v', value: 3 },
        ]);
    });

    it('does not change its input', () => {
        const guides: StoredGuide[] = [{ axis: 'v', value: 3 }, { axis: 'h', value: 1 }];
        sortGuides(guides);
        expect(guides[0].axis).toBe('v');
    });
});

describe('flipGuide', () => {
    it('keeps the value and the other fields', () => {
        expect(flipGuide({ id: 7, axis: 'h' as const, value: 2 }, wall)).toEqual({ id: 7, axis: 'v', value: 2 });
    });

    it('clamps to the face along the new direction', () => {
        expect(flipGuide({ axis: 'v' as const, value: 3.5 }, wall)).toEqual({ axis: 'h', value: 3 });
    });
});

describe('hasGuideAt', () => {
    it('finds a guide within half a millimetre on the same axis', () => {
        const guides: StoredGuide[] = [{ axis: 'v', value: 2 }];
        expect(hasGuideAt(guides, 'v', 2.0004)).toBe(true);
        expect(hasGuideAt(guides, 'v', 2.002)).toBe(false);
        expect(hasGuideAt(guides, 'h', 2)).toBe(false);
    });
});

describe('newGuideValue', () => {
    it('starts in the middle of the view, rounded to whole centimetres', () => {
        expect(newGuideValue('v', { u: 1.234, v: 0 }, wall)).toBeCloseTo(1.23);
        expect(newGuideValue('h', { u: 0, v: 1.4567 }, wall)).toBeCloseTo(1.56);
    });

    it('stays on the face when the view shows something else', () => {
        expect(newGuideValue('v', { u: 12, v: 0 }, wall)).toBe(4);
        expect(newGuideValue('h', { u: 0, v: -3 }, wall)).toBe(0);
    });
});

describe('serializeGuides', () => {
    it('drops ids and faces without guides', () => {
        const withId = { id: 3, axis: 'h' as const, value: 1.45 };
        expect(serializeGuides({ 'wall:1:front': [withId], 'wall:1:back': [] }))
            .toEqual({ 'wall:1:front': [{ axis: 'h', value: 1.45 }] });
    });
});

describe('renameWallKeys / dropWallKeys', () => {
    const byFace = { 'wall:-1:front': 1, 'wall:-12:back': 2, 'room:satellit:0': 3 };

    it('moves a temporary wall id to its database id', () => {
        expect(renameWallKeys(byFace, -1, 7)).toEqual({ 'wall:7:front': 1, 'wall:-12:back': 2, 'room:satellit:0': 3 });
    });

    it('returns the same object when nothing matches', () => {
        expect(renameWallKeys(byFace, 99, 7)).toBe(byFace);
        expect(dropWallKeys(byFace, 99)).toBe(byFace);
    });

    it('removes every face of a deleted wall', () => {
        expect(dropWallKeys({ ...byFace, 'wall:-1:left': 4 }, -1)).toEqual({ 'wall:-12:back': 2, 'room:satellit:0': 3 });
    });
});

describe('parseWallLayout', () => {
    afterEach(() => vi.restoreAllMocks());

    it('accepts a valid layout', () => {
        const layout = { hangingHeight: 1.5, guides: { 'wall:1:front': [{ axis: 'v', value: 2 }] } };
        expect(parseWallLayout(layout)).toEqual(layout);
    });

    it('keeps a valid hanging height when the guides are broken', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(parseWallLayout({ hangingHeight: 1.3, guides: { a: [{ axis: 'x', value: 1 }] } }))
            .toEqual({ hangingHeight: 1.3, guides: {} });
    });

    it('falls back to the defaults for garbage', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(parseWallLayout('nope')).toEqual({ hangingHeight: DEFAULT_HANGING_HEIGHT, guides: {} });
        expect(parseWallLayout({ hangingHeight: 42 })).toEqual({ hangingHeight: DEFAULT_HANGING_HEIGHT, guides: {} });
    });
});
```

- [ ] **Step 4: Test laufen lassen, muss scheitern**

Run: `npx vitest run src/lib/wallEditor/guides.test.ts`
Expected: FAIL — `Failed to resolve import "./guides"` (oder „Cannot find module").

- [ ] **Step 5: Implementieren**

`src/lib/wallEditor/guides.ts`:

```ts
import { z } from 'zod';
import type { Rect } from './layout';

/**
 * Ruler guides and hanging height of the 2D wall editor, stored per exhibition version
 * (server/src/lib/wallGuides.ts mirrors the limits). Guide values are relative to the face:
 * 'h' = horizontal line, metres above the face's floor (wallRect.y);
 * 'v' = vertical line, metres from the face's left edge (wallRect.x).
 */

export type GuideAxis = 'h' | 'v';

export interface StoredGuide {
    axis: GuideAxis;
    value: number;
}

/** Guides per wall face, keyed by targetKey(): `wall:<id>:<side>` or a room face id. */
export type WallGuides = Record<string, StoredGuide[]>;

export interface WallLayout {
    hangingHeight: number;
    guides: WallGuides;
}

export const DEFAULT_HANGING_HEIGHT = 1.45;
export const MIN_HANGING_HEIGHT = 0.01;
export const MAX_HANGING_HEIGHT = 9.99;
export const MAX_GUIDES_PER_FACE = 200;

const hangingHeightSchema = z.number().min(MIN_HANGING_HEIGHT).max(MAX_HANGING_HEIGHT);
const wallGuidesSchema = z.record(
    z.string(),
    z.array(z.object({ axis: z.enum(['h', 'v']), value: z.number().min(-100).max(100) })).max(MAX_GUIDES_PER_FACE),
);

/** Validates a wall-layout response field by field; broken fields fall back to the defaults. */
export function parseWallLayout(json: unknown): WallLayout {
    const data = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>;
    const height = hangingHeightSchema.safeParse(data.hangingHeight);
    const guides = wallGuidesSchema.safeParse(data.guides ?? {});
    if (!height.success || !guides.success) console.warn('[WallLayout] Ignoring invalid wall layout data:', json);
    return {
        hangingHeight: height.success ? height.data : DEFAULT_HANGING_HEIGHT,
        guides: guides.success ? guides.data : {},
    };
}

/** Position of a guide in wall coordinates: v for horizontal lines, u for vertical ones. */
export function guideToWall(g: StoredGuide, wall: Rect): number {
    return g.axis === 'h' ? wall.y + g.value : wall.x + g.value;
}

/** Guide value for a position in wall coordinates. */
export function wallToGuideValue(axis: GuideAxis, wallValue: number, wall: Rect): number {
    return axis === 'h' ? wallValue - wall.y : wallValue - wall.x;
}

/** Keeps a value on the face: 0 … height for horizontal lines, 0 … width for vertical ones. */
export function clampGuideValue(axis: GuideAxis, value: number, wall: Rect): number {
    const max = axis === 'h' ? wall.h : wall.w;
    return Math.min(max, Math.max(0, value));
}

/** Menu order: horizontal lines top to bottom, then vertical lines left to right. */
export function sortGuides<T extends StoredGuide>(guides: T[]): T[] {
    return [...guides].sort((a, b) => {
        if (a.axis !== b.axis) return a.axis === 'h' ? -1 : 1;
        return a.axis === 'h' ? b.value - a.value : a.value - b.value;
    });
}

/** Turns a guide by 90°: same value, clamped to the face along the new direction. */
export function flipGuide<T extends StoredGuide>(g: T, wall: Rect): T {
    const axis: GuideAxis = g.axis === 'h' ? 'v' : 'h';
    return { ...g, axis, value: clampGuideValue(axis, g.value, wall) };
}

const SAME_GUIDE_M = 0.0005;

export function hasGuideAt(guides: StoredGuide[], axis: GuideAxis, value: number): boolean {
    return guides.some((g) => g.axis === axis && Math.abs(g.value - value) <= SAME_GUIDE_M);
}

/** Value for a guide added from the menu: the middle of the visible area, whole cm, on the face. */
export function newGuideValue(axis: GuideAxis, viewCenter: { u: number; v: number }, wall: Rect): number {
    const raw = wallToGuideValue(axis, axis === 'h' ? viewCenter.v : viewCenter.u, wall);
    return Math.round(clampGuideValue(axis, raw, wall) * 100) / 100;
}

/** Stored form: no ids, faces without guides left out. */
export function serializeGuides(byFace: Record<string, readonly StoredGuide[]>): WallGuides {
    const out: WallGuides = {};
    for (const [key, guides] of Object.entries(byFace)) {
        if (guides.length > 0) out[key] = guides.map((g) => ({ axis: g.axis, value: g.value }));
    }
    return out;
}

const wallPrefix = (wallId: number) => `wall:${wallId}:`;

/** Moves the entries of a wall to its new id (a temporary wall got its database id). */
export function renameWallKeys<T>(byFace: Record<string, T>, from: number, to: number): Record<string, T> {
    const prefix = wallPrefix(from);
    if (!Object.keys(byFace).some((key) => key.startsWith(prefix))) return byFace;
    return Object.fromEntries(Object.entries(byFace).map(([key, value]) => [
        key.startsWith(prefix) ? wallPrefix(to) + key.slice(prefix.length) : key,
        value,
    ]));
}

/** Removes the entries of all faces of a deleted wall. */
export function dropWallKeys<T>(byFace: Record<string, T>, wallId: number): Record<string, T> {
    const prefix = wallPrefix(wallId);
    if (!Object.keys(byFace).some((key) => key.startsWith(prefix))) return byFace;
    return Object.fromEntries(Object.entries(byFace).filter(([key]) => !key.startsWith(prefix)));
}
```

- [ ] **Step 6: Tests laufen lassen, müssen bestehen**

Run: `npm run test`
Expected: PASS, 1 Datei, alle Tests grün.

- [ ] **Step 7: Lint, Typen, Commit**

Run: `npm run lint && npx tsc -b`
Expected: keine Fehler.

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.node.json src/lib/wallEditor/guides.ts src/lib/wallEditor/guides.test.ts
git commit -m "$(cat <<'EOF'
test: vitest for pure client logic and ruler guide helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: DB-Spalten und Server-Logik für Wand-Layouts

**Files:**
- Modify: `server/prisma/schema.prisma` (Modell `ExhibitionVersion`)
- Create: `server/prisma/migrations/20260927120000_wall_layout/migration.sql`
- Create: `server/src/lib/wallGuides.ts`
- Test: `server/src/tests/wallGuides.test.ts`

**Interfaces:**
- Produces (`server/src/lib/wallGuides.ts`):
  - `DEFAULT_HANGING_HEIGHT = 1.45`, `MAX_GUIDES_PER_FACE = 200`
  - `hangingHeightSchema`, `wallGuidesSchema`, `wallLayoutPatchSchema` (Zod)
  - `type WallGuides = Record<string, { axis: 'h' | 'v'; value: number }[]>`
  - `parseWallGuides(json: unknown): WallGuides`
  - `guidesToIndexKeys(guides: WallGuides, wallIdToIndex: Map<number, number>): WallGuides`
  - `guidesFromIndexKeys(guides: WallGuides, newWallIds: number[]): WallGuides`
  - `remapWallGuides(guides: WallGuides, wallIdToIndex: Map<number, number>, newWallIds: number[]): WallGuides`
  - `dropWallGuides(guides: WallGuides, wallId: number): WallGuides` (gleiches Objekt, wenn nichts entfernt)
- Prisma: `ExhibitionVersion.hanging_height: number`, `ExhibitionVersion.wall_guides: Prisma.JsonValue | null`

- [ ] **Step 1: Failing test schreiben**

`server/src/tests/wallGuides.test.ts`:

```ts
import {
    MAX_GUIDES_PER_FACE,
    dropWallGuides,
    guidesFromIndexKeys,
    guidesToIndexKeys,
    parseWallGuides,
    remapWallGuides,
    wallLayoutPatchSchema,
    type WallGuides,
} from '../lib/wallGuides';

const h = (value: number) => ({ axis: 'h' as const, value });
const v = (value: number) => ({ axis: 'v' as const, value });

describe('wall guide keys across version copies', () => {
    const guides: WallGuides = {
        'wall:11:front': [h(1.45)],
        'wall:12:left': [v(0.05)],
        'wall:99:back': [v(1)], // wall is not part of the copy
        'room:satellit:0': [v(2)],
    };
    const wallIdToIndex = new Map([[11, 0], [12, 1]]);

    it('turns wall ids into positions and drops walls that are not copied', () => {
        expect(guidesToIndexKeys(guides, wallIdToIndex)).toEqual({
            'wallIndex:0:front': [h(1.45)],
            'wallIndex:1:left': [v(0.05)],
            'room:satellit:0': [v(2)],
        });
    });

    it('turns positions into the new wall ids', () => {
        expect(guidesFromIndexKeys({
            'wallIndex:0:front': [h(1.45)],
            'wallIndex:5:back': [v(1)], // out of range
            'wall:11:front': [h(2)], // stale wall key
            'room:satellit:0': [v(2)],
        }, [21, 22])).toEqual({
            'wall:21:front': [h(1.45)],
            'room:satellit:0': [v(2)],
        });
    });

    it('remaps in one go, also temporary negative ids', () => {
        expect(remapWallGuides({ 'wall:-1:front': [h(1)] }, new Map([[-1, 0]]), [30]))
            .toEqual({ 'wall:30:front': [h(1)] });
    });
});

describe('dropWallGuides', () => {
    it('removes all faces of a wall and nothing else', () => {
        const guides: WallGuides = { 'wall:1:front': [h(1)], 'wall:1:back': [h(2)], 'wall:12:front': [h(3)] };
        expect(dropWallGuides(guides, 1)).toEqual({ 'wall:12:front': [h(3)] });
    });

    it('returns the same object when the wall had no guides', () => {
        const guides: WallGuides = { 'wall:12:front': [h(3)] };
        expect(dropWallGuides(guides, 1)).toBe(guides);
    });
});

describe('parseWallGuides', () => {
    it('reads stored JSON and treats null or broken data as empty', () => {
        expect(parseWallGuides({ 'wall:1:front': [h(1)] })).toEqual({ 'wall:1:front': [h(1)] });
        expect(parseWallGuides(null)).toEqual({});
        expect(parseWallGuides({ 'wall:1:front': [{ axis: 'x', value: 1 }] })).toEqual({});
    });
});

describe('wallLayoutPatchSchema', () => {
    it('accepts a hanging height and guides, also left of the wall', () => {
        expect(wallLayoutPatchSchema.parse({ hangingHeight: 1.45, guides: { 'wall:1:front': [v(-0.5)] } }))
            .toEqual({ hangingHeight: 1.45, guides: { 'wall:1:front': [v(-0.5)] } });
    });

    it('rejects heights outside 1 cm … 9.99 m', () => {
        expect(() => wallLayoutPatchSchema.parse({ hangingHeight: 0 })).toThrow();
        expect(() => wallLayoutPatchSchema.parse({ hangingHeight: 10 })).toThrow();
    });

    it('rejects unknown axes, far-away values and too many guides', () => {
        expect(() => wallLayoutPatchSchema.parse({ guides: { a: [{ axis: 'x', value: 1 }] } })).toThrow();
        expect(() => wallLayoutPatchSchema.parse({ guides: { a: [v(101)] } })).toThrow();
        const many = Array.from({ length: MAX_GUIDES_PER_FACE + 1 }, (_, i) => v(i / 100));
        expect(() => wallLayoutPatchSchema.parse({ guides: { a: many } })).toThrow();
    });
});
```

- [ ] **Step 2: Test laufen lassen, muss scheitern**

Run: `cd server && npx jest src/tests/wallGuides.test.ts`
Expected: FAIL — `Cannot find module '../lib/wallGuides'`.

- [ ] **Step 3: Implementieren**

`server/src/lib/wallGuides.ts`:

```ts
import { z } from 'zod';

/**
 * Hanging height and ruler guides of the 2D wall editor, stored per exhibition version
 * (ExhibitionVersion.hanging_height / wall_guides). Guides are keyed by the client's face key:
 * `wall:<wallId>:<side>` for modular walls, the room face id (`room:…`) for walls of the room.
 * Wall ids change whenever a version is copied, so the keys are rewritten on the way
 * (old id → position in the copied wall list → new id). Mirrors src/lib/wallEditor/guides.ts.
 */

export const DEFAULT_HANGING_HEIGHT = 1.45;
export const MAX_GUIDES_PER_FACE = 200;

export const guideSchema = z.object({
    axis: z.enum(['h', 'v']),
    // Guides may lie outside the wall face.
    value: z.number().min(-100).max(100),
});
export const wallGuidesSchema = z.record(z.string().min(1).max(200), z.array(guideSchema).max(MAX_GUIDES_PER_FACE));
export const hangingHeightSchema = z.number().min(0.01).max(9.99);
export const wallLayoutPatchSchema = z.object({
    hangingHeight: hangingHeightSchema.optional(),
    guides: wallGuidesSchema.optional(),
});

export type WallGuides = z.infer<typeof wallGuidesSchema>;

const WALL_KEY = /^wall:(-?\d+):(front|back|left|right)$/;
const INDEX_KEY = /^wallIndex:(\d+):(front|back|left|right)$/;

/** Stored JSON → guides; null or invalid data counts as no guides. */
export function parseWallGuides(json: unknown): WallGuides {
    const parsed = wallGuidesSchema.safeParse(json ?? {});
    return parsed.success ? parsed.data : {};
}

/** `wall:<id>:<side>` → `wallIndex:<i>:<side>`. Walls missing from the map are dropped, other keys kept. */
export function guidesToIndexKeys(guides: WallGuides, wallIdToIndex: Map<number, number>): WallGuides {
    const out: WallGuides = {};
    for (const [key, list] of Object.entries(guides)) {
        const match = WALL_KEY.exec(key);
        if (!match) {
            out[key] = list;
            continue;
        }
        const index = wallIdToIndex.get(Number(match[1]));
        if (index !== undefined) out[`wallIndex:${index}:${match[2]}`] = list;
    }
    return out;
}

/** `wallIndex:<i>:<side>` → `wall:<newWallIds[i]>:<side>`. Unknown positions and leftover wall keys are dropped. */
export function guidesFromIndexKeys(guides: WallGuides, newWallIds: number[]): WallGuides {
    const out: WallGuides = {};
    for (const [key, list] of Object.entries(guides)) {
        if (WALL_KEY.test(key)) continue;
        const match = INDEX_KEY.exec(key);
        if (!match) {
            out[key] = list;
            continue;
        }
        const id = newWallIds[Number(match[1])];
        if (id !== undefined) out[`wall:${id}:${match[2]}`] = list;
    }
    return out;
}

/** Guides of a version whose walls were copied: old wall ids → positions → new wall ids. */
export function remapWallGuides(guides: WallGuides, wallIdToIndex: Map<number, number>, newWallIds: number[]): WallGuides {
    return guidesFromIndexKeys(guidesToIndexKeys(guides, wallIdToIndex), newWallIds);
}

/** Removes the guides of all faces of a deleted wall (the same object if it had none). */
export function dropWallGuides(guides: WallGuides, wallId: number): WallGuides {
    const prefix = `wall:${wallId}:`;
    if (!Object.keys(guides).some((key) => key.startsWith(prefix))) return guides;
    return Object.fromEntries(Object.entries(guides).filter(([key]) => !key.startsWith(prefix)));
}
```

- [ ] **Step 4: Test laufen lassen, muss bestehen**

Run: `cd server && npx jest src/tests/wallGuides.test.ts`
Expected: PASS.

- [ ] **Step 5: Schema und Migration**

In `server/prisma/schema.prisma` im Modell `ExhibitionVersion` direkt unter `data                Json?` einfügen:

```prisma

  // 2D wall editor: picture-centre height above the floor (metres) and ruler guides per wall
  // face ({ "<faceKey>": [{ axis: 'h' | 'v', value }] }, see src/lib/wallGuides.ts).
  hanging_height      Float      @default(1.45)
  wall_guides         Json?
```

`server/prisma/migrations/20260927120000_wall_layout/migration.sql`:

```sql
-- WALL-EDITOR: hanging height (picture centre above the floor, metres) and ruler guides per
-- wall face, stored with each exhibition version.
ALTER TABLE `ExhibitionVersion`
    ADD COLUMN `hanging_height` DOUBLE NOT NULL DEFAULT 1.45,
    ADD COLUMN `wall_guides` JSON NULL;
```

Run: `cd server && npx prisma migrate dev`
Expected: „The following migration(s) have been applied: 20260927120000_wall_layout" und neu generierter Client. Ohne laufende DB: `npx prisma generate` ausführen und im Commit vermerken, dass die Migration noch angewendet werden muss.

- [ ] **Step 6: Build, alle Server-Tests, Commit**

Run: `cd server && npm run build && npm test`
Expected: Build ohne Fehler, alle Tests grün.

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260927120000_wall_layout server/src/lib/wallGuides.ts server/src/tests/wallGuides.test.ts
git commit -m "$(cat <<'EOF'
feat: store hanging height and ruler guides per exhibition version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Server-Routen für Wand-Layouts

**Files:**
- Modify: `server/src/routes/versions.ts`
- Modify: `server/src/routes/walls.ts`

**Interfaces:**
- Consumes: alles aus `server/src/lib/wallGuides.ts` (Task 2)
- Produces (HTTP):
  - `GET /exhibitions/:eid/versions/:vid/wall-layout` → `200 { hangingHeight: number, guides: WallGuides }`, `404` ohne Zugriff
  - `PATCH /exhibitions/:eid/versions/:vid/wall-layout`, Body `{ hangingHeight?: number, guides?: WallGuides }` → `200 { hangingHeight, guides }`, `400` bei Zod-Fehlern, `404` ohne Zugriff
  - `POST /exhibitions/:eid/versions` akzeptiert zusätzlich `hangingHeight?`, `wallGuides?` und `walls[].id?`

- [ ] **Step 1: Imports und Schema in `versions.ts`**

Nach der Zeile `import { DEFAULT_FRAME_STYLE, … } from '../lib/frameStyles';` einfügen:

```ts
import {
    DEFAULT_HANGING_HEIGHT,
    hangingHeightSchema,
    parseWallGuides,
    remapWallGuides,
    wallGuidesSchema,
    wallLayoutPatchSchema,
    type WallGuides,
} from '../lib/wallGuides';
```

In `createVersionSchema` nach `sourceVersionId: z.number().optional(), // …` einfügen:

```ts
    // 2D wall editor layout; wallGuides keys use the `id` of the walls below.
    hangingHeight: hangingHeightSchema.optional(),
    wallGuides: wallGuidesSchema.optional(),
```

Im `walls: z.array(z.object({` als erstes Feld (vor `label:`) einfügen:

```ts
        id: z.number().optional(), // the client's wall id (maybe temporary), maps wallGuides keys
```

- [ ] **Step 2: GET und PATCH `wall-layout`**

Direkt nach dem Handler `// GET /exhibitions/:exhibitionId/versions/:versionId — get a specific version …` (also vor `// POST /exhibitions/:exhibitionId/versions — create a new version`) einfügen:

```ts
// A version's wall layout, if the user may access its exhibition.
function findVersionLayout(req: Request, exhibitionId: number, versionId: number) {
    const isAdmin = req.user!.role === 'admin';
    return prisma.exhibitionVersion.findFirst({
        where: {
            id: versionId,
            exhibition_id: exhibitionId,
            exhibition: exhibitionAccessFilter(req.user!.userId, isAdmin),
        },
        select: { id: true, hanging_height: true, wall_guides: true },
    });
}

// GET /exhibitions/:exhibitionId/versions/:versionId/wall-layout — hanging height and ruler guides
versionsRouter.get('/exhibitions/:exhibitionId/versions/:versionId/wall-layout', authenticate, async (req: Request, res) => {
    try {
        const exhibitionId = parseInt(req.params.exhibitionId, 10);
        const versionId = parseInt(req.params.versionId, 10);
        if (isNaN(exhibitionId) || isNaN(versionId)) return res.status(400).json({ error: 'Invalid ID' });

        const version = await findVersionLayout(req, exhibitionId, versionId);
        if (!version) return res.status(404).json({ error: 'Version not found' });
        res.json({ hangingHeight: version.hanging_height, guides: parseWallGuides(version.wall_guides) });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch wall layout' });
    }
});

// PATCH /exhibitions/:exhibitionId/versions/:versionId/wall-layout — replaces the given fields
versionsRouter.patch('/exhibitions/:exhibitionId/versions/:versionId/wall-layout', authenticate, async (req: Request, res) => {
    try {
        const exhibitionId = parseInt(req.params.exhibitionId, 10);
        const versionId = parseInt(req.params.versionId, 10);
        if (isNaN(exhibitionId) || isNaN(versionId)) return res.status(400).json({ error: 'Invalid ID' });

        const data = wallLayoutPatchSchema.parse(req.body);
        const version = await findVersionLayout(req, exhibitionId, versionId);
        if (!version) return res.status(404).json({ error: 'Version not found' });

        const updated = await prisma.exhibitionVersion.update({
            where: { id: versionId },
            data: {
                ...(data.hangingHeight !== undefined ? { hanging_height: data.hangingHeight } : {}),
                ...(data.guides !== undefined ? { wall_guides: data.guides as Prisma.InputJsonValue } : {}),
            },
            select: { hanging_height: true, wall_guides: true },
        });
        res.json({ hangingHeight: updated.hanging_height, guides: parseWallGuides(updated.wall_guides) });
    } catch (e) {
        console.error(e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: e.issues });
        }
        res.status(500).json({ error: 'Failed to save wall layout' });
    }
});
```

- [ ] **Step 3: Layout beim Versionsspeichern (POST) mitkopieren**

Im POST-Handler direkt nach dem Block, der `sourceVersionId` bestimmt (endet mit `sourceVersionId = latestVersion?.id;` und `}`), einfügen:

```ts

        // Hanging height and ruler guides travel with the snapshot (lib/wallGuides.ts).
        const sourceLayout = sourceVersionId
            ? await prisma.exhibitionVersion.findUnique({
                where: { id: sourceVersionId },
                select: { hanging_height: true, wall_guides: true },
            })
            : null;
        const hangingHeight = data.hangingHeight ?? sourceLayout?.hanging_height ?? DEFAULT_HANGING_HEIGHT;
        const sourceGuides: WallGuides = data.wallGuides ?? parseWallGuides(sourceLayout?.wall_guides);
        // Old wall id → position in wallsToCreate; set where the walls are chosen below.
        let guideWallIndex = new Map<number, number>();
```

Im Abschnitt `// Prepare walls to create`:
- im Zweig `if (data.walls) {` direkt nach der Zuweisung `wallsToCreate = data.walls.map(w => ({ … }));` einfügen:

```ts
            guideWallIndex = new Map(
                data.walls.flatMap((w, i): [number, number][] => (w.id != null ? [[w.id, i]] : [])),
            );
```

- im Zweig `} else if (sourceVersionId) {` direkt nach `wallsToCreate = sourceWalls.map(w => ({ … }));` einfügen:

```ts
            guideWallIndex = new Map(sourceWalls.map((w, i) => [w.id, i]));
```

In der Transaktion im `tx.exhibitionVersion.create({ data: { … } })` nach `is_published: false,` einfügen:

```ts
                    hanging_height: hangingHeight,
```

Direkt nach `const newWallIds = version.walls.map(w => w.id); // walls created in order` einfügen:

```ts

            // 2b. Guides follow their walls to the new ids
            await tx.exhibitionVersion.update({
                where: { id: version.id },
                data: { wall_guides: remapWallGuides(sourceGuides, guideWallIndex, newWallIds) as Prisma.InputJsonValue },
            });
```

- [ ] **Step 4: Layout beim Merge mitkopieren**

Im Merge-Handler im `tx.exhibitionVersion.create({ data: { … } })` nach `is_published: false,` einfügen:

```ts
                    hanging_height: sourceVersion.hanging_height,
```

Direkt nach `const newWallIds = version.walls.map(w => w.id);` (im Merge-Handler) einfügen:

```ts
            await tx.exhibitionVersion.update({
                where: { id: version.id },
                data: {
                    wall_guides: remapWallGuides(parseWallGuides(sourceVersion.wall_guides), oldWallIdToIndex, newWallIds) as Prisma.InputJsonValue,
                },
            });
```

- [ ] **Step 5: Guides beim Löschen einer Wand entfernen (`walls.ts`)**

Imports ändern:

```ts
import { PrismaClient, type Prisma } from '@prisma/client';
```

und nach `import { idempotency } from '../lib/idempotency';` einfügen:

```ts
import { dropWallGuides, parseWallGuides } from '../lib/wallGuides';
```

Im `DELETE /:id`-Handler direkt nach `await prisma.modularWall.delete({ where: { id: wallId } });` einfügen:

```ts

        // The deleted wall's ruler guides go with it (lib/wallGuides.ts).
        const version = await prisma.exhibitionVersion.findUnique({
            where: { id: existing.versionId },
            select: { wall_guides: true },
        });
        const guides = parseWallGuides(version?.wall_guides);
        const remaining = dropWallGuides(guides, wallId);
        if (remaining !== guides) {
            await prisma.exhibitionVersion.update({
                where: { id: existing.versionId },
                data: { wall_guides: remaining as Prisma.InputJsonValue },
            });
        }
```

- [ ] **Step 6: Build und Tests**

Run: `cd server && npm run build && npm test`
Expected: kein TypeScript-Fehler, alle Tests grün.

- [ ] **Step 7: Smoke-Test der Routen**

Backend starten (`cd server && npm run dev`). Im Browser (eingeloggt, Editor offen) in der Konsole:

```js
const { state } = JSON.parse(localStorage.getItem('curahub-auth'));
const url = (e, v) => `/api/exhibitions/${e}/versions/${v}/wall-layout`;
```

Dann mit den IDs der offenen Ausstellung/Version (Network-Tab: `/api/walls?versionId=…`) `fetch(url(E, V), { headers: { Authorization: 'Bearer ' + state.token } }).then(r => r.json())`.
Expected: `{ hangingHeight: 1.45, guides: {} }`. Ein `PATCH` mit `{ "hangingHeight": 1.4 }` gibt `{ hangingHeight: 1.4, guides: {} }` zurück; ein `PATCH` mit `{ "hangingHeight": 20 }` gibt `400`. Danach wieder auf `1.45` setzen.

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/versions.ts server/src/routes/walls.ts
git commit -m "$(cat <<'EOF'
feat: wall layout endpoints and guide keys that follow copied walls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Hilfslinien pro Wandseite, richtig herum

**Files:**
- Create: `src/lib/wallEvents.ts`
- Modify: `src/store/editorStore.ts` (Import, `deleteWall`, Wand-Sync)
- Modify: `src/store/wallEditorViewStore.ts`
- Modify: `src/components/wall-editor/WallEditorRulers.tsx`
- Modify: `src/components/wall-editor/WallEditorOverlay.tsx`

**Interfaces:**
- Consumes: `guides.ts` aus Task 1
- Produces:
  - `src/lib/wallEvents.ts`: `type WallEvent = { type: 'replaced'; from: number; to: number } | { type: 'deleted'; id: number }`, `onWallEvent(listener): () => void`, `emitWallEvent(event): void`
  - `wallEditorViewStore`: `interface RulerGuide extends StoredGuide { id: number }`, `EMPTY_GUIDES`, State `hangingHeight`, `guidesByFace: Record<string, RulerGuide[]>`, `guidesHidden`, `guidesLocked`, `hoverGuideId: number | null`; Actions `setHangingHeight(m)`, `addGuide(faceKey, axis, value): number`, `updateGuide(faceKey, id, patch: Partial<StoredGuide>)`, `removeGuide(faceKey, id)`, `setFaceGuides(faceKey, guides)`, `toggleGuidesHidden()`, `toggleGuidesLocked()`, `setHoverGuide(id | null)`, `loadWallLayout(layout: WallLayout)`, `renameWallGuides(from, to)`, `dropWallGuides(wallId)`, `resetForWall()`
  - `WallEditorRulers`: Props `guides: RulerGuideMark[]` mit `interface RulerGuideMark { id: number; axis: GuideAxis; pos: number }` und `onRulerPointerDown: (ruler: 'top' | 'left', e: React.PointerEvent) => void`

- [ ] **Step 1: `src/lib/wallEvents.ts`**

```ts
/**
 * Wall lifecycle events for code outside editorStore that keys data by wall id (ruler guides,
 * see lib/wallEditor/layoutSync.ts). No imports, so editorStore can use it without a cycle.
 */
export type WallEvent =
    | { type: 'replaced'; from: number; to: number }
    | { type: 'deleted'; id: number };

type Listener = (event: WallEvent) => void;

const listeners = new Set<Listener>();

export function onWallEvent(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function emitWallEvent(event: WallEvent): void {
    listeners.forEach((listener) => listener(event));
}
```

- [ ] **Step 2: Events in `editorStore.ts` auslösen**

Nach `import { DEFAULT_FRAME_STYLE, frameStyleOf, … } from '../lib/frameStyles';` einfügen:

```ts
import { emitWallEvent } from '../lib/wallEvents';
```

`deleteWall` ersetzen durch:

```ts
  deleteWall: (id) => {
    localEditSeq++;
    set((state) => ({
      localWalls: state.localWalls.filter(w => w.id !== id),
      // Detach artworks from deleted wall
      localInstances: state.localInstances.map(inst =>
        inst.wallId === id ? { ...inst, wallId: null } : inst
      ),
      selectedWallId: state.selectedWallId === id ? null : state.selectedWallId,
      ...(state.wallEditor?.kind === 'wall' && state.wallEditor.wallId === id ? { wallEditor: null, wallEditorSelection: [] } : {}),
      hasUnsavedChanges: true,
    }));
    emitWallEvent({ type: 'deleted', id });
  },
```

Im Wand-Sync (Block `// New walls (temp negative IDs) → POST`) direkt vor `const current = useEditorStore.getState();` (nach `const created = await res.json();`) einfügen:

```ts
          // Before the store update, so data keyed by the temp id moves along (ruler guides).
          emitWallEvent({ type: 'replaced', from: wall.id, to: created.id });
```

- [ ] **Step 3: `wallEditorViewStore.ts` umbauen**

Imports oben ersetzen durch:

```ts
import { create } from 'zustand';
import type { Rect } from '../lib/wallEditor/layout';
import type { RoomFace } from '../lib/wallEditor/roomFaces';
import {
    DEFAULT_HANGING_HEIGHT,
    MAX_HANGING_HEIGHT,
    MIN_HANGING_HEIGHT,
    dropWallKeys,
    renameWallKeys,
    type GuideAxis,
    type StoredGuide,
    type WallLayout,
} from '../lib/wallEditor/guides';
```

`RulerGuide` ersetzen durch:

```ts
export interface RulerGuide extends StoredGuide {
    id: number;
}

/** Stable empty list for selectors (a fresh [] per call would re-render forever). */
export const EMPTY_GUIDES: RulerGuide[] = [];
```

Den Block von `const HANGING_HEIGHT_KEY = …` bis einschließlich `readHangingHeight` ersetzen durch:

```ts
const GUIDES_VIEW_KEY = 'curahub-wall-guides-view';

interface GuidesView {
    hidden: boolean;
    locked: boolean;
}

const readGuidesView = (): GuidesView => {
    try {
        const raw = window.localStorage.getItem(GUIDES_VIEW_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
            const { hidden, locked } = parsed as Record<string, unknown>;
            return { hidden: hidden === true, locked: locked === true };
        }
    } catch {
        // storage unavailable or broken — fall back to the defaults
    }
    return { hidden: false, locked: false };
};

const storeGuidesView = (view: GuidesView) => {
    try {
        window.localStorage.setItem(GUIDES_VIEW_KEY, JSON.stringify(view));
    } catch {
        // storage unavailable — keep the setting for this session only
    }
};

const initialGuidesView = readGuidesView();
```

Im `interface WallEditorViewState`:
- Kommentar der Hängehöhe ändern zu `/** Height of the picture centres above the floor (metres), stored per exhibition version. */`
- `guides: RulerGuide[];` ersetzen durch:

```ts
    /** Ruler guides per wall face (key: targetKey of the face), stored per exhibition version. */
    guidesByFace: Record<string, RulerGuide[]>;
    /** Hidden guides are neither drawn nor snapped to (per browser). */
    guidesHidden: boolean;
    /** Locked guides and the hanging line can't be grabbed in the canvas (per browser). */
    guidesLocked: boolean;
    /** Guide highlighted by hovering it in the canvas or in the guides tab. */
    hoverGuideId: number | null;
```

- die Guide-Actions (`addGuide`, `moveGuide`, `removeGuide`, `resetForWall`) ersetzen durch:

```ts
    addGuide: (faceKey: string, axis: GuideAxis, value: number) => number;
    updateGuide: (faceKey: string, id: number, patch: Partial<StoredGuide>) => void;
    removeGuide: (faceKey: string, id: number) => void;
    setFaceGuides: (faceKey: string, guides: RulerGuide[]) => void;
    toggleGuidesHidden: () => void;
    toggleGuidesLocked: () => void;
    setHoverGuide: (id: number | null) => void;
    /** Replaces hanging height and guides with a version's stored layout. */
    loadWallLayout: (layout: WallLayout) => void;
    /** A temporary wall got its database id. */
    renameWallGuides: (fromWallId: number, toWallId: number) => void;
    dropWallGuides: (wallId: number) => void;
    /** Clears per-wall view state (measurements) when another wall/side is opened. */
    resetForWall: () => void;
```

Im `create(…)`-Objekt:
- `hangingHeight: readHangingHeight(),` → `hangingHeight: DEFAULT_HANGING_HEIGHT,`
- `guides: [],` ersetzen durch:

```ts
    guidesByFace: {},
    guidesHidden: initialGuidesView.hidden,
    guidesLocked: initialGuidesView.locked,
    hoverGuideId: null,
```

- `setHangingHeight` ersetzen durch:

```ts
    setHangingHeight: (metres) => set({ hangingHeight: Math.min(MAX_HANGING_HEIGHT, Math.max(MIN_HANGING_HEIGHT, metres)) }),
```

- die Implementierungen von `addGuide`, `moveGuide`, `removeGuide`, `resetForWall` ersetzen durch:

```ts
    addGuide: (faceKey, axis, value) => {
        const id = nextId++;
        const { guidesHidden, guidesLocked } = get();
        // A new guide is always visible, also when the guides were hidden.
        if (guidesHidden) storeGuidesView({ hidden: false, locked: guidesLocked });
        set((s) => ({
            guidesByFace: { ...s.guidesByFace, [faceKey]: [...(s.guidesByFace[faceKey] ?? []), { id, axis, value }] },
            guidesHidden: false,
        }));
        return id;
    },
    updateGuide: (faceKey, id, patch) => set((s) => {
        const list = s.guidesByFace[faceKey];
        if (!list) return s;
        return { guidesByFace: { ...s.guidesByFace, [faceKey]: list.map((g) => (g.id === id ? { ...g, ...patch } : g)) } };
    }),
    removeGuide: (faceKey, id) => set((s) => {
        const list = s.guidesByFace[faceKey];
        if (!list) return s;
        return {
            guidesByFace: { ...s.guidesByFace, [faceKey]: list.filter((g) => g.id !== id) },
            hoverGuideId: s.hoverGuideId === id ? null : s.hoverGuideId,
        };
    }),
    setFaceGuides: (faceKey, guides) => set((s) => ({ guidesByFace: { ...s.guidesByFace, [faceKey]: guides } })),
    toggleGuidesHidden: () => set((s) => {
        storeGuidesView({ hidden: !s.guidesHidden, locked: s.guidesLocked });
        return { guidesHidden: !s.guidesHidden };
    }),
    toggleGuidesLocked: () => set((s) => {
        storeGuidesView({ hidden: s.guidesHidden, locked: !s.guidesLocked });
        return { guidesLocked: !s.guidesLocked };
    }),
    setHoverGuide: (id) => {
        if (get().hoverGuideId !== id) set({ hoverGuideId: id });
    },
    loadWallLayout: (layout) => set({
        hangingHeight: layout.hangingHeight,
        guidesByFace: Object.fromEntries(Object.entries(layout.guides).map(([key, list]) => [
            key,
            list.map((g) => ({ id: nextId++, axis: g.axis, value: g.value })),
        ])),
        hoverGuideId: null,
    }),
    renameWallGuides: (fromWallId, toWallId) => set((s) => {
        const guidesByFace = renameWallKeys(s.guidesByFace, fromWallId, toWallId);
        return guidesByFace === s.guidesByFace ? s : { guidesByFace };
    }),
    dropWallGuides: (wallId) => set((s) => {
        const guidesByFace = dropWallKeys(s.guidesByFace, wallId);
        return guidesByFace === s.guidesByFace ? s : { guidesByFace };
    }),
    resetForWall: () => set({ measurements: [], hoverGuideId: null }),
```

- [ ] **Step 4: Lineale (`WallEditorRulers.tsx`)**

Import `import { RULER_SIZE, type RulerGuide, type ViewTransform } from '@/store/wallEditorViewStore';` ersetzen durch:

```ts
import { RULER_SIZE, type ViewTransform } from '@/store/wallEditorViewStore';
import type { GuideAxis } from '@/lib/wallEditor/guides';
```

Vor `interface RulersProps` einfügen:

```ts
export interface RulerGuideMark {
    id: number;
    axis: GuideAxis;
    /** Wall coordinate: u for vertical guides, v for horizontal ones. */
    pos: number;
}
```

In `RulersProps`:

```ts
    guides: RulerGuideMark[];
    /** Top ruler → horizontal guide, left ruler → vertical guide (like Photoshop/Figma). */
    onRulerPointerDown: (ruler: 'top' | 'left', e: React.PointerEvent) => void;
```

Den Doc-Kommentar über `export const WallEditorRulers` ändern zu:
`/** Rulers along the top (cm from the wall's left edge) and left side (cm above the floor). Dragging out of the top ruler creates a horizontal guide, out of the left one a vertical guide. */`

Obere Lineal-Gruppe: `onPointerDown={(e) => onRulerPointerDown('x', e)}` → `onPointerDown={(e) => onRulerPointerDown('top', e)}`, und die Marker:

```tsx
                {guides.filter((g) => g.axis === 'v').map((g) => (
                    <path key={g.id} d={`M ${vt.toScreenX(g.pos) - 4} ${R - 6} L ${vt.toScreenX(g.pos) + 4} ${R - 6} L ${vt.toScreenX(g.pos)} ${R} Z`} fill={WE_COLORS.guide} />
                ))}
```

Linke Lineal-Gruppe: `onRulerPointerDown('y', e)` → `onRulerPointerDown('left', e)`, und die Marker:

```tsx
                {guides.filter((g) => g.axis === 'h').map((g) => (
                    <path key={g.id} d={`M ${left + R - 6} ${vt.toScreenY(g.pos) - 4} L ${left + R - 6} ${vt.toScreenY(g.pos) + 4} L ${left + R} ${vt.toScreenY(g.pos)} Z`} fill={WE_COLORS.guide} />
                ))}
```

- [ ] **Step 5: Overlay (`WallEditorOverlay.tsx`) auf Hilfslinien pro Seite umstellen**

a) Import des View-Stores ersetzen und Guides-Import ergänzen:

```ts
import {
    EMPTY_GUIDES,
    makeViewTransform,
    RULER_SIZE,
    useWallEditorView,
    type WallEditorTool,
} from '@/store/wallEditorViewStore';
import { guideToWall, wallToGuideValue, type GuideAxis } from '@/lib/wallEditor/guides';
```

b) In `type Interaction`: `| { kind: 'guide'; pointerId: number; id: number; axis: Axis; overRuler: boolean }` → `axis: GuideAxis`.

c) Im `useShallow`-Selektor `guides: s.guides,` ersetzen durch:

```ts
        guidesHidden: s.guidesHidden,
        guidesLocked: s.guidesLocked,
        hoverGuideId: s.hoverGuideId,
```

und direkt nach dem Selektor (nach `})));`) einfügen:

```ts
    const guides = useWallEditorView((s) => s.guidesByFace[face.key] ?? EMPTY_GUIDES);
```

d) Zeile `const [hoverGuide, setHoverGuide] = useState<number | null>(null);` löschen.

e) Die vier Zeilen ab `const guidesX = view.guides.filter(…)` bis `if (view.showHangingLine) guidesY.push(hangY);` ersetzen durch:

```ts
    const visibleGuides = view.guidesHidden ? EMPTY_GUIDES : guides;
    const guidesX = visibleGuides.filter((g) => g.axis === 'v').map((g) => guideToWall(g, wallRect));
    const guidesY = visibleGuides.filter((g) => g.axis === 'h').map((g) => guideToWall(g, wallRect));
    const hangY = wallRect.y + view.hangingHeight;
    if (view.showHangingLine) guidesY.push(hangY);
```

f) `hitGuide`, `isOverRuler` und `snapGuideValue` ersetzen durch:

```ts
    const hitGuide = (x: number, y: number) => {
        if (view.guidesLocked) return null;
        return visibleGuides.find((g) => (
            g.axis === 'v'
                ? Math.abs(vt.toScreenX(guideToWall(g, wallRect)) - x) <= GUIDE_HIT_PX && y > RULER_SIZE
                : Math.abs(vt.toScreenY(guideToWall(g, wallRect)) - y) <= GUIDE_HIT_PX && x > rulerLeft + RULER_SIZE
        )) ?? null;
    };
    // Horizontal guides come out of (and go back into) the top ruler, vertical ones the left ruler.
    const isOverRuler = (axis: GuideAxis, x: number, y: number) => (axis === 'h'
        ? y < RULER_SIZE
        : x > rulerLeft - 8 && x < rulerLeft + RULER_SIZE);

    /** Snaps a guide position (wall coordinates) to the wall's edges and centre and to artwork edges. */
    const snapGuideValue = (axis: GuideAxis, value: number) => {
        if (!view.snapping) return roundMm(value);
        const threshold = SNAP_PX / vt.pxPerM;
        const candidates = axis === 'v'
            ? [wallRect.x, centerX(wallRect), right(wallRect), ...items.flatMap((i) => [i.rect.x, centerX(i.rect), right(i.rect)])]
            : [wallRect.y, top(wallRect), ...items.flatMap((i) => [i.rect.y, centerY(i.rect), top(i.rect)])];
        let best: number | null = null;
        for (const c of candidates) {
            if (Math.abs(c - value) <= threshold && (best === null || Math.abs(c - value) < Math.abs(best - value))) best = c;
        }
        return best ?? roundMm(value);
    };
```

g) `handleRulerPointerDown` ersetzen durch:

```ts
    const handleRulerPointerDown = (ruler: 'top' | 'left', e: React.PointerEvent) => {
        if (e.button !== 0 || interactionRef.current) return;
        e.stopPropagation();
        rootRef.current?.setPointerCapture(e.pointerId);
        const { x, y } = toLocal(e);
        const axis: GuideAxis = ruler === 'top' ? 'h' : 'v';
        const wallValue = axis === 'h' ? vt.toWallV(y) : vt.toWallU(x);
        const id = useWallEditorView.getState().addGuide(face.key, axis, roundMm(wallToGuideValue(axis, wallValue, wallRect)));
        setInter({ kind: 'guide', pointerId: e.pointerId, id, axis, overRuler: true });
    };
```

h) In `handlePointerMove` im Block `if (!it) { … }` die zwei Zeilen zu `guide`/`setHoverGuide` ersetzen durch:

```ts
            const guide = effectiveTool === 'select' && !hit ? hitGuide(x, y) : null;
            useWallEditorView.getState().setHoverGuide(guide?.id ?? null);
```

i) `case 'guide':` in `handlePointerMove` ersetzen durch:

```ts
            case 'guide': {
                const overRuler = isOverRuler(it.axis, x, y);
                const wallValue = snapGuideValue(it.axis, it.axis === 'v' ? u : v);
                useWallEditorView.getState().updateGuide(face.key, it.id, { value: roundMm(wallToGuideValue(it.axis, wallValue, wallRect)) });
                if (overRuler !== it.overRuler) setInter({ ...it, overRuler });
                return;
            }
```

j) In `handlePointerUp`: `if (it.overRuler) useWallEditorView.getState().removeGuide(it.id);` → `if (it.overRuler) useWallEditorView.getState().removeGuide(face.key, it.id);`

k) Cursor: `else if (interaction?.kind === 'guide') cursor = interaction.axis === 'x' ? 'col-resize' : 'row-resize';` → `… interaction.axis === 'v' ? 'col-resize' : 'row-resize';` und den Block `else if (hoverGuide !== null) { … }` ersetzen durch:

```ts
    else if (view.hoverGuideId !== null) {
        const g = guides.find((gg) => gg.id === view.hoverGuideId);
        if (g) cursor = g.axis === 'v' ? 'col-resize' : 'row-resize';
    }
```

l) `const draggedGuide = interaction?.kind === 'guide' ? view.guides.find(…) : null;` → `const draggedGuide = interaction?.kind === 'guide' ? guides.find((g) => g.id === interaction.id) ?? null : null;`

m) Im `onPointerLeave` den Block ersetzen:

```tsx
            onPointerLeave={() => {
                if (!interactionRef.current) {
                    setPointer(null);
                    setHoverId(null);
                    useWallEditorView.getState().setHoverGuide(null);
                }
            }}
```

n) Den Block `{/* Ruler guides */}` ersetzen durch:

```tsx
                {/* Ruler guides */}
                {visibleGuides.map((g) => {
                    const active = g.id === view.hoverGuideId || g.id === draggedGuide?.id;
                    const pos = guideToWall(g, wallRect);
                    return g.axis === 'v' ? (
                        <line key={g.id} x1={sx(pos)} x2={sx(pos)} y1={0} y2={H} stroke={WE_COLORS.guide} strokeWidth={active ? 1.5 : 1} opacity={active ? 1 : 0.75} pointerEvents="none" />
                    ) : (
                        <line key={g.id} x1={0} x2={W} y1={sy(pos)} y2={sy(pos)} stroke={WE_COLORS.guide} strokeWidth={active ? 1.5 : 1} opacity={active ? 1 : 0.75} pointerEvents="none" />
                    );
                })}
```

o) Props an `WallEditorRulers`: `guides={view.guides}` → 

```tsx
                        guides={visibleGuides.map((g) => ({ id: g.id, axis: g.axis, pos: guideToWall(g, wallRect) }))}
```

p) Den Block `{/* Value of the guide being dragged */}` ersetzen durch:

```tsx
                {/* Value of the guide being dragged */}
                {draggedGuide && (() => {
                    const pos = guideToWall(draggedGuide, wallRect);
                    const text = interaction?.kind === 'guide' && interaction.overRuler ? 'Entfernen' : formatCm(draggedGuide.value);
                    return draggedGuide.axis === 'v'
                        ? <Pill x={sx(pos)} y={RULER_SIZE + 14} text={text} color={WE_COLORS.guide} textColor="#083344" />
                        : <Pill x={rulerLeft + RULER_SIZE + 8} y={sy(pos)} align="start" text={text} color={WE_COLORS.guide} textColor="#083344" />;
                })()}
```

q) Suche nach übrig gebliebenen Verweisen: `grep -n "view.guides\|hoverGuide\b\|setHoverGuide(g\|axis === 'x' ?" src/components/wall-editor/WallEditorOverlay.tsx` darf nur noch Treffer liefern, die zu Snap-/Spacing-Achsen (`Axis`) gehören, nicht zu Hilfslinien.

- [ ] **Step 6: Typen und Lint**

Run: `npx tsc -b && npm run lint`
Expected: keine Fehler. (Hängehöhe wird in diesem Zustand nicht mehr aus localStorage gelesen und steht auf 145 cm, bis Task 5 sie lädt.)

- [ ] **Step 7: Im Browser prüfen**

Editor öffnen, eine Stellwand im 2D-Editor öffnen (Doppelklick).
- Aus dem oberen Lineal nach unten ziehen → waagrechte türkise Linie, Pill zeigt cm über Boden, Marker im linken Lineal.
- Aus dem linken Lineal nach rechts ziehen → senkrechte Linie, Pill zeigt cm ab linker Kante, Marker im oberen Lineal.
- Waagrechte Linie zurück ins obere Lineal ziehen → Pill „Entfernen", Linie verschwindet beim Loslassen.
- Andere Seite der Wand öffnen → dort keine Linien; zurück → Linien wieder da.
- Ein Werk an eine Linie ziehen → rastet ein.
Screenshot als Beleg.

- [ ] **Step 8: Commit**

```bash
git add src/lib/wallEvents.ts src/store/editorStore.ts src/store/wallEditorViewStore.ts src/components/wall-editor/WallEditorRulers.tsx src/components/wall-editor/WallEditorOverlay.tsx
git commit -m "$(cat <<'EOF'
feat: ruler guides per wall face, the right way round

Dragging out of the top ruler now makes a horizontal guide and out of the
left ruler a vertical one. Guides live per face in the view store.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Hängehöhe und Hilfslinien laden und speichern

**Files:**
- Create: `src/lib/wallEditor/layoutSync.ts`
- Modify: `src/pages/EditorPage.tsx`
- Modify: `src/components/SaveVersionDialog.tsx`

**Interfaces:**
- Consumes: `parseWallLayout`, `serializeGuides`, `DEFAULT_HANGING_HEIGHT`, `WallLayout` (Task 1); Store-Actions `loadWallLayout`, `renameWallGuides`, `dropWallGuides` (Task 4); `onWallEvent` (Task 4); Routen aus Task 3
- Produces: `startWallLayoutSync(): () => void`

- [ ] **Step 1: `src/lib/wallEditor/layoutSync.ts`**

```ts
import { gooeyToast } from 'goey-toast';
import { useAuthStore } from '@/store/authStore';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import { onWallEvent } from '@/lib/wallEvents';
import { DEFAULT_HANGING_HEIGHT, parseWallLayout, serializeGuides, type WallLayout } from './guides';

/** Hanging height and guides are saved this long after the last change. */
const SAVE_DEBOUNCE_MS = 300;
/** At most one "could not save" toast in this interval. */
const ERROR_TOAST_INTERVAL_MS = 10_000;

const layoutUrl = (exhibitionId: number, versionId: number) =>
    `/api/exhibitions/${exhibitionId}/versions/${versionId}/wall-layout`;

const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${useAuthStore.getState().token ?? ''}`,
});

/**
 * Keeps the 2D wall editor's hanging height and ruler guides in sync with the active exhibition
 * version: loads them whenever the version changes and PATCHes the full state (debounced) after
 * each change. It only writes — it never dispatches editor actions (Bug 1 in CLAUDE.md).
 * Returns a cleanup that sends a waiting change and unsubscribes.
 */
export function startWallLayoutSync(): () => void {
    /** Version whose layout the view store holds; changes are only saved for it. */
    let loadedVersionId: number | null = null;
    /** Set while a loaded layout is written into the store, so loading doesn't save. */
    let applying = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: (() => void) | null = null;
    let queue: Promise<void> = Promise.resolve();
    let lastErrorToast = 0;

    const apply = (layout: WallLayout) => {
        applying = true;
        try {
            useWallEditorView.getState().loadWallLayout(layout);
        } finally {
            applying = false;
        }
    };

    const load = async (exhibitionId: number, versionId: number) => {
        loadedVersionId = null;
        apply({ hangingHeight: DEFAULT_HANGING_HEIGHT, guides: {} });
        if (!useAuthStore.getState().token) return;
        try {
            const res = await fetch(layoutUrl(exhibitionId, versionId), { headers: authHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const layout = parseWallLayout(await res.json());
            // The version changed again while loading.
            if (useEditorStore.getState().activeVersionId !== versionId) return;
            apply(layout);
            loadedVersionId = versionId;
        } catch (err) {
            // Without the stored layout nothing is saved, so it can't be overwritten.
            console.warn('[WallLayout] Failed to load hanging height and guides:', err);
        }
    };

    const send = (exhibitionId: number, versionId: number) => {
        const view = useWallEditorView.getState();
        const body = JSON.stringify({ hangingHeight: view.hangingHeight, guides: serializeGuides(view.guidesByFace) });
        queue = queue.then(async () => {
            try {
                const res = await fetch(layoutUrl(exhibitionId, versionId), { method: 'PATCH', headers: authHeaders(), body });
                // No write access or the version is gone: keep the changes local, quietly.
                if (res.status === 401 || res.status === 403 || res.status === 404) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
            } catch (err) {
                console.error('[WallLayout] Failed to save hanging height and guides:', err);
                const now = Date.now();
                if (now - lastErrorToast > ERROR_TOAST_INTERVAL_MS) {
                    lastErrorToast = now;
                    gooeyToast.error('Hängehöhe/Hilfslinien konnten nicht gespeichert werden', {
                        description: 'Die nächste Änderung versucht es erneut.',
                    });
                }
            }
        });
    };

    const flush = () => {
        clearTimeout(timer);
        timer = undefined;
        const run = pending;
        pending = null;
        run?.();
    };

    const schedule = () => {
        const { activeExhibitionId, activeVersionId } = useEditorStore.getState();
        if (activeExhibitionId == null || activeVersionId == null || activeVersionId !== loadedVersionId) return;
        pending = () => send(activeExhibitionId, activeVersionId);
        clearTimeout(timer);
        timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    };

    const unsubscribeView = useWallEditorView.subscribe((state, prev) => {
        if (applying) return;
        if (state.hangingHeight !== prev.hangingHeight || state.guidesByFace !== prev.guidesByFace) schedule();
    });

    const unsubscribeEditor = useEditorStore.subscribe((state, prev) => {
        if (state.activeVersionId === prev.activeVersionId && state.activeExhibitionId === prev.activeExhibitionId) return;
        // A change still waiting belongs to the previous version (the store still holds its layout).
        flush();
        if (state.activeExhibitionId != null && state.activeVersionId != null) {
            void load(state.activeExhibitionId, state.activeVersionId);
        } else {
            loadedVersionId = null;
        }
    });

    const unsubscribeWalls = onWallEvent((event) => {
        const view = useWallEditorView.getState();
        if (event.type === 'replaced') view.renameWallGuides(event.from, event.to);
        else view.dropWallGuides(event.id);
    });

    const { activeExhibitionId, activeVersionId } = useEditorStore.getState();
    if (activeExhibitionId != null && activeVersionId != null) void load(activeExhibitionId, activeVersionId);

    return () => {
        flush();
        unsubscribeView();
        unsubscribeEditor();
        unsubscribeWalls();
    };
}
```

- [ ] **Step 2: In `EditorPage.tsx` starten**

Import ergänzen (bei den anderen `../lib/wallEditor/…`-Imports):

```ts
import { startWallLayoutSync } from '../lib/wallEditor/layoutSync';
```

Im Komponentenkörper direkt nach `const wallEditorOpen = useEditorStore((state) => !!state.wallEditor);` einfügen:

```ts
  // Hanging height and ruler guides of the 2D wall editor, per exhibition version
  useEffect(() => startWallLayoutSync(), []);
```

- [ ] **Step 3: Layout beim Versionsspeichern mitschicken (`SaveVersionDialog.tsx`)**

Imports ergänzen:

```ts
import { useWallEditorView } from '../store/wallEditorViewStore';
import { serializeGuides } from '../lib/wallEditor/guides';
```

Im `JSON.stringify({ … })` nach `sourceVersionId: activeVersionId,` einfügen:

```ts
          // 2D wall editor layout; the guide keys use the wall ids sent with `walls` below.
          hangingHeight: useWallEditorView.getState().hangingHeight,
          wallGuides: serializeGuides(useWallEditorView.getState().guidesByFace),
```

Im `walls: useEditorStore.getState().localWalls.map(w => ({` als erstes Feld einfügen:

```ts
            id: w.id,
```

- [ ] **Step 4: Typen und Lint**

Run: `npx tsc -b && npm run lint`
Expected: keine Fehler.

- [ ] **Step 5: Im Browser prüfen**

- 2D-Editor öffnen, Hängehöhe im Panel auf `140` setzen, eine waagrechte und eine senkrechte Hilfslinie ziehen. Network: ein `PATCH …/wall-layout` mit Status 200 (~300 ms nach der letzten Änderung, nicht pro Mausbewegung eine Flut — beim Ziehen einer Linie sind mehrere PATCHes möglich, aber nie parallel).
- Seite neu laden, Wand wieder öffnen → Hängelinie bei 140 cm, beide Hilfslinien an ihrer Stelle.
- Neue Version speichern (Speichern-Dialog) → nach dem Wechsel auf die neue Version sind Hängehöhe und Hilfslinien an denselben Wänden (Network: `GET …/wall-layout` der neuen Version enthält die Keys mit den **neuen** Wand-IDs).
- Eine neue Stellwand anlegen, sofort (vor dem Speichern) im 2D-Editor eine Linie ziehen, warten → `GET …/wall-layout` nach Neuladen zeigt den Key mit der echten (positiven) Wand-ID.
- Eine Stellwand mit Hilfslinien löschen → ihr Key fehlt danach in `GET …/wall-layout`.
- Hängehöhe zurück auf 145 setzen.
Screenshot + relevante Network-Einträge als Beleg.

- [ ] **Step 6: Commit**

```bash
git add src/lib/wallEditor/layoutSync.ts src/pages/EditorPage.tsx src/components/SaveVersionDialog.tsx
git commit -m "$(cat <<'EOF'
feat: load and save hanging height and guides with the version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Hängelinie im Canvas ziehen

**Files:**
- Modify: `src/components/wall-editor/WallEditorOverlay.tsx`

**Interfaces:**
- Consumes: `MIN_HANGING_HEIGHT`, `MAX_HANGING_HEIGHT` (Task 1), `setHangingHeight`, `guidesLocked` (Task 4)

- [ ] **Step 1: Interaktion und Zustand**

Guides-Import erweitern:

```ts
import { guideToWall, MAX_HANGING_HEIGHT, MIN_HANGING_HEIGHT, wallToGuideValue, type GuideAxis } from '@/lib/wallEditor/guides';
```

In `type Interaction` nach der `'guide'`-Zeile ergänzen:

```ts
    | { kind: 'hanging'; pointerId: number; /** Height above the floor while dragging (metres). */ value: number }
```

Nach `const [hoverId, setHoverId] = useState<number | null>(null);` einfügen:

```ts
    const [hoverHanging, setHoverHanging] = useState(false);
```

- [ ] **Step 2: Angezeigter Wert, Treffer**

Die Zeile `const hangY = wallRect.y + view.hangingHeight;` ersetzen durch:

```ts
    const hangingValue = interaction?.kind === 'hanging' ? interaction.value : view.hangingHeight;
    const hangY = wallRect.y + hangingValue;
```

Nach `isOverRuler` einfügen:

```ts
    const hitHanging = (x: number, y: number) => (
        view.showHangingLine && !view.guidesLocked
        && Math.abs(vt.toScreenY(hangY) - y) <= GUIDE_HIT_PX
        && x >= vt.toScreenX(wallRect.x) - 12 && x <= vt.toScreenX(right(wallRect)) + 12
    );
```

- [ ] **Step 3: Pointer-Handling**

In `handlePointerDown` direkt vor `const guide = hitGuide(x, y);` (nach dem `if (hit) { … }`-Block) einfügen:

```ts
        // Werk > hanging line > guide when they overlap
        if (hitHanging(x, y)) {
            setInter({ kind: 'hanging', pointerId: e.pointerId, value: view.hangingHeight });
            return;
        }
```

In `handlePointerMove` im Block `if (!it) { … }` die Zeilen ab `const guide = …` ersetzen durch:

```ts
            const overHanging = !hit && effectiveTool === 'select' && hitHanging(x, y);
            if (overHanging !== hoverHanging) setHoverHanging(overHanging);
            const guide = effectiveTool === 'select' && !hit && !overHanging ? hitGuide(x, y) : null;
            useWallEditorView.getState().setHoverGuide(guide?.id ?? null);
```

Im `switch (it.kind)` von `handlePointerMove` nach `case 'guide': { … }` ergänzen:

```ts
            case 'hanging': {
                const raw = v - wallRect.y;
                // Whole centimetres, with Alt whole millimetres.
                const rounded = e.altKey ? roundMm(raw) : Math.round(raw * 100) / 100;
                const value = Math.min(MAX_HANGING_HEIGHT, Math.max(MIN_HANGING_HEIGHT, rounded));
                if (value !== it.value) setInter({ ...it, value });
                return;
            }
```

Im `switch (it.kind)` von `handlePointerUp` nach `case 'guide': … break;` ergänzen:

```ts
            case 'hanging':
                useWallEditorView.getState().setHangingHeight(it.value);
                break;
```

Im `onPointerLeave`-Block zusätzlich `setHoverHanging(false);` aufrufen.

- [ ] **Step 4: Cursor und Darstellung**

Cursor: nach `else if (interaction?.kind === 'guide') cursor = …;` einfügen:

```ts
    else if (interaction?.kind === 'hanging') cursor = 'row-resize';
```

und vor `else if (view.hoverGuideId !== null) {` einfügen:

```ts
    else if (hoverHanging) cursor = 'row-resize';
```

`const hangingLabel = \`Hängehöhe ${formatCm(view.hangingHeight)}\`;` → `` const hangingLabel = `Hängehöhe ${formatCm(hangingValue)}`; ``

In der Hängelinie (`{/* Hanging height */}`) am `<line …>` `strokeWidth={1}` ersetzen durch:

```tsx
                            strokeWidth={hoverHanging || interaction?.kind === 'hanging' ? 2 : 1}
```

- [ ] **Step 5: Typen und Lint**

Run: `npx tsc -b && npm run lint`
Expected: keine Fehler.

- [ ] **Step 6: Im Browser prüfen**

- Über der gestrichelten Linie: Cursor `row-resize`, Linie dicker.
- Linie ziehen → Pill zeigt live „Hängehöhe 152 cm" in ganzen cm; mit gedrückter Alt-Taste Millimeter. Loslassen → Feld „Hängehöhe" im Panel zeigt denselben Wert, PATCH geht raus.
- Esc während des Ziehens → Linie springt zurück, kein PATCH.
- Ein Werk über der Linie greifen → das Werk wird verschoben, nicht die Linie.
- Sperren prüft Task 7 (dort kommt der Knopf dazu).
Screenshot als Beleg. Hängehöhe zurück auf 145.

- [ ] **Step 7: Commit**

```bash
git add src/components/wall-editor/WallEditorOverlay.tsx
git commit -m "$(cat <<'EOF'
feat: drag the hanging line in the wall editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Tabs im Panel und Tab „Linien"

**Files:**
- Create: `src/components/wall-editor/PanelPrimitives.tsx`
- Create: `src/components/wall-editor/WallEditorGuidesTab.tsx`
- Modify: `src/components/wall-editor/WallEditorPanel.tsx` (ganze Datei ersetzen)
- Modify: `src/store/wallEditorViewStore.ts` (Panel-Tab)
- Modify: `src/components/wall-editor/WallEditorChrome.tsx` (Tab beim Öffnen zurücksetzen)

**Interfaces:**
- Consumes: Store-Actions aus Task 4, `guides.ts` aus Task 1
- Produces:
  - `PanelPrimitives.tsx`: `CmInput` (Props `label?`, `ariaLabel?`, `value: number | null`, `placeholder?`, `onCommit(metres)`, `disabled?`, `title?`, `autoFocus?`), `IconAction`, `Section`
  - Store: `type WallEditorPanelTab = 'arrange' | 'artwork' | 'guides'`, State `panelTab`, `panelTabPinned`, Actions `setPanelTab(tab, byUser = true)`, `resetPanelTab()`
  - `WallEditorPanel.tsx`: `PANEL_TABS` (Task 10 ergänzt 'artwork'), `ArrangeTab({ face })`
  - `WallEditorGuidesTab({ face }: { face: WallFace })`

- [ ] **Step 1: Panel-Tab im Store**

In `wallEditorViewStore.ts` nach `export type WallEditorTool = …;` einfügen:

```ts
export type WallEditorPanelTab = 'arrange' | 'artwork' | 'guides';
```

Im Interface nach `hoverGuideId: number | null;` ergänzen:

```ts
    panelTab: WallEditorPanelTab;
    /** The user picked a tab in this editor session — selecting artworks no longer switches it. */
    panelTabPinned: boolean;
```

und bei den Actions nach `resetForWall: () => void;`:

```ts
    setPanelTab: (tab: WallEditorPanelTab, byUser?: boolean) => void;
    /** Back to "Anordnen" when the editor opens. */
    resetPanelTab: () => void;
```

Im `create(…)`-Objekt nach `hoverGuideId: null,`:

```ts
    panelTab: 'arrange',
    panelTabPinned: false,
```

und nach der `resetForWall`-Implementierung:

```ts
    setPanelTab: (tab, byUser = true) => set((s) => ({ panelTab: tab, panelTabPinned: s.panelTabPinned || byUser })),
    resetPanelTab: () => set({ panelTab: 'arrange', panelTabPinned: false }),
```

- [ ] **Step 2: `PanelPrimitives.tsx`**

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cmInputValue, parseCm } from '@/lib/wallEditor/format';

// Building blocks of the wall editor panel tabs.

interface CmInputProps {
    /** Caption above the field; list rows pass `ariaLabel` instead. */
    label?: string;
    ariaLabel?: string;
    value: number | null;
    placeholder?: string;
    onCommit: (metres: number) => void;
    disabled?: boolean;
    title?: string;
    autoFocus?: boolean;
}

/** Centimetre input: edits locally, commits on Enter/blur, accepts "152,5". */
export const CmInput = ({ label, ariaLabel, value, placeholder, onCommit, disabled, title, autoFocus }: CmInputProps) => {
    const [text, setText] = useState(value === null ? '' : cmInputValue(value));
    const focused = useRef(false);
    const external = value === null ? '' : cmInputValue(value);

    useEffect(() => {
        if (!focused.current) setText(external); // eslint-disable-line react-hooks/set-state-in-effect
    }, [external]);

    const commit = () => {
        const parsed = parseCm(text);
        if (parsed === null || external === cmInputValue(parsed)) {
            setText(external);
            return;
        }
        onCommit(parsed);
    };

    const field = (
        <div className="relative">
            <input
                inputMode="decimal"
                aria-label={ariaLabel ?? label}
                value={text}
                placeholder={placeholder}
                disabled={disabled}
                autoFocus={autoFocus}
                onFocus={(e) => { focused.current = true; e.target.select(); }}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => { focused.current = false; commit(); }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { setText(external); (e.target as HTMLInputElement).blur(); }
                }}
                className="w-full h-8 rounded-md bg-zinc-900 border border-zinc-700 pl-2 pr-7 text-xs text-zinc-100 tabular-nums outline-none focus:border-blue-500 disabled:opacity-40"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 pointer-events-none">cm</span>
        </div>
    );

    if (!label) return <div title={title}>{field}</div>;
    return (
        <label className="block space-y-1" title={title}>
            <span className="block text-[10px] text-zinc-500">{label}</span>
            {field}
        </label>
    );
};

export const IconAction = ({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) => (
    <button
        type="button"
        title={label}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="h-8 flex-1 flex items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
    >
        {icon}
    </button>
);

export const Section = ({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) => (
    <section className="space-y-2">
        <div className="flex items-center justify-between">
            <h3 className="text-xs text-zinc-400 uppercase tracking-wider">{title}</h3>
            {aside}
        </div>
        {children}
    </section>
);
```

Vergleiche vor dem Löschen in `WallEditorPanel.tsx`, dass die dortige `CmInput`-Logik (`commit`, `useEffect`) identisch zur obigen ist; falls sie abweicht, die Version aus `WallEditorPanel.tsx` übernehmen und nur `ariaLabel`, `autoFocus` und das optionale `label` ergänzen.

- [ ] **Step 3: `WallEditorGuidesTab.tsx`**

```tsx
import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, Eye, EyeOff, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { gooeyToast } from 'goey-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EMPTY_GUIDES, useWallEditorView } from '@/store/wallEditorViewStore';
import { roundMm } from '@/lib/wallEditor/format';
import { clampGuideValue, flipGuide, hasGuideAt, newGuideValue, sortGuides, type GuideAxis } from '@/lib/wallEditor/guides';
import type { WallFace } from '@/lib/wallEditor/wallArtworks';
import { CmInput, Section } from './PanelPrimitives';

const AXIS_LABEL: Record<GuideAxis, string> = {
    h: 'Waagrechte Hilfslinie, Höhe über Boden',
    v: 'Senkrechte Hilfslinie, Abstand von der linken Kante',
};

const SmallButton = ({ label, onClick, active, disabled, children }: {
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    children: ReactNode;
}) => (
    <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(
            'h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors',
            active && 'bg-zinc-800 text-white',
        )}
    >
        {children}
    </button>
);

const addButton = 'h-8 text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700 gap-1 px-2';

/** "Linien" tab of the wall editor panel: the open face's ruler guides as an editable list. */
export const WallEditorGuidesTab = ({ face }: { face: WallFace }) => {
    const guides = useWallEditorView((s) => s.guidesByFace[face.key] ?? EMPTY_GUIDES);
    const hidden = useWallEditorView((s) => s.guidesHidden);
    const locked = useWallEditorView((s) => s.guidesLocked);
    const hoverId = useWallEditorView((s) => s.hoverGuideId);
    // The field of a guide added from here gets the focus, so its value can be typed right away.
    const [focusId, setFocusId] = useState<number | null>(null);
    const wall = face.wallRect;
    const store = useWallEditorView.getState;

    const add = (axis: GuideAxis) => {
        const s = store();
        setFocusId(s.addGuide(face.key, axis, newGuideValue(axis, { u: s.centerU, v: s.centerV }, wall)));
    };
    const addWallCentre = () => {
        const value = roundMm(wall.w / 2);
        if (!hasGuideAt(guides, 'v', value)) store().addGuide(face.key, 'v', value);
    };
    const clearAll = () => {
        const removed = guides;
        store().setFaceGuides(face.key, []);
        gooeyToast.success(removed.length === 1 ? 'Hilfslinie gelöscht' : `${removed.length} Hilfslinien gelöscht`, {
            action: {
                label: 'Rückgängig',
                onClick: () => store().setFaceGuides(face.key, [...removed, ...(store().guidesByFace[face.key] ?? [])]),
            },
        });
    };

    return (
        <div className="space-y-4">
            <Section
                title="Hilfslinien"
                aside={(
                    <div className="flex gap-0.5">
                        <SmallButton label={hidden ? 'Hilfslinien einblenden' : 'Hilfslinien ausblenden'} active={hidden} onClick={() => store().toggleGuidesHidden()}>
                            {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </SmallButton>
                        <SmallButton label={locked ? 'Hilfslinien entsperren' : 'Hilfslinien sperren'} active={locked} onClick={() => store().toggleGuidesLocked()}>
                            {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        </SmallButton>
                        <SmallButton label="Alle Hilfslinien löschen" disabled={guides.length === 0} onClick={clearAll}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </SmallButton>
                    </div>
                )}
            >
                <div className="grid grid-cols-3 gap-1.5">
                    <Button variant="secondary" size="sm" className={addButton} onClick={() => add('h')}>
                        <Plus className="h-3.5 w-3.5" /> Waagrecht
                    </Button>
                    <Button variant="secondary" size="sm" className={addButton} onClick={() => add('v')}>
                        <Plus className="h-3.5 w-3.5" /> Senkrecht
                    </Button>
                    <Button variant="secondary" size="sm" className={addButton} onClick={addWallCentre} title="Senkrechte Hilfslinie auf der Wandmitte">
                        Wandmitte
                    </Button>
                </div>

                {guides.length === 0 ? (
                    <p className="text-xs text-zinc-500">Aus dem Lineal ziehen oder hier anlegen.</p>
                ) : (
                    <ul className="space-y-0.5">
                        {sortGuides(guides).map((g) => (
                            <li
                                key={g.id}
                                onMouseEnter={() => store().setHoverGuide(g.id)}
                                onMouseLeave={() => store().setHoverGuide(null)}
                                className={cn('flex items-center gap-1 rounded-md px-1 py-0.5', hoverId === g.id && 'bg-zinc-800/70')}
                            >
                                <span className="w-5 shrink-0 text-center text-sm text-cyan-400 select-none" title={AXIS_LABEL[g.axis]} aria-hidden>
                                    {g.axis === 'h' ? '―' : '│'}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <CmInput
                                        ariaLabel={AXIS_LABEL[g.axis]}
                                        value={g.value}
                                        autoFocus={g.id === focusId}
                                        onCommit={(m) => store().updateGuide(face.key, g.id, { value: clampGuideValue(g.axis, roundMm(m), wall) })}
                                    />
                                </div>
                                <SmallButton
                                    label="Richtung wechseln"
                                    onClick={() => {
                                        const flipped = flipGuide(g, wall);
                                        store().updateGuide(face.key, g.id, { axis: flipped.axis, value: flipped.value });
                                    }}
                                >
                                    <ArrowLeftRight className="h-3.5 w-3.5" />
                                </SmallButton>
                                <SmallButton label="Hilfslinie löschen" onClick={() => store().removeGuide(face.key, g.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </SmallButton>
                            </li>
                        ))}
                    </ul>
                )}

                <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Waagrechte Linien messen ab Boden, senkrechte ab der linken Wandkante. Werke rasten an Hilfslinien ein.
                </p>
                {hidden && <p className="text-[10px] text-zinc-400">Ausgeblendet: Linien werden nicht gezeichnet, Werke rasten nicht an ihnen ein.</p>}
                {locked && <p className="text-[10px] text-amber-400">Gesperrt: Hilfslinien und Hängelinie lassen sich im Canvas nicht verschieben.</p>}
            </Section>
        </div>
    );
};
```

- [ ] **Step 4: `WallEditorPanel.tsx` ersetzen**

Ganze Datei ersetzen. Der Inhalt von `ArrangeTab` ist der bisherige Panel-Körper (alles innerhalb von `<div className="flex-1 overflow-y-auto …">`), nur mit `face` als Prop statt `useWallFace()`:

```tsx
import { useState, type ReactNode } from 'react';
import {
    AlignCenterHorizontal,
    AlignCenterVertical,
    AlignEndHorizontal,
    AlignEndVertical,
    AlignHorizontalDistributeCenter,
    AlignStartHorizontal,
    AlignStartVertical,
    AlignVerticalDistributeCenter,
    ChevronRight,
    MoveHorizontal,
    MoveVertical,
    Trash2,
} from 'lucide-react';
import { gooeyToast } from 'goey-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView, type WallEditorPanelTab } from '@/store/wallEditorViewStore';
import { useWallFace } from '@/hooks/use-wall-face';
import { formatCm } from '@/lib/wallEditor/format';
import { centerX, centerY, right, top, uniformGap, unionRect, type AlignMode, type Axis } from '@/lib/wallEditor/layout';
import {
    alignSelection,
    centerSelectionOnWall,
    distributeSelection,
    hangSelection,
    selectAllOnFace,
    setSelectionEdge,
    setSelectionGap,
    type AlignTarget,
    type EdgeKey,
} from '@/lib/wallEditor/operations';
import { removeInstances, type WallFace } from '@/lib/wallEditor/wallArtworks';
import { CmInput, IconAction, Section } from './PanelPrimitives';
import { WallEditorGuidesTab } from './WallEditorGuidesTab';

const ALIGN_ACTIONS: { mode: AlignMode; label: string; icon: ReactNode }[] = [
    { mode: 'left', label: 'Links ausrichten', icon: <AlignStartVertical className="h-4 w-4" /> },
    { mode: 'hcenter', label: 'Horizontal mittig ausrichten', icon: <AlignCenterVertical className="h-4 w-4" /> },
    { mode: 'right', label: 'Rechts ausrichten', icon: <AlignEndVertical className="h-4 w-4" /> },
    { mode: 'top', label: 'Oben ausrichten', icon: <AlignStartHorizontal className="h-4 w-4" /> },
    { mode: 'vcenter', label: 'Vertikal mittig ausrichten', icon: <AlignCenterHorizontal className="h-4 w-4" /> },
    { mode: 'bottom', label: 'Unten ausrichten', icon: <AlignEndHorizontal className="h-4 w-4" /> },
];

const SHORTCUTS: [string, string][] = [
    ['V / H / M', 'Auswahl / Hand / Messen'],
    ['⇧ + Klick', 'Mehrfachauswahl'],
    ['⇧ beim Ziehen', 'Nur waagrecht/senkrecht'],
    ['⌘/Strg beim Ziehen', 'Einrasten umkehren'],
    ['Alt halten', 'Abstände zur Auswahl'],
    ['Pfeiltasten', '1 cm (⇧ 10 cm, Alt 1 mm)'],
    ['Scrollen', 'Ansicht verschieben'],
    ['⌘/Strg + Scrollen', 'Zoomen'],
    ['⇧1 / ⇧2', 'Wand / Auswahl einpassen'],
    ['Lineal oben ziehen', 'Waagrechte Hilfslinie'],
    ['Lineal links ziehen', 'Senkrechte Hilfslinie'],
    ['Hängelinie ziehen', 'Hängehöhe (Alt: mm-genau)'],
    ['Esc', 'Abwählen / zurück zu 3D'],
];

export const PANEL_TABS: { id: WallEditorPanelTab; label: string }[] = [
    { id: 'arrange', label: 'Anordnen' },
    { id: 'guides', label: 'Linien' },
];

// ── Tab "Anordnen" ─────────────────────────────────────────────────────────

const ArrangeTab = ({ face }: { face: WallFace }) => {
    const selection = useEditorStore((s) => s.wallEditorSelection);
    const hangingHeight = useWallEditorView((s) => s.hangingHeight);
    const setHangingHeight = useWallEditorView((s) => s.setHangingHeight);
    const [alignTarget, setAlignTarget] = useState<AlignTarget>('selection');
    const [showShortcuts, setShowShortcuts] = useState(false);

    const selected = face.items.filter((i) => selection.includes(i.id));
    const count = selected.length;
    const box = unionRect(selected.map((i) => i.rect));
    const floor = face.wallRect.y;
    const single = count === 1 ? selected[0] : null;

    const gapValue = (axis: Axis) => {
        const g = uniformGap(selected, axis);
        return typeof g === 'number' ? g : null;
    };
    const gapPlaceholder = (axis: Axis) => (uniformGap(selected, axis) === 'mixed' ? 'Gemischt' : '');

    const edgeInput = (edge: EdgeKey, label: string, value: number | null, title?: string) => (
        <CmInput label={label} value={value} disabled={!box} onCommit={(v) => setSelectionEdge(edge, v)} title={title} />
    );

    const remove = () => {
        const ids = selected.map((i) => i.id);
        removeInstances(ids);
        gooeyToast.success(ids.length === 1 ? 'Werk entfernt' : `${ids.length} Werke entfernt`, {
            description: 'Mit ⌘/Strg + Z rückgängig machen.',
        });
    };

    return (
        <>
            <Section title="Auswahl">
                {count === 0 && (
                    <div className="space-y-2">
                        <p className="text-xs text-zinc-500 leading-relaxed">
                            Klicke ein Werk an oder ziehe einen Rahmen auf. Mit ⇧ wählst du mehrere aus.
                            {face.items.length === 0 && ' Auf dieser Seite hängt noch nichts – zieh ein Werk aus der Bibliothek auf die Wand.'}
                        </p>
                        <Button variant="secondary" size="sm" className="w-full h-8 text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700" onClick={selectAllOnFace} disabled={face.items.length === 0}>
                            Alle auswählen ({face.items.length})
                        </Button>
                    </div>
                )}
                {single && (
                    <div className="rounded-md bg-zinc-900 border border-zinc-800 p-2.5 space-y-0.5">
                        <div className="text-sm text-zinc-100 font-medium truncate" title={single.label}>{single.label}</div>
                        {(single.inst.artwork.artist || single.inst.artwork.year) && (
                            <div className="text-[11px] text-zinc-400 truncate">
                                {[single.inst.artwork.artist, single.inst.artwork.year].filter(Boolean).join(', ')}
                            </div>
                        )}
                        <div className="text-[11px] text-zinc-500 tabular-nums">
                            {formatCm(single.rect.w, false)} × {formatCm(single.rect.h)}
                            {single.inst.artwork.asset.type === 'image' ? ' mit Rahmen' : ''}
                        </div>
                    </div>
                )}
                {count > 1 && box && (
                    <div className="rounded-md bg-zinc-900 border border-zinc-800 p-2.5">
                        <div className="text-sm text-zinc-100 font-medium">{count} Werke</div>
                        <div className="text-[11px] text-zinc-500 tabular-nums">Gruppe {formatCm(box.w, false)} × {formatCm(box.h)}</div>
                    </div>
                )}
            </Section>

            <Separator className="bg-zinc-800" />

            <Section
                title="Ausrichten"
                aside={count > 1 ? (
                    <div className="flex rounded-md bg-zinc-900 border border-zinc-800 p-0.5 text-[10px]">
                        {(['selection', 'wall'] as const).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setAlignTarget(t)}
                                className={cn('px-1.5 py-0.5 rounded', alignTarget === t ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300')}
                            >
                                {t === 'selection' ? 'Zueinander' : 'An Wand'}
                            </button>
                        ))}
                    </div>
                ) : count === 1 ? <span className="text-[10px] text-zinc-500">an der Wand</span> : undefined}
            >
                <div className="flex gap-0.5 rounded-md bg-zinc-900/60 border border-zinc-800 p-0.5">
                    {ALIGN_ACTIONS.map((a) => (
                        <IconAction key={a.mode} icon={a.icon} label={a.label} disabled={count === 0} onClick={() => alignSelection(a.mode, alignTarget)} />
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" size="sm" disabled={count === 0} onClick={() => centerSelectionOnWall('x')} className="h-8 text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700 gap-1.5">
                        <MoveHorizontal className="h-3.5 w-3.5" /> Auf Wand zentrieren
                    </Button>
                    <Button variant="secondary" size="sm" disabled={count === 0} onClick={() => centerSelectionOnWall('y')} className="h-8 text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700 gap-1.5">
                        <MoveVertical className="h-3.5 w-3.5" /> Vertikal zentrieren
                    </Button>
                </div>
            </Section>

            <Separator className="bg-zinc-800" />

            <Section title="Abstände">
                {count < 2 ? (
                    <p className="text-xs text-zinc-500">Wähle mindestens zwei Werke aus, um Abstände festzulegen.</p>
                ) : (
                    <div className="space-y-2">
                        {(['x', 'y'] as const).map((axis) => (
                            <div key={axis} className="flex items-end gap-2">
                                <div className="flex-1">
                                    <CmInput
                                        label={axis === 'x' ? 'Horizontaler Abstand' : 'Vertikaler Abstand'}
                                        value={gapValue(axis)}
                                        placeholder={gapPlaceholder(axis)}
                                        onCommit={(v) => setSelectionGap(axis, v)}
                                        title={axis === 'x' ? 'Das linke Werk bleibt stehen' : 'Das obere Werk bleibt stehen'}
                                    />
                                </div>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    disabled={count < 3}
                                    title={axis === 'x' ? 'Horizontal gleichmäßig verteilen' : 'Vertikal gleichmäßig verteilen'}
                                    onClick={() => distributeSelection(axis)}
                                    className="h-8 w-8 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                                >
                                    {axis === 'x' ? <AlignHorizontalDistributeCenter className="h-4 w-4" /> : <AlignVerticalDistributeCenter className="h-4 w-4" />}
                                </Button>
                            </div>
                        ))}
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                            Tipp: Die pinken Abstandsmarken zwischen ausgewählten Werken lassen sich direkt ziehen.
                        </p>
                    </div>
                )}
            </Section>

            <Separator className="bg-zinc-800" />

            <Section title={count > 1 ? 'Position der Gruppe' : 'Position'}>
                <div className="grid grid-cols-2 gap-2">
                    {edgeInput('left', 'Abstand links', box ? box.x - face.wallRect.x : null, 'Von der linken Wandkante')}
                    {edgeInput('right', 'Abstand rechts', box ? right(face.wallRect) - right(box) : null, 'Bis zur rechten Wandkante')}
                    {edgeInput('hcenter', 'Mitte (horizontal)', box ? centerX(box) - face.wallRect.x : null, 'Von der linken Wandkante')}
                    <div />
                    {edgeInput('top', 'Oberkante', box ? top(box) - floor : null, 'Über dem Boden')}
                    {edgeInput('vcenter', 'Mitte (Höhe)', box ? centerY(box) - floor : null, 'Über dem Boden')}
                    {edgeInput('bottom', 'Unterkante', box ? box.y - floor : null, 'Über dem Boden')}
                </div>
            </Section>

            <Separator className="bg-zinc-800" />

            <Section title="Hängung">
                <CmInput label="Hängehöhe (Bildmitte über Boden)" value={hangingHeight} onCommit={setHangingHeight} />
                <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" size="sm" disabled={count === 0} onClick={() => hangSelection('each')} className="h-8 text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700" title="Jede Bildmitte auf die Hängehöhe setzen">
                        Mitten auf Linie
                    </Button>
                    <Button variant="secondary" size="sm" disabled={count < 2} onClick={() => hangSelection('group')} className="h-8 text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700" title="Die Mitte der ganzen Gruppe auf die Hängehöhe setzen (Petersburger Hängung)">
                        Gruppe auf Linie
                    </Button>
                </div>
            </Section>

            <Separator className="bg-zinc-800" />

            <section>
                <button type="button" onClick={() => setShowShortcuts((v) => !v)} className="w-full flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider hover:text-zinc-200">
                    Tastenkürzel
                    <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', showShortcuts && 'rotate-90')} />
                </button>
                {showShortcuts && (
                    <dl className="mt-2 space-y-1">
                        {SHORTCUTS.map(([key, text]) => (
                            <div key={key} className="flex justify-between gap-2 text-[11px]">
                                <dt className="text-zinc-300 whitespace-nowrap">{key}</dt>
                                <dd className="text-zinc-500 text-right">{text}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </section>

            {count > 0 && (
                <>
                    <Separator className="bg-zinc-800" />
                    <Button variant="destructive" size="sm" className="w-full" onClick={remove}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        {count === 1 ? 'Werk entfernen' : `${count} Werke entfernen`}
                    </Button>
                </>
            )}
        </>
    );
};

// ── Panel ─────────────────────────────────────────────────────────────────

interface WallEditorPanelProps {
    onToggle: () => void;
}

/** Right-hand panel of the 2D wall editor (shown by PropertiesPanel while the editor is open). */
export const WallEditorPanel = ({ onToggle }: WallEditorPanelProps) => {
    const face = useWallFace();
    const tab = useWallEditorView((s) => s.panelTab);
    const setPanelTab = useWallEditorView((s) => s.setPanelTab);
    const guideCount = useWallEditorView((s) => (face ? s.guidesByFace[face.key]?.length ?? 0 : 0));

    if (!face) return null;

    return (
        <>
            <div className="flex items-center border-b border-zinc-800 bg-blue-600">
                <div className="flex-1 py-2.5 px-3 text-xs font-medium text-white">2D-Wandeditor</div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 mr-1" onClick={onToggle}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <div className="px-4 pt-3">
                <div role="tablist" className="flex gap-0.5 rounded-md bg-zinc-900 border border-zinc-800 p-0.5 text-xs">
                    {PANEL_TABS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={tab === t.id}
                            onClick={() => setPanelTab(t.id)}
                            className={cn('flex-1 h-7 rounded transition-colors', tab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200')}
                        >
                            {t.label}
                            {t.id === 'guides' && guideCount > 0 && <span className="ml-1 text-zinc-500 tabular-nums">{guideCount}</span>}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
                {tab === 'guides' ? <WallEditorGuidesTab face={face} /> : <ArrangeTab face={face} />}
            </div>
        </>
    );
};
```

`ArrangeTab` ist der bisherige Panel-Körper; geändert haben sich nur: `face` ist ein Prop statt `useWallFace()`, `CmInput`/`IconAction`/`Section` kommen aus `./PanelPrimitives`, die Tastenkürzel-Liste hat die neuen Lineal-/Hängelinien-Einträge. Vor dem Ersetzen die alte Datei mit dem obigen JSX vergleichen (`git diff` nach dem Schreiben): außer diesen Punkten und dem Tab-Gerüst darf sich nichts ändern. `'artwork'` fehlt in `PANEL_TABS` absichtlich — Task 10 fügt den Tab hinzu; bis dahin zeigt ein `panelTab === 'artwork'` den Tab „Anordnen" (Fallback im `? :`).

- [ ] **Step 5: Tab beim Öffnen zurücksetzen (`WallEditorChrome.tsx`)**

In `export const WallEditor = () => {` nach `const face = useWallFace();` einfügen:

```ts
    const isOpen = !!wallEditor;
    // Every editor session starts on "Anordnen"; selections may switch to "Werk" until a tab is picked.
    useEffect(() => {
        if (isOpen) useWallEditorView.getState().resetPanelTab();
    }, [isOpen]);
```

- [ ] **Step 6: Typen und Lint**

Run: `npx tsc -b && npm run lint`
Expected: keine Fehler.

- [ ] **Step 7: Im Browser prüfen**

- Panel zeigt Tabs „Anordnen | Linien"; „Anordnen" sieht aus wie vorher (alle Abschnitte, Hängehöhen-Feld, Tastenkürzel mit den neuen Einträgen).
- „Linien": „+ Waagrecht" legt eine Linie in der Bildmitte an, ihr Feld hat den Fokus; `120` + Enter → Linie springt auf 120 cm über Boden.
- ⇄ macht aus einer waagrechten eine senkrechte Linie (Wert bleibt, begrenzt auf die Wandbreite).
- „Wandmitte" zweimal klicken → nur eine Linie.
- Hover über eine Zeile → Linie im Canvas dicker.
- 👁 → Linien weg, Werke rasten nicht mehr an ihnen; aus dem Lineal ziehen blendet wieder ein.
- 🔒 → Linien und Hängelinie im Canvas nicht greifbar (Cursor bleibt normal), aus dem Lineal ziehen geht weiter.
- 🗑 → Toast mit „Rückgängig", Klick stellt die Linien wieder her.
- Neuladen: 👁/🔒-Zustand bleibt (localStorage), Linien kommen aus der DB.
Screenshot als Beleg.

- [ ] **Step 8: Commit**

```bash
git add src/store/wallEditorViewStore.ts src/components/wall-editor/PanelPrimitives.tsx src/components/wall-editor/WallEditorGuidesTab.tsx src/components/wall-editor/WallEditorPanel.tsx src/components/wall-editor/WallEditorChrome.tsx
git commit -m "$(cat <<'EOF'
feat: tabs in the wall editor panel and a guides tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: FrameControls aus dem PropertiesPanel lösen

Reines Verschieben, kein Verhaltenswechsel.

**Files:**
- Create: `src/lib/passepartout.ts`
- Create: `src/components/properties/NumericInput.tsx`
- Create: `src/components/properties/FrameControls.tsx`
- Modify: `src/components/PropertiesPanel.tsx`

**Interfaces:**
- Produces:
  - `src/lib/passepartout.ts`: `interface PassepartoutValue { width: number; placement: PassepartoutPlacement }`, `NO_PASSEPARTOUT`, `passepartoutOf(inst: { passepartoutWidth?: number | null; passepartoutPlacement?: unknown }): PassepartoutValue`
  - `NumericInput` (Props wie bisher)
  - `FrameControls` + `interface FrameControlsProps` (Props wie bisher)

- [ ] **Step 1: `src/lib/passepartout.ts`**

```ts
import { isPassepartoutPlacement, type PassepartoutPlacement } from '@/lib/frameStyles';

export interface PassepartoutValue {
    /** Width at the sides in cm, 0 = none. */
    width: number;
    placement: PassepartoutPlacement;
}

export const NO_PASSEPARTOUT: PassepartoutValue = { width: 0, placement: 'center' };

export function passepartoutOf(inst: { passepartoutWidth?: number | null; passepartoutPlacement?: unknown }): PassepartoutValue {
    return {
        width: Math.max(0, inst.passepartoutWidth ?? 0),
        placement: isPassepartoutPlacement(inst.passepartoutPlacement) ? inst.passepartoutPlacement : 'center',
    };
}
```

- [ ] **Step 2: `src/components/properties/NumericInput.tsx`**

Den Block aus `PropertiesPanel.tsx` von `// Numeric input that holds local string state …` bis zum Ende von `const NumericInput = … };` wörtlich hierher verschieben, mit diesen Imports davor und `export` vor `const NumericInput`:

```tsx
import { useState, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
```

- [ ] **Step 3: `src/components/properties/FrameControls.tsx`**

Aus `PropertiesPanel.tsx` wörtlich hierher verschieben: `const formatCm`, `const formatMm`, `function finishSwatch`, `interface FrameControlsProps`, `const selectClass`, `const toggleClass`, `const FrameControls`. `export` vor `interface FrameControlsProps` und vor `const FrameControls`. Die Passepartout-Typen/-Funktionen **nicht** mitnehmen (liegen jetzt in `src/lib/passepartout.ts`). Imports:

```tsx
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
    FRAME_FINISHES,
    FRAME_LINES,
    FRAME_MANUFACTURER_LABELS,
    FRAME_PROFILES,
    MAX_PASSEPARTOUT_WIDTH_CM,
    PASSEPARTOUT_PLACEMENTS,
    PROFILE_FINISHES,
    frameLineOf,
    frameStyle as frameStyleSpec,
    framedArtworkLayout,
    profileFitsFormat,
    styleForProfile,
    styleIdOf,
    type FrameFinishId,
    type FrameProfileId,
    type FrameStyleId,
    type PassepartoutPlacement,
} from '@/lib/frameStyles';
import type { PassepartoutValue } from '@/lib/passepartout';
import { NumericInput } from './NumericInput';
```

- [ ] **Step 4: `PropertiesPanel.tsx` aufräumen**

Verschobenen Code löschen (NumericInput-Block, `PassepartoutValue`, `NO_PASSEPARTOUT`, `passepartoutOf`, `formatCm`, `formatMm`, `finishSwatch`, `FrameControlsProps`, `selectClass`, `toggleClass`, `FrameControls`) und importieren:

```tsx
import { NumericInput } from './properties/NumericInput';
import { FrameControls } from './properties/FrameControls';
import { NO_PASSEPARTOUT, passepartoutOf, type PassepartoutValue } from '@/lib/passepartout';
```

Der `frameStyles`-Import in `PropertiesPanel.tsx` wird zu:

```tsx
import {
    DEFAULT_FRAME_STYLE,
    DEFAULT_PASSEPARTOUT_WIDTH_CM,
    MAX_PASSEPARTOUT_WIDTH_CM,
    frameStyleOf,
    framedArtworkLayout,
    type FrameStyleId,
} from '@/lib/frameStyles';
```

`import { useState, useEffect, useCallback, useRef, type InputHTMLAttributes } from 'react';` → `type InputHTMLAttributes` entfernen; `import { Input } from '@/components/ui/input';` entfernen.

- [ ] **Step 5: Typen und Lint**

Run: `npx tsc -b && npm run lint`
Expected: keine Fehler (insbesondere keine `noUnusedLocals`-Meldungen und keine react-refresh-Warnung in den neuen Dateien).

- [ ] **Step 6: Im Browser prüfen**

3D-Editor: ein Bild auswählen → Properties zeigen Rahmen (Gerahmt/Ohne, Profil, Farben), Passepartout (Breite, Platzierung, Außenmaß) und Größe wie vorher; Profil wechseln und Passepartout einschalten wirkt wie vorher. Screenshot als Beleg.

- [ ] **Step 7: Commit**

```bash
git add src/lib/passepartout.ts src/components/properties src/components/PropertiesPanel.tsx
git commit -m "$(cat <<'EOF'
refactor: move frame controls out of the properties panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Skalier-Mathematik

**Files:**
- Create: `src/lib/wallEditor/scale.ts`
- Test: `src/lib/wallEditor/scale.test.ts`
- Modify: `src/lib/wallEditor/footprint.ts` (`pictureSize`)

**Interfaces:**
- Produces (`scale.ts`):
  - `interface Point { x: number; y: number }`, `type Corner = 'nw' | 'ne' | 'sw' | 'se'`, `OPPOSITE_CORNER: Record<Corner, Corner>`
  - `MIN_PICTURE_EDGE = 0.01`, `FINE_SCALE = 0.1`, `SCALE_STEP = 0.05`
  - `cornerPoint(r: Rect, corner: Corner): Point` (Nord = oben = größeres y)
  - `modalScaleFactor(pivot: Point, start: Point, current: Point): number`
  - `handleScaleFactor(pivot: Point, start: Point, current: Point): number`
  - `fineFactor(factor: number): number`
  - `snapFactorToCm(factor: number, pictureWidth: number): number`
  - `clampScaleFactor(factor: number, pictures: { w: number; h: number }[]): number`
- Produces (`footprint.ts`): `pictureSize(inst: ArtworkInstanceData): { w: number; h: number }` (Meter, ohne Rahmen)

- [ ] **Step 1: Failing test**

`src/lib/wallEditor/scale.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
    OPPOSITE_CORNER,
    clampScaleFactor,
    cornerPoint,
    fineFactor,
    handleScaleFactor,
    modalScaleFactor,
    snapFactorToCm,
} from './scale';

describe('cornerPoint', () => {
    const r = { x: 1, y: 2, w: 3, h: 4 };

    it('uses y up: north is the top edge', () => {
        expect(cornerPoint(r, 'nw')).toEqual({ x: 1, y: 6 });
        expect(cornerPoint(r, 'ne')).toEqual({ x: 4, y: 6 });
        expect(cornerPoint(r, 'sw')).toEqual({ x: 1, y: 2 });
        expect(cornerPoint(r, 'se')).toEqual({ x: 4, y: 2 });
    });

    it('pairs opposite corners', () => {
        expect(OPPOSITE_CORNER.nw).toBe('se');
        expect(OPPOSITE_CORNER.sw).toBe('ne');
    });
});

describe('modalScaleFactor', () => {
    it('is the distance to the pivot relative to the start', () => {
        expect(modalScaleFactor({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 2 })).toBeCloseTo(2);
        expect(modalScaleFactor({ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 1 })).toBeCloseTo(0.5);
    });

    it('stays at 1 when the gesture starts on the pivot', () => {
        expect(modalScaleFactor({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 5, y: 5 })).toBe(1);
    });
});

describe('handleScaleFactor', () => {
    it('follows the pointer along the diagonal', () => {
        expect(handleScaleFactor({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeCloseTo(2);
        expect(handleScaleFactor({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.5 })).toBeCloseTo(0.5);
    });

    it('ignores movement across the diagonal', () => {
        expect(handleScaleFactor({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1.5, y: 0.5 })).toBeCloseTo(1);
    });
});

describe('fineFactor', () => {
    it('keeps a tenth of the change', () => {
        expect(fineFactor(2)).toBeCloseTo(1.1);
        expect(fineFactor(0.5)).toBeCloseTo(0.95);
    });
});

describe('snapFactorToCm', () => {
    it('rounds the picture width to whole centimetres', () => {
        expect(0.6 * snapFactorToCm(1.1234, 0.6)).toBeCloseTo(0.67);
    });

    it('never goes below 1 cm', () => {
        expect(0.6 * snapFactorToCm(0.001, 0.6)).toBeCloseTo(0.01);
    });
});

describe('clampScaleFactor', () => {
    it('keeps the smallest picture edge at 1 cm', () => {
        expect(clampScaleFactor(0.001, [{ w: 0.5, h: 0.2 }])).toBeCloseTo(0.05);
        expect(clampScaleFactor(0.001, [{ w: 0.5, h: 0.2 }, { w: 0.1, h: 0.1 }])).toBeCloseTo(0.1);
    });

    it('leaves larger factors alone', () => {
        expect(clampScaleFactor(1.5, [{ w: 0.5, h: 0.2 }])).toBe(1.5);
    });

    it('never returns zero or less', () => {
        expect(clampScaleFactor(-2, [])).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Test laufen lassen, muss scheitern**

Run: `npx vitest run src/lib/wallEditor/scale.test.ts`
Expected: FAIL — Modul `./scale` fehlt.

- [ ] **Step 3: Implementieren**

`src/lib/wallEditor/scale.ts`:

```ts
import type { Rect } from './layout';

/** Scale gestures of the 2D wall editor — pure math in wall units (metres, y up). */

export interface Point {
    x: number;
    y: number;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export const OPPOSITE_CORNER: Record<Corner, Corner> = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' };

/** No picture edge gets smaller than this (metres). */
export const MIN_PICTURE_EDGE = 0.01;
/** ⇧ while scaling: a tenth of the change. */
export const FINE_SCALE = 0.1;
/** Step of the −5 % / +5 % buttons. */
export const SCALE_STEP = 0.05;

/** Corner of a rectangle in wall coordinates (north = top = larger y). */
export function cornerPoint(r: Rect, corner: Corner): Point {
    return {
        x: corner === 'nw' || corner === 'sw' ? r.x : r.x + r.w,
        y: corner === 'nw' || corner === 'ne' ? r.y + r.h : r.y,
    };
}

/** Modal scale (S, like Blender): pointer distance from the pivot relative to the distance at the start. */
export function modalScaleFactor(pivot: Point, start: Point, current: Point): number {
    const d0 = Math.hypot(start.x - pivot.x, start.y - pivot.y);
    if (d0 < 1e-9) return 1;
    return Math.hypot(current.x - pivot.x, current.y - pivot.y) / d0;
}

/** Corner handle: the pointer projected onto the line from the pivot through the grab point. */
export function handleScaleFactor(pivot: Point, start: Point, current: Point): number {
    const dx = start.x - pivot.x;
    const dy = start.y - pivot.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return 1;
    return ((current.x - pivot.x) * dx + (current.y - pivot.y) * dy) / len2;
}

/** ⇧: only a tenth of the change. */
export function fineFactor(factor: number): number {
    return 1 + (factor - 1) * FINE_SCALE;
}

/** Snaps a factor so the picture width becomes whole centimetres (at least 1 cm). */
export function snapFactorToCm(factor: number, pictureWidth: number): number {
    if (pictureWidth <= 0) return factor;
    const cm = Math.max(1, Math.round(pictureWidth * factor * 100));
    return cm / 100 / pictureWidth;
}

/** Keeps every picture edge at MIN_PICTURE_EDGE or more (`pictures`: current sizes in metres). */
export function clampScaleFactor(factor: number, pictures: { w: number; h: number }[]): number {
    let min = 1e-3;
    for (const p of pictures) {
        const edge = Math.min(p.w, p.h);
        if (edge > 0) min = Math.max(min, MIN_PICTURE_EDGE / edge);
    }
    return Math.max(factor, min);
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npm run test`
Expected: PASS (guides + scale).

- [ ] **Step 5: `pictureSize` in `footprint.ts`**

Direkt nach `export function baseArtworkSize(…) { … }` einfügen:

```ts
/** Current picture size (without frame) in metres. */
export function pictureSize(inst: ArtworkInstanceData): { w: number; h: number } {
    const base = baseArtworkSize(inst);
    return { w: base.w * safeScale(inst.scale_x), h: base.h * safeScale(inst.scale_y) };
}
```

- [ ] **Step 6: Typen, Lint, Commit**

Run: `npx tsc -b && npm run lint`
Expected: keine Fehler.

```bash
git add src/lib/wallEditor/scale.ts src/lib/wallEditor/scale.test.ts src/lib/wallEditor/footprint.ts
git commit -m "$(cat <<'EOF'
feat: scale math for the wall editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Tab „Werk" mit Größe, Rahmen, Passepartout

**Files:**
- Modify: `src/lib/wallEditor/wallArtworks.ts`
- Modify: `src/lib/wallEditor/operations.ts`
- Create: `src/components/wall-editor/WallEditorArtworkTab.tsx`
- Modify: `src/components/wall-editor/WallEditorPanel.tsx`

**Interfaces:**
- Consumes: `scale.ts`, `pictureSize` (Task 9), `FrameControls`, `passepartout.ts` (Task 8), `PanelPrimitives` (Task 7)
- Produces (`wallArtworks.ts`):
  - `isPicture(inst): boolean`, `isScalable(inst): boolean`
  - `interface ScaledArtwork { inst: ArtworkInstanceData; shift: Offset; rect: Rect }`
  - `scaleArtworks(face: WallFace, ids: number[], factor: number, pivot?: { u: number; v: number }): Map<number, ScaledArtwork>`
  - `resizeArtwork(face: WallFace, id: number, size: { w: number; h: number }): Map<number, ScaledArtwork>`
  - `commitScaledArtworks(face: WallFace, scaled: Map<number, ScaledArtwork>): boolean`
- Produces (`operations.ts`): `scaleSelection(factor)`, `setSelectionPictureSize(axis: 'w' | 'h', metres, keepAspect)`, `setSelectionFrameStyle(style)`, `setSelectionPassepartout(value)`, `setSelectionMedium(medium)` — alle `: boolean`
- Produces: `WallEditorArtworkTab({ face })`

- [ ] **Step 1: Skalieren in `wallArtworks.ts`**

Imports ändern:

```ts
import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { useEditorStore } from '@/store/editorStore';
import { sideOfInstance, worldToWall, wallToWorld, WALL_SIDES, type WallFrame, type WallPoint, type WallSide } from './geometry';
import { artworkFrameLayout, baseArtworkSize, computeFootprint, footprintRect, type Footprint } from './footprint';
```

Am Dateiende anfügen:

```ts
// ── Scaling ───────────────────────────────────────────────────────────────

const NO_SHIFT: Offset = { dx: 0, dy: 0 };

/** Pictures (images) get frames and passepartouts; videos don't. */
export function isPicture(inst: ArtworkInstanceData): boolean {
    return (inst.artwork.asset.type ?? 'image') === 'image';
}

/** The monitor model has a fixed size; everything else on a wall can be scaled. */
export function isScalable(inst: ArtworkInstanceData): boolean {
    return !(inst.artwork.asset.type === 'video' && inst.medium === 'monitor');
}

/** An artwork after a scale gesture (not yet in the store). */
export interface ScaledArtwork {
    /** Instance with its new scale; its position is still the old one. */
    inst: ArtworkInstanceData;
    /** Anchor shift on the wall: a fixed corner, or lifting the artwork back above the floor. */
    shift: Offset;
    /** New rectangle on the wall (frame included). */
    rect: Rect;
}

/** Footprint at `inst`'s scale: framed pictures are recomputed, everything else scales its measured footprint. */
function footprintAt(item: WallArtwork, inst: ArtworkInstanceData): Footprint {
    if (isPicture(inst)) {
        const { left, right, bottom, top } = artworkFrameLayout(inst);
        return { left, right, bottom, top, exact: true };
    }
    const fx = Math.abs(inst.scale_x / item.inst.scale_x) || 1;
    const fy = Math.abs(inst.scale_y / item.inst.scale_y) || 1;
    const fp = item.footprint;
    return { left: fp.left * fx, right: fp.right * fx, bottom: fp.bottom * fy, top: fp.top * fy, exact: fp.exact };
}

/** Places a rescaled artwork: moved by `shift`, lifted so its bottom stays on or above the floor. */
function placeScaled(face: WallFace, item: WallArtwork, inst: ArtworkInstanceData, shift: Offset): ScaledArtwork {
    const rect = footprintRect(footprintAt(item, inst), item.anchor.u + shift.dx, item.anchor.v + shift.dy);
    const lift = Math.max(0, face.wallRect.y - rect.y);
    return {
        inst,
        shift: { dx: shift.dx, dy: shift.dy + lift },
        rect: { ...rect, y: rect.y + lift },
    };
}

/**
 * Scales artworks of the face by `factor` (x, y and z, so the aspect ratio stays) about their
 * picture centres. With `pivot` (a single artwork dragged at a corner with Alt) the anchor moves
 * as if scaled about that wall point instead. Monitors are skipped.
 */
export function scaleArtworks(face: WallFace, ids: number[], factor: number, pivot?: { u: number; v: number }): Map<number, ScaledArtwork> {
    const wanted = new Set(ids);
    const out = new Map<number, ScaledArtwork>();
    for (const item of face.items) {
        if (!wanted.has(item.id) || !isScalable(item.inst)) continue;
        const inst = {
            ...item.inst,
            scale_x: item.inst.scale_x * factor,
            scale_y: item.inst.scale_y * factor,
            scale_z: item.inst.scale_z * factor,
        };
        const shift = pivot
            ? { dx: (item.anchor.u - pivot.u) * (factor - 1), dy: (item.anchor.v - pivot.v) * (factor - 1) }
            : NO_SHIFT;
        out.set(item.id, placeScaled(face, item, inst, shift));
    }
    return out;
}

/** Sets one artwork's picture size in metres; width and height may leave its aspect ratio. */
export function resizeArtwork(face: WallFace, id: number, size: { w: number; h: number }): Map<number, ScaledArtwork> {
    const item = face.items.find((i) => i.id === id);
    if (!item || !isScalable(item.inst)) return new Map();
    const base = baseArtworkSize(item.inst);
    if (base.w <= 0 || base.h <= 0) return new Map();
    const inst = {
        ...item.inst,
        scale_x: (Math.sign(item.inst.scale_x) || 1) * (size.w / base.w),
        scale_y: (Math.sign(item.inst.scale_y) || 1) * (size.h / base.h),
    };
    return new Map([[id, placeScaled(face, item, inst, NO_SHIFT)]]);
}

/** Writes scaled artworks to the store (one undo step). */
export function commitScaledArtworks(face: WallFace, scaled: Map<number, ScaledArtwork>): boolean {
    if (scaled.size === 0) return false;
    const store = useEditorStore.getState();
    const round = (v: number) => Math.round(v * 10000) / 10000;
    let changed = false;
    const next = store.localInstances.map((inst) => {
        const s = scaled.get(inst.id);
        if (!s) return inst;
        const moved = Math.abs(s.shift.dx) > 1e-6 || Math.abs(s.shift.dy) > 1e-6;
        const rescaled = s.inst.scale_x !== inst.scale_x || s.inst.scale_y !== inst.scale_y || s.inst.scale_z !== inst.scale_z;
        if (!moved && !rescaled) return inst;
        changed = true;
        const result = { ...inst, scale_x: s.inst.scale_x, scale_y: s.inst.scale_y, scale_z: s.inst.scale_z };
        if (!moved) return result;
        const anchor = worldToWall(face.frame, { x: inst.position_x, y: inst.position_y, z: inst.position_z });
        const p = wallToWorld(face.frame, round(anchor.u + s.shift.dx), round(anchor.v + s.shift.dy), anchor.d);
        return { ...result, position_x: p.x, position_y: p.y, position_z: p.z };
    });
    if (changed) store.commitLocalChange(next);
    return changed;
}
```

Hinweis: `Rect` und `Offset` sind in `wallArtworks.ts` schon importiert (`import type { LayoutItem, Offset, Rect } from './layout';`).

- [ ] **Step 2: Befehle in `operations.ts`**

Imports ergänzen/ändern:

```ts
import { useEditorStore, type ArtworkInstanceData, type MediumType } from '@/store/editorStore';
import { MAX_PASSEPARTOUT_WIDTH_CM, type FrameStyleId } from '@/lib/frameStyles';
import type { PassepartoutValue } from '@/lib/passepartout';
import { pictureSize } from './footprint';
import { clampScaleFactor, MIN_PICTURE_EDGE } from './scale';
import {
    commitScaledArtworks,
    commitWallOffsets,
    getOpenWallFace,
    isPicture,
    isScalable,
    resizeArtwork,
    scaleArtworks,
    type WallArtwork,
} from './wallArtworks';
```

(Die bisherige Zeile `import { useEditorStore } from '@/store/editorStore';` und `import { commitWallOffsets, getOpenWallFace, type WallArtwork } from './wallArtworks';` werden dadurch ersetzt.)

Am Dateiende anfügen:

```ts
// ── Size, frame and passepartout of the selection ───────────────────────

/** Scales the selection by `factor` about each picture centre (the −5 % / +5 % buttons). */
export function scaleSelection(factor: number): boolean {
    const ctx = selectionContext();
    if (!ctx) return false;
    const scalable = ctx.selected.filter((i) => isScalable(i.inst));
    if (scalable.length === 0) return false;
    const f = clampScaleFactor(factor, scalable.map((i) => pictureSize(i.inst)));
    return commitScaledArtworks(ctx.face, scaleArtworks(ctx.face, scalable.map((i) => i.id), f));
}

/**
 * Sets width or height (metres, without frame) of the one selected artwork. With `keepAspect`
 * (always for beamers) the other side follows.
 */
export function setSelectionPictureSize(axis: 'w' | 'h', metres: number, keepAspect: boolean): boolean {
    const ctx = selectionContext();
    if (!ctx || ctx.selected.length !== 1) return false;
    const item = ctx.selected[0];
    if (!isScalable(item.inst)) return false;
    const current = pictureSize(item.inst);
    const target = Math.max(MIN_PICTURE_EDGE, metres);
    if (keepAspect || item.inst.medium === 'beamer') {
        const factor = clampScaleFactor(target / current[axis], [current]);
        return commitScaledArtworks(ctx.face, scaleArtworks(ctx.face, [item.id], factor));
    }
    return commitScaledArtworks(ctx.face, resizeArtwork(ctx.face, item.id, { ...current, [axis]: target }));
}

/** Applies `change` to the given instances in one undo step. */
function commitInstanceChange(ids: Set<number>, change: (inst: ArtworkInstanceData) => ArtworkInstanceData): boolean {
    const store = useEditorStore.getState();
    let changed = false;
    const next = store.localInstances.map((inst) => {
        if (!ids.has(inst.id)) return inst;
        const updated = change(inst);
        if (updated !== inst) changed = true;
        return updated;
    });
    if (changed) store.commitLocalChange(next);
    return changed;
}

function selectedPictureIds(): Set<number> {
    const ctx = selectionContext();
    return new Set(ctx ? ctx.selected.filter((i) => isPicture(i.inst)).map((i) => i.id) : []);
}

/** Frame style for every picture of the selection; new drops follow it (like the 3D panel). */
export function setSelectionFrameStyle(frameStyle: FrameStyleId): boolean {
    const ids = selectedPictureIds();
    if (ids.size === 0) return false;
    if (frameStyle !== 'none') useEditorStore.getState().setDefaultFrameStyle(frameStyle);
    return commitInstanceChange(ids, (inst) => (inst.frameStyle === frameStyle ? inst : { ...inst, frameStyle }));
}

/** Passepartout for every picture of the selection; new drops follow it (like the 3D panel). */
export function setSelectionPassepartout(value: PassepartoutValue): boolean {
    const ids = selectedPictureIds();
    if (ids.size === 0) return false;
    const width = Math.min(Math.max(value.width, 0), MAX_PASSEPARTOUT_WIDTH_CM);
    const placement = value.placement;
    useEditorStore.getState().setDefaultPassepartout({ width, placement });
    return commitInstanceChange(ids, (inst) => (
        inst.passepartoutWidth === width && inst.passepartoutPlacement === placement
            ? inst
            : { ...inst, passepartoutWidth: width, passepartoutPlacement: placement }
    ));
}

/** Monitor or beamer for the one selected video. */
export function setSelectionMedium(medium: MediumType): boolean {
    const ctx = selectionContext();
    if (!ctx || ctx.selected.length !== 1) return false;
    const item = ctx.selected[0];
    if (item.inst.artwork.asset.type !== 'video') return false;
    return commitInstanceChange(new Set([item.id]), (inst) => (inst.medium === medium ? inst : { ...inst, medium }));
}
```

- [ ] **Step 3: `WallEditorArtworkTab.tsx`**

```tsx
import { useState } from 'react';
import { Link, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useEditorStore, type MediumType } from '@/store/editorStore';
import { FrameControls } from '@/components/properties/FrameControls';
import { DEFAULT_FRAME_STYLE, DEFAULT_PASSEPARTOUT_WIDTH_CM, frameStyleOf } from '@/lib/frameStyles';
import { passepartoutOf } from '@/lib/passepartout';
import { pictureSize } from '@/lib/wallEditor/footprint';
import { SCALE_STEP } from '@/lib/wallEditor/scale';
import { isPicture, isScalable, type WallFace } from '@/lib/wallEditor/wallArtworks';
import {
    scaleSelection,
    setSelectionFrameStyle,
    setSelectionMedium,
    setSelectionPassepartout,
    setSelectionPictureSize,
} from '@/lib/wallEditor/operations';
import { CmInput, Section } from './PanelPrimitives';

const VIDEO_MEDIA: { value: MediumType; label: string }[] = [
    { value: 'monitor', label: 'Monitor' },
    { value: 'beamer', label: 'Beamer' },
];

const secondaryButton = 'h-8 text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700';

/** "Werk" tab of the wall editor panel: size, frame and passepartout of the selected artworks. */
export const WallEditorArtworkTab = ({ face }: { face: WallFace }) => {
    const selection = useEditorStore((s) => s.wallEditorSelection);
    const [aspectLocked, setAspectLocked] = useState(true);

    const selected = face.items.filter((i) => selection.includes(i.id));
    if (selected.length === 0) {
        return <p className="text-xs text-zinc-500">Wähle ein Werk aus, um Größe, Rahmen und Passepartout zu ändern.</p>;
    }

    const single = selected.length === 1 ? selected[0] : null;
    const pictures = selected.filter((i) => isPicture(i.inst));
    const scalableCount = selected.filter((i) => isScalable(i.inst)).length;
    const firstPicture = pictures[0] ?? null;
    const mixedFrames = new Set(pictures.map((i) => frameStyleOf(i.inst.frameStyle))).size > 1;
    const mixedPassepartouts = new Set(pictures.map((i) => {
        const p = passepartoutOf(i.inst);
        return `${p.width}|${p.placement}`;
    })).size > 1;
    const isVideo = single?.inst.artwork.asset.type === 'video';
    const isMonitor = !!single && isVideo && !isScalable(single.inst);
    const isBeamer = single?.inst.medium === 'beamer';
    const size = single ? pictureSize(single.inst) : null;
    const firstPictureSize = firstPicture ? pictureSize(firstPicture.inst) : null;

    const toggleFrame = (framed: boolean) => {
        if (!framed) {
            setSelectionFrameStyle('none');
            return;
        }
        const current = firstPicture ? frameStyleOf(firstPicture.inst.frameStyle) : 'none';
        const remembered = useEditorStore.getState().defaultFrameStyle;
        setSelectionFrameStyle(current !== 'none' ? current : remembered !== 'none' ? remembered : DEFAULT_FRAME_STYLE);
    };

    const togglePassepartout = (on: boolean) => {
        const current = firstPicture ? passepartoutOf(firstPicture.inst) : null;
        const remembered = useEditorStore.getState().defaultPassepartout.width;
        const width = !on ? 0 : current && current.width > 0 ? current.width : remembered > 0 ? remembered : DEFAULT_PASSEPARTOUT_WIDTH_CM;
        setSelectionPassepartout({ width, placement: current?.placement ?? 'center' });
    };

    return (
        <div className="space-y-5">
            {single ? (
                <div className="rounded-md bg-zinc-900 border border-zinc-800 p-2.5 space-y-0.5">
                    <div className="text-sm text-zinc-100 font-medium truncate" title={single.label}>{single.label}</div>
                    {(single.inst.artwork.artist || single.inst.artwork.year) && (
                        <div className="text-[11px] text-zinc-400 truncate">
                            {[single.inst.artwork.artist, single.inst.artwork.year].filter(Boolean).join(', ')}
                        </div>
                    )}
                </div>
            ) : (
                <div className="rounded-md bg-zinc-900 border border-zinc-800 p-2.5 space-y-0.5">
                    <div className="text-sm text-zinc-100 font-medium">{selected.length} Werke</div>
                    {pictures.length > 0 && pictures.length < selected.length && (
                        <div className="text-[11px] text-zinc-500">
                            Rahmen und Passepartout gelten für {pictures.length === 1 ? 'das Bild' : `${pictures.length} Bilder`} der Auswahl.
                        </div>
                    )}
                </div>
            )}

            {single && isVideo && (
                <Section title="Wiedergabe">
                    <select
                        value={isBeamer ? 'beamer' : 'monitor'}
                        onChange={(e) => setSelectionMedium(e.target.value as MediumType)}
                        className="w-full h-8 text-xs bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        {VIDEO_MEDIA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </Section>
            )}

            <Section
                title="Größe"
                aside={single && !isMonitor && !isBeamer ? (
                    <button
                        type="button"
                        onClick={() => setAspectLocked((v) => !v)}
                        title={aspectLocked ? 'Seitenverhältnis lösen' : 'Seitenverhältnis festhalten'}
                        aria-label={aspectLocked ? 'Seitenverhältnis lösen' : 'Seitenverhältnis festhalten'}
                        aria-pressed={aspectLocked}
                        className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                        {aspectLocked ? <Link className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
                    </button>
                ) : undefined}
            >
                {isMonitor ? (
                    <p className="text-xs text-zinc-500">Der Monitor hat eine feste Größe.</p>
                ) : (
                    <>
                        {single && size && (
                            <div className="grid grid-cols-2 gap-2">
                                <CmInput label="Breite" value={size.w} onCommit={(m) => setSelectionPictureSize('w', m, aspectLocked)} />
                                <CmInput label="Höhe" value={size.h} onCommit={(m) => setSelectionPictureSize('h', m, aspectLocked)} />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="secondary" size="sm" disabled={scalableCount === 0} onClick={() => scaleSelection(1 - SCALE_STEP)} className={secondaryButton}>
                                −5 %
                            </Button>
                            <Button variant="secondary" size="sm" disabled={scalableCount === 0} onClick={() => scaleSelection(1 + SCALE_STEP)} className={secondaryButton}>
                                +5 %
                            </Button>
                        </div>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                            {single ? 'Bildmaß ohne Rahmen. ' : ''}Skaliert wird immer um die Bildmitte. Frei skalieren: S drücken oder an einer Ecke der Auswahl ziehen.
                        </p>
                    </>
                )}
            </Section>

            {firstPicture && firstPictureSize && (
                <>
                    <Separator className="bg-zinc-800" />
                    {(mixedFrames || mixedPassepartouts) && (
                        <p className="text-[10px] text-amber-400 leading-relaxed">
                            {mixedFrames ? 'Rahmen: Gemischt. ' : ''}{mixedPassepartouts ? 'Passepartout: Gemischt. ' : ''}Eine Änderung gilt für alle Bilder der Auswahl.
                        </p>
                    )}
                    <FrameControls
                        frameStyle={frameStyleOf(firstPicture.inst.frameStyle)}
                        onFrameToggle={toggleFrame}
                        onFrameStyleChange={setSelectionFrameStyle}
                        passepartout={passepartoutOf(firstPicture.inst)}
                        onPassepartoutToggle={togglePassepartout}
                        onPassepartoutChange={setSelectionPassepartout}
                        pictureCm={{ w: firstPictureSize.w * 100, h: firstPictureSize.h * 100 }}
                    />
                </>
            )}
        </div>
    );
};
```

- [ ] **Step 4: Tab einhängen und automatisch öffnen (`WallEditorPanel.tsx`)**

Import `useState` erweitern und Tab importieren:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
```

```tsx
import { WallEditorArtworkTab } from './WallEditorArtworkTab';
```

`PANEL_TABS`:

```tsx
export const PANEL_TABS: { id: WallEditorPanelTab; label: string }[] = [
    { id: 'arrange', label: 'Anordnen' },
    { id: 'artwork', label: 'Werk' },
    { id: 'guides', label: 'Linien' },
];
```

In `WallEditorPanel` nach der `guideCount`-Zeile (vor `if (!face) return null;`) einfügen:

```tsx
    const selection = useEditorStore((s) => s.wallEditorSelection);
    const selectedCount = face ? face.items.filter((i) => selection.includes(i.id)).length : 0;
    const previousCount = useRef(selectedCount);
    // Selecting something (from nothing) shows its properties — until a tab was picked by hand.
    useEffect(() => {
        const view = useWallEditorView.getState();
        if (previousCount.current === 0 && selectedCount > 0 && !view.panelTabPinned) view.setPanelTab('artwork', false);
        previousCount.current = selectedCount;
    }, [selectedCount]);
```

Den Inhaltsbereich ersetzen:

```tsx
            <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
                {tab === 'artwork' && <WallEditorArtworkTab face={face} />}
                {tab === 'guides' && <WallEditorGuidesTab face={face} />}
                {tab === 'arrange' && <ArrangeTab face={face} />}
            </div>
```

- [ ] **Step 5: Typen, Lint, Tests**

Run: `npx tsc -b && npm run lint && npm run test`
Expected: keine Fehler, Tests grün.

- [ ] **Step 6: Im Browser prüfen**

- Editor öffnen (Tab „Anordnen"), ein Bild anklicken → Tab springt auf „Werk" und zeigt Titel, Breite/Höhe, ±5 %, Rahmen, Passepartout.
- Tab „Linien" von Hand wählen, Auswahl aufheben und neu wählen → Tab bleibt auf „Linien". Editor schließen und wieder öffnen → wieder automatischer Sprung.
- Breite `60` + Enter bei festem Seitenverhältnis → Höhe passt sich an, die Bildmitte bleibt auf der Hängelinie; ⌘/Strg+Z macht das in einem Schritt rückgängig.
- Schloss öffnen, Höhe ändern → nur die Höhe ändert sich.
- +5 % → Bild wird größer um die Mitte; ein Bild direkt über dem Boden wird nach oben geschoben statt in den Boden zu wachsen.
- Zwei Bilder mit verschiedenen Rahmen auswählen → „Rahmen: Gemischt"; Farbe wählen → beide haben den Rahmen; 3D-Panel zeigt beim nächsten Drop denselben Rahmen (Default).
- Video auswählen: Monitor → „Der Monitor hat eine feste Größe."; auf Beamer umstellen → Größe änderbar, kein Schloss.
Screenshots als Beleg (Panel + 3D-Bild nach dem Skalieren, siehe „Voraussetzungen").

- [ ] **Step 7: Commit**

```bash
git add src/lib/wallEditor/wallArtworks.ts src/lib/wallEditor/operations.ts src/components/wall-editor/WallEditorArtworkTab.tsx src/components/wall-editor/WallEditorPanel.tsx
git commit -m "$(cat <<'EOF'
feat: artwork tab in the wall editor panel

Size, frame, passepartout and monitor/beamer of the selection, with
scaling about the picture centre.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Skalieren im Canvas — S und Eck-Griffe

**Files:**
- Modify: `src/components/wall-editor/theme.ts`
- Modify: `src/components/wall-editor/WallEditorOverlay.tsx`
- Modify: `src/components/wall-editor/WallEditorPanel.tsx` (Tastenkürzel)

**Interfaces:**
- Consumes: `scale.ts`, `pictureSize` (Task 9), `scaleArtworks`, `commitScaledArtworks`, `isScalable`, `ScaledArtwork` (Task 10)

- [ ] **Step 1: Griffgröße (`theme.ts`)**

Am Ende anfügen:

```ts
/** Edge length of the corner scale handles (px). */
export const HANDLE_PX = 8;
```

- [ ] **Step 2: Imports und Interaktion im Overlay**

Imports ergänzen:

```ts
import { pictureSize } from '@/lib/wallEditor/footprint';
import {
    OPPOSITE_CORNER,
    clampScaleFactor,
    cornerPoint,
    fineFactor,
    handleScaleFactor,
    modalScaleFactor,
    snapFactorToCm,
    type Corner,
    type Point,
} from '@/lib/wallEditor/scale';
```

Import aus `wallArtworks` ändern zu:

```ts
import {
    commitScaledArtworks,
    commitWallOffsets,
    isScalable,
    removeInstances,
    scaleArtworks,
    type ScaledArtwork,
    type WallArtwork,
    type WallFace,
} from '@/lib/wallEditor/wallArtworks';
```

Theme-Import: `import { GUIDE_HIT_PX, HANDLE_PX, SNAP_PX, WE_COLORS, WE_FONT } from './theme';`

In `type Interaction` ergänzen:

```ts
    | {
        kind: 'scale';
        /** null: modal S gesture that follows the mouse without a pressed button. */
        pointerId: number | null;
        ids: number[];
        /** Wall point the factor is measured from: the selection centre, or the fixed corner (Alt). */
        pivot: Point;
        start: Point;
        /** Corner handle being dragged; null for S. */
        corner: Corner | null;
        /** Alt on a corner handle of a single artwork: it scales about the opposite corner. */
        fixedCorner: boolean;
        factor: number;
        scaled: Map<number, ScaledArtwork>;
    }
```

und nach `type Interaction = …;`:

```ts
type ScaleInteraction = Extract<Interaction, { kind: 'scale' }>;

const SCALE_CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
```

- [ ] **Step 3: Zeiger-Ref, Vorschau-Rechtecke, Live-Warnungen**

Nach `const [pointer, setPointer] = useState<…>(null);` einfügen:

```ts
    // Last pointer position in wall coordinates, for starting S from the keyboard.
    const pointerRef = useRef<{ u: number; v: number } | null>(null);
```

`draft`/`rectOf` ersetzen durch:

```ts
    const draft: Draft | null = interaction?.kind === 'move' || interaction?.kind === 'spacing' ? interaction.offsets : null;
    const scaled = interaction?.kind === 'scale' ? interaction.scaled : null;
    const rectOf = useCallback((item: WallArtwork): Rect => {
        const s = scaled?.get(item.id);
        if (s) return s.rect;
        const o = draft?.get(item.id);
        return o ? translate(item.rect, o.dx, o.dy) : item.rect;
    }, [draft, scaled]);
```

Im `warnings`-`useMemo`: `const r = a.rect;` → `const r = rectOf(a);`, `shrink(b.rect)` → `shrink(rectOf(b))`, Abhängigkeiten `[items, wallRect, openings]` → `[items, wallRect, openings, rectOf]`.

- [ ] **Step 4: Skalier-Logik**

Nach `cancelInteraction` einfügen:

```ts
    const finishScale = useCallback((it: ScaleInteraction) => {
        commitScaledArtworks(face, it.scaled);
        setInter(null);
    }, [face, setInter]);

    const scalableIds = selectedIds.filter((id) => isScalable(itemsById.get(id)!.inst));

    /** New factor and preview for the pointer at `p` (wall coordinates). */
    const updateScale = (it: ScaleInteraction, p: Point, mods: { shift: boolean; cmd: boolean }): ScaleInteraction => {
        let factor = it.corner ? handleScaleFactor(it.pivot, it.start, p) : modalScaleFactor(it.pivot, it.start, p);
        if (mods.shift) factor = fineFactor(factor);
        const first = itemsById.get(it.ids[0]);
        if (first && view.snapping !== mods.cmd) factor = snapFactorToCm(factor, pictureSize(first.inst).w);
        factor = clampScaleFactor(factor, it.ids.map((id) => pictureSize(itemsById.get(id)!.inst)));
        const pivot = it.fixedCorner ? { u: it.pivot.x, v: it.pivot.y } : undefined;
        return { ...it, factor, scaled: scaleArtworks(face, it.ids, factor, pivot) };
    };

    const handleScaleHandlePointerDown = (corner: Corner, e: React.PointerEvent) => {
        if (e.button !== 0 || interactionRef.current || scalableIds.length === 0) return;
        e.stopPropagation();
        rootRef.current?.setPointerCapture(e.pointerId);
        const { x, y } = toLocal(e);
        const box = unionRect(scalableIds.map((id) => itemsById.get(id)!.rect))!;
        const fixedCorner = e.altKey && scalableIds.length === 1;
        const pivot = fixedCorner ? cornerPoint(box, OPPOSITE_CORNER[corner]) : { x: centerX(box), y: centerY(box) };
        setInter({
            kind: 'scale', pointerId: e.pointerId, ids: scalableIds, pivot, start: { x: vt.toWallU(x), y: vt.toWallV(y) },
            corner, fixedCorner, factor: 1, scaled: scaleArtworks(face, scalableIds, 1),
        });
    };
```

- [ ] **Step 5: Pointer-Handler**

Ganz am Anfang von `handlePointerDown` (vor `if (interactionRef.current) return;`) einfügen:

```ts
        // Modal S: left click confirms, any other button cancels.
        const current = interactionRef.current;
        if (current?.kind === 'scale' && current.pointerId === null) {
            e.preventDefault();
            if (e.button === 0) finishScale(current);
            else setInter(null);
            return;
        }
```

In `handlePointerMove` direkt nach `setPointer({ u, v });`:

```ts
        pointerRef.current = { u, v };
```

und direkt nach `const it = interactionRef.current;`:

```ts
        if (it?.kind === 'scale' && it.pointerId === null) {
            setInter(updateScale(it, { x: u, y: v }, { shift: e.shiftKey, cmd: e.metaKey || e.ctrlKey }));
            return;
        }
```

Im `switch (it.kind)` von `handlePointerMove` ergänzen:

```ts
            case 'scale': {
                setInter(updateScale(it, { x: u, y: v }, { shift: e.shiftKey, cmd: e.metaKey || e.ctrlKey }));
                return;
            }
```

Im `switch (it.kind)` von `handlePointerUp` ergänzen:

```ts
            case 'scale':
                commitScaledArtworks(face, it.scaled);
                break;
```

Im `onPointerLeave`-Block zusätzlich `pointerRef.current = null;`.

- [ ] **Step 6: Tastatur**

Im `onKeyDown` des Keyboard-Effekts direkt nach dem `if (key === 'Escape') { … }`-Block einfügen:

```ts
            const active = interactionRef.current;
            if (active?.kind === 'scale') {
                if (key === 'Enter' && active.pointerId === null) {
                    e.preventDefault();
                    finishScale(active);
                }
                return; // no other shortcuts while scaling
            }
```

und direkt vor `if (lower === 'v') { view.setTool('select'); return; }` einfügen:

```ts
            if (lower === 's' && !e.shiftKey && !e.altKey && !active) {
                const scalable = ids.filter((id) => isScalable(itemsById.get(id)!.inst));
                if (scalable.length === 0) return;
                e.preventDefault();
                const box = unionRect(scalable.map((id) => itemsById.get(id)!.rect))!;
                const pivot = { x: centerX(box), y: centerY(box) };
                const p = pointerRef.current;
                // From the pointer; from the box corner when the pointer is outside or on the centre.
                const onCentre = !p || Math.hypot(p.u - pivot.x, p.v - pivot.y) * view.pxPerM < 8;
                const start = onCentre ? { x: right(box), y: top(box) } : { x: p.u, y: p.v };
                setInter({
                    kind: 'scale', pointerId: null, ids: scalable, pivot, start,
                    corner: null, fixedCorner: false, factor: 1, scaled: scaleArtworks(face, scalable, 1),
                });
                return;
            }
```

Die Abhängigkeiten des Keyboard-Effekts `[face, items, itemsById, wallRect, cancelInteraction]` → `[face, items, itemsById, wallRect, cancelInteraction, finishScale, setInter]`.

- [ ] **Step 7: Cursor, Maß-Pill, Griffe**

Cursor: nach `if (interaction?.kind === 'pan') cursor = 'grabbing';` einfügen:

```ts
    else if (interaction?.kind === 'scale') {
        cursor = interaction.corner === null ? 'crosshair' : interaction.corner === 'nw' || interaction.corner === 'se' ? 'nwse-resize' : 'nesw-resize';
    }
```

Vor dem `return (` einfügen:

```ts
    let scaleLabel: string | null = null;
    if (interaction?.kind === 'scale') {
        const first = itemsById.get(interaction.ids[0]);
        if (first) {
            const size = pictureSize(first.inst);
            scaleLabel = `${formatCm(size.w * interaction.factor, false)} × ${formatCm(size.h * interaction.factor)} · ${Math.round(interaction.factor * 100)} %`;
        }
    }
    const scaleBox = unionRect(scalableIds.map((id) => rectOf(itemsById.get(id)!)));
    const showScaleHandles = effectiveTool === 'select' && !!scaleBox
        && (!interaction || (interaction.kind === 'scale' && interaction.corner !== null));
```

In der Selektionsbox die Größen-Pill ändern: `text={\`${formatCm(selectionBox.w, false)} × ${formatCm(selectionBox.h)}\`}` → 

```tsx
                            text={scaleLabel ?? `${formatCm(selectionBox.w, false)} × ${formatCm(selectionBox.h)}`}
```

Direkt nach `{spacingHandles}` einfügen:

```tsx
                {/* Corner handles: scale about the centre (Alt: opposite corner fixed) */}
                {showScaleHandles && scaleBox && SCALE_CORNERS.map((corner) => {
                    const p = cornerPoint(scaleBox, corner);
                    return (
                        <rect
                            key={corner}
                            x={sx(p.x) - HANDLE_PX / 2}
                            y={sy(p.y) - HANDLE_PX / 2}
                            width={HANDLE_PX}
                            height={HANDLE_PX}
                            fill="#fff"
                            stroke={WE_COLORS.select}
                            strokeWidth={1.5}
                            pointerEvents="auto"
                            style={{ cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                            onPointerDown={(e) => handleScaleHandlePointerDown(corner, e)}
                        />
                    );
                })}
```

- [ ] **Step 8: Tastenkürzel im Panel**

In `SHORTCUTS` (`WallEditorPanel.tsx`) nach `['V / H / M', …]` einfügen:

```ts
    ['S', 'Skalieren (Klick/Enter übernimmt)'],
    ['⇧ beim Skalieren', 'Fein'],
    ['Alt an Eck-Griff', 'Gegenüberliegende Ecke fest'],
```

- [ ] **Step 9: Typen, Lint, Tests**

Run: `npx tsc -b && npm run lint && npm run test`
Expected: keine Fehler.

- [ ] **Step 10: Im Browser prüfen**

- Ein Bild wählen → vier weiße Eck-Griffe. Griff ziehen → blauer Umriss wächst um die Mitte, Pill „60 × 80 cm · 112 %", Warnrahmen erscheinen live bei Überlappung; loslassen → Werk hat die neue Größe, ⌘/Strg+Z nimmt es in einem Schritt zurück.
- Mit Alt am Griff (Einzelauswahl) → gegenüberliegende Ecke bleibt stehen.
- S drücken (Maus über dem Canvas) → Maus vom Mittelpunkt weg vergrößert, hin verkleinert; ⇧ fein; ⌘/Strg schaltet cm-Einrasten um; Klick oder Enter übernimmt, Esc oder Rechtsklick bricht ab (Werk unverändert).
- Während S: V/H/M/Pfeiltasten tun nichts.
- Mehrfachauswahl mit S → alle skalieren um ihre eigene Mitte.
- Auswahl nur mit Monitor → keine Griffe, S tut nichts.
- 3D-Ansicht danach: Größe stimmt, Rahmenprofil nicht verzerrt (sichtbares Pane oder headless Chrome).
Screenshots als Beleg.

- [ ] **Step 11: Commit**

```bash
git add src/components/wall-editor/theme.ts src/components/wall-editor/WallEditorOverlay.tsx src/components/wall-editor/WallEditorPanel.tsx
git commit -m "$(cat <<'EOF'
feat: scale artworks in the wall editor with S and corner handles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Doku und Abschlussprüfung

**Files:**
- Modify: `src/wiki/2d-wall-editor.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Wiki (`src/wiki/2d-wall-editor.md`)**

Abschnitt `## Ausrichten, verteilen, Abstände`: den Satz „Das rechte Panel arbeitet immer mit der aktuellen Auswahl:" ersetzen durch „Das rechte Panel hat drei Tabs: **Anordnen**, **Werk** und **Linien**. Unter **Anordnen** arbeitest du mit der aktuellen Auswahl:".

Nach diesem Abschnitt einfügen:

```markdown
## Größe, Rahmen und Passepartout

Der Tab **Werk** zeigt die Eigenschaften der Auswahl. Er öffnet sich von selbst, sobald du etwas auswählst – außer du hast in dieser Sitzung schon selbst einen Tab gewählt.

- **Breite** und **Höhe** setzen das Bildmaß ohne Rahmen. Das Kettenglied hält das Seitenverhältnis fest.
- **−5 %** und **+5 %** verkleinern oder vergrößern alle ausgewählten Werke.
- **S** skaliert frei mit der Maus: vom Mittelpunkt weg wird die Auswahl größer, zu ihm hin kleiner. Klick oder **Enter** übernimmt, **Esc** bricht ab, **⇧** skaliert fein, **⌘/Strg** schaltet das Einrasten auf ganze Zentimeter um.
- An den **Ecken** der Auswahl ziehst du die Größe direkt. Mit **Alt** bleibt bei einem einzelnen Werk die gegenüberliegende Ecke stehen.
- Skaliert wird immer um die Bildmitte, damit ein Werk auf der Hängehöhe bleibt. Monitore haben eine feste Größe.
- **Rahmen** und **Passepartout** funktionieren wie im 3D-Panel. Bei mehreren Werken gilt eine Änderung für alle ausgewählten Bilder; „Gemischt" zeigt an, dass sie bisher verschieden sind.
```

Abschnitt `## Hängehöhe`, ersten Absatz ersetzen durch:

```markdown
Die gestrichelte Linie zeigt die Hängehöhe – die Höhe der Bildmitte über dem Boden, standardmäßig 145 cm. Sie gilt für die ganze Ausstellungsversion und wird mit ihr gespeichert, auch für alle Mitkurator:innen. Du änderst sie unter **Anordnen → Hängung** oder ziehst die Linie direkt nach oben oder unten (ganze Zentimeter, mit **Alt** millimetergenau).
```

Abschnitt `## Lineale, Hilfslinien und Messen`, den zweiten Punkt („Ziehst du aus einem Lineal …") ersetzen durch:

```markdown
- Ziehst du aus dem **oberen Lineal** nach unten, entsteht eine **waagrechte** Hilfslinie, aus dem **linken Lineal** eine **senkrechte**. Werke rasten an ihnen ein. Zurück auf das Lineal gezogen verschwindet eine Linie wieder.
- Hilfslinien gehören zur jeweiligen Wandfläche und werden mit der Ausstellungsversion gespeichert.
- Im Tab **Linien** stehen alle Hilfslinien der Fläche: Werte eintippen (waagrecht ab Boden, senkrecht ab der linken Wandkante), mit ⇄ die Richtung wechseln, einzeln oder alle löschen, neue anlegen oder eine senkrechte Linie auf die **Wandmitte** setzen. Das Auge blendet alle Linien aus, das Schloss sperrt Hilfslinien und Hängelinie gegen versehentliches Verschieben.
```

In der Tabelle `## Tastenkürzel` nach der Zeile `` | `V` / `H` / `M` | … | `` einfügen:

```markdown
| `S` | Auswahl skalieren (Klick/`Enter` übernimmt, `Esc` bricht ab) |
| `Alt` an einer Ecke | Gegenüberliegende Ecke bleibt stehen |
```

- [ ] **Step 2: CLAUDE.md**

Unter `### Frontend (root directory)` nach `- \`npm run lint\` — ESLint` einfügen:

```markdown
- `npm run test` — Vitest (pure logic in `src/lib/**/*.test.ts`)
```

Im Abschnitt `### 2D Wall Editor` am Ende der Liste anfügen:

```markdown
- Hanging height and ruler guides are stored per exhibition version (`ExhibitionVersion.hanging_height`, default 1.45 m, and `wall_guides`, keyed by `targetKey`). `lib/wallEditor/layoutSync.ts` (started by EditorPage) loads them from `GET …/versions/:vid/wall-layout` and PATCHes the full state 300 ms after a change; it never dispatches editor actions. Guides: `axis 'h'` = horizontal, value above the face's floor; `'v'` = vertical, value from its left edge (`lib/wallEditor/guides.ts`). Top ruler → horizontal guide, left ruler → vertical guide. Temporary → real wall ids and deleted walls reach the guides through `lib/wallEvents.ts`; the server rewrites the keys when versions are copied or merged (`server/src/lib/wallGuides.ts`).
- The panel has tabs Anordnen / Werk / Linien (`panelTab` in wallEditorViewStore; a selection switches to Werk until a tab is picked by hand). Scaling (S modal, corner handles, ±5 %, W×H fields) is always about the picture centre (Alt on a handle: opposite corner fixed), monitors excluded; math in `lib/wallEditor/scale.ts`, the preview is drawn by the overlay and committed once (`scaleArtworks` → `commitScaledArtworks`), because frame profiles come from instance data and a scaled group would stretch them.
```

- [ ] **Step 3: Gesamte Prüfung**

Run: `npm run lint && npm run build && npm run test && (cd server && npm run build && npm test)`
Expected: alles grün.

- [ ] **Step 4: Abschlussrunde im Browser**

Einmal durch die Spec-Punkte 1–4 (Spec Abschnitt 6, „Verifikation vor Abschluss"): Lineal-Richtungen, Tab „Linien" komplett, Hängelinie ziehen, S und Griffe (einzeln, mehrfach, Alt), Tab „Werk" (einzeln, mehrfach, Video), Neuladen → Linien und Hängehöhe noch da, Version speichern → Linien an den richtigen Wänden. Zusätzlich im 3D-Editor: Properties-Panel eines Bildes unverändert, First-Person-Modus kurz testen (Hinweis aus CLAUDE.md). Screenshots an den User schicken.

- [ ] **Step 5: Commit**

```bash
git add src/wiki/2d-wall-editor.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: wall editor fine-tuning in the wiki and CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
