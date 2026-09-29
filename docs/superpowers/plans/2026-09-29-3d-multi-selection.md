# Mehrfachauswahl im 3D-Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mehrere Werke im 3D-Editor auswählen (⇧-Klick, ⇧-Rahmen, Cmd/Strg+A, Liste „Im Raum“) und gemeinsam verschieben, drehen, skalieren, löschen, duplizieren, rahmen, ausrichten und verteilen.

**Architecture:** `editorStore` bekommt `selectedInstanceIds` neben dem bestehenden primären `selectedInstanceId`; beide werden nur über eine Action gesetzt. Reine Module (`selectionTransform`, `selectionOperations`, `instanceBounds`) tragen die Rechnung und sind mit vitest getestet; React/R3F-Komponenten (`SelectionPivot`, `SelectionMarquee`, `MultiSelectionPanel`, `PlacedArtworkList`) verdrahten sie. Jede Gruppenaktion ist genau ein `commitLocalChange` (ein Undo-Schritt), Auto-Sync PATCHt/POSTet wie bisher.

**Tech Stack:** React 19, R3F 9, drei 10 (`TransformControls`), Three.js r186, Zustand 5, Tailwind, vitest (neu).

**Spec:** `docs/superpowers/specs/2026-09-29-3d-multi-selection-design.md`

## Global Constraints

- UI-Sprache Deutsch; alle neuen Texte, Tooltips, Toasts deutsch.
- TypeScript strict, kein `any`, `erasableSyntaxOnly` (keine enums/parameter properties).
- Three.js-Objekte nie im Render erzeugen — `useMemo`/Refs.
- Zustand-Selektoren einzeln; Objekt-/Array-Selektoren mit `useShallow` oder primitive Rückgabe.
- Neue IDs für Kopien über `nextTempId()` (`src/store/editorStore.ts`).
- Keine Store-Mutation pro Frame während Transforms; Three.js-Gruppen direkt bewegen, einmal committen.
- Einzelobjekt-Verhalten (Klick, Gizmo bei einem Werk, Panel bei einem Werk) bleibt unverändert.
- `npm run lint` darf in geänderten Dateien keine neuen Fehler zeigen; `npm run build` grün.

**Abweichung von der Spec:** `ModalTransformSystem` ist nirgends gemountet — G/R/S schalten heute nur den Gizmo-Modus. Gruppen-Transform läuft daher ausschließlich über das Gizmo; `ModalTransformSystem` bleibt unangetastet.

## Review Focus

1. Gruppe mit einem Werk, dessen Mesh noch nicht geladen ist (3D-Modell/Splat lädt) → Bounds-Fallback statt NaN; Pivot/Marquee/Ausrichten dürfen nicht crashen. (Task 4 Test „fallback bounds“)
2. Auswahl enthält eine Temp-ID, die während des Transforms durch die echte ID ersetzt wird → Commit darf das Werk nicht verlieren. (Task 1 Test „temp id remap“; Task 3 committet über aktuelle IDs aus dem Store)
3. Undo/Redo nach Gruppenaktion → genau ein Schritt, Auswahl geleert (Werke könnten fehlen). (Task 1 Test „undo clears selection“)
4. ⇧-Ziehen, das auf einem Werk startet und endet → darf nicht zusätzlich als ⇧-Klick toggeln. (Task 5, `consumeMarqueeClick`)
5. Verteilen mit weniger als 3 Werken bzw. Ausrichten mit 1 Werk → no-op, kein Commit. (Task 6 Tests „no-op“)

---

### Task 1: vitest + Auswahl-Modell im Store

**Files:**
- Modify: `package.json` (devDependency `vitest`, Script `test`)
- Create: `vitest.config.ts`
- Modify: `src/store/editorStore.ts`
- Test: `src/store/editorStore.selection.test.ts`

**Interfaces:**
- Produces:
  - `EditorState.selectedInstanceIds: number[]`
  - `setInstanceSelection(ids: number[], primary?: number | null): void`
  - `toggleInstanceInSelection(id: number): void`
  - `pickInstance(id: number, additive: boolean): void` — Klick-Einstieg für alle Instanz-Komponenten
  - `selectAllInstances(): void`
  - `deleteSelectedInstance()` löscht alle ausgewählten Werke
  - exportierte Hilfe `clearInstanceSelection = { selectedInstanceId: null, selectedInstanceIds: [] }`

- [ ] **Step 1: vitest installieren**

Run: `npm install -D vitest@^3.2`
`package.json` scripts: `"test": "vitest run"`.

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 2: Failing tests schreiben** (`src/store/editorStore.selection.test.ts`)

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore, type ArtworkInstanceData } from './editorStore';

const inst = (id: number): ArtworkInstanceData => ({
  id, artwork: { asset: { path: '', width: 100, height: 100, dpi: 72, type: 'image' } },
  position_x: 0, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1,
});

beforeEach(() => {
  useEditorStore.setState({
    localInstances: [inst(1), inst(2), inst(3)], pastInstances: [], futureInstances: [],
    selectedInstanceId: null, selectedInstanceIds: [], selectedWallId: null, selectedZoneId: null,
    wallEditor: null, wallEditorSelection: [],
  });
});

describe('instance selection', () => {
  it('selectInstance keeps primary and array in sync', () => {
    useEditorStore.getState().selectInstance(2);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([2]);
    expect(useEditorStore.getState().selectedInstanceId).toBe(2);
    useEditorStore.getState().selectInstance(null);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([]);
    expect(useEditorStore.getState().selectedInstanceId).toBeNull();
  });

  it('pickInstance additive toggles and moves primary', () => {
    const s = useEditorStore.getState();
    s.pickInstance(1, false);
    s.pickInstance(3, true);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([1, 3]);
    expect(useEditorStore.getState().selectedInstanceId).toBe(3);
    useEditorStore.getState().pickInstance(3, true);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([1]);
    expect(useEditorStore.getState().selectedInstanceId).toBe(1);
  });

  it('setInstanceSelection drops unknown ids and dedupes', () => {
    useEditorStore.getState().setInstanceSelection([2, 2, 99, 1]);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([2, 1]);
    expect(useEditorStore.getState().selectedInstanceId).toBe(1);
  });

  it('selectWall and selectZone clear the artwork selection', () => {
    useEditorStore.getState().setInstanceSelection([1, 2]);
    useEditorStore.getState().selectWall(5);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([]);
    useEditorStore.getState().setInstanceSelection([1, 2]);
    useEditorStore.getState().selectZone(5);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([]);
  });

  it('selectAllInstances selects every artwork', () => {
    useEditorStore.getState().selectAllInstances();
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([1, 2, 3]);
  });

  it('deleteSelectedInstance removes all selected in one undo step', () => {
    useEditorStore.getState().setInstanceSelection([1, 3]);
    useEditorStore.getState().deleteSelectedInstance();
    const s = useEditorStore.getState();
    expect(s.localInstances.map(i => i.id)).toEqual([2]);
    expect(s.pastInstances).toHaveLength(1);
    expect(s.selectedInstanceIds).toEqual([]);
  });

  it('undo clears selection', () => {
    useEditorStore.getState().setInstanceSelection([1, 2]);
    useEditorStore.getState().deleteSelectedInstance();
    useEditorStore.getState().setInstanceSelection([3]);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([]);
    expect(useEditorStore.getState().selectedInstanceId).toBeNull();
  });

  it('setActiveVersion clears selection', () => {
    useEditorStore.getState().setInstanceSelection([1, 2]);
    useEditorStore.getState().setActiveVersion(7);
    expect(useEditorStore.getState().selectedInstanceIds).toEqual([]);
  });
});
```

(Temp-ID-Remap lebt im Auto-Sync-Netzpfad; dort wird die Array-Ersetzung neben der bestehenden `selectedInstanceId`-Zeile ergänzt — über die reine Hilfsfunktion `remapSelection(ids, from, to)`, die hier mitgetestet wird:)

```ts
import { remapSelection } from './editorStore';
it('temp id remap replaces the id in the selection', () => {
  expect(remapSelection([-3, 5], -3, 12)).toEqual([12, 5]);
  expect(remapSelection([5], -3, 12)).toEqual([5]);
});
```

- [ ] **Step 3: Tests laufen lassen → FAIL** (`npm test`) — `pickInstance is not a function` o. ä. Falls der Store-Import in Node scheitert (localStorage/window), betroffene Stelle mit `typeof window !== 'undefined'`-Guard absichern.

- [ ] **Step 4: Store implementieren** (`src/store/editorStore.ts`)

State-Interface nach `selectedInstanceId`:

```ts
  /** All selected artworks (3D editor). `selectedInstanceId` is the primary one and always part of it. */
  selectedInstanceIds: number[];
```

Actions im Interface nach `selectZone`:

```ts
  /** Sets the artwork selection; `primary` defaults to the last id. Clears wall/zone selection. */
  setInstanceSelection: (ids: number[], primary?: number | null) => void;
  toggleInstanceInSelection: (id: number) => void;
  /** Click on an artwork: replace the selection, or toggle it with ⇧. */
  pickInstance: (id: number, additive: boolean) => void;
  selectAllInstances: () => void;
```

Modul-Helfer (oberhalb `create`):

```ts
export const clearInstanceSelection = { selectedInstanceId: null, selectedInstanceIds: [] as number[] };

/** Selection fields for `ids` (deduped, only existing artworks); primary defaults to the last. */
function instanceSelection(ids: number[], instances: ArtworkInstanceData[], primary?: number | null) {
  const known = new Set(instances.map(i => i.id));
  const unique = [...new Set(ids)].filter(id => known.has(id));
  const main = primary != null && unique.includes(primary) ? primary : unique[unique.length - 1] ?? null;
  return { selectedInstanceIds: unique, selectedInstanceId: main };
}

export const remapSelection = (ids: number[], from: number, to: number) =>
  ids.includes(from) ? ids.map(id => (id === from ? to : id)) : ids;
```

Defaults: `selectedInstanceIds: [],`.

Actions:

```ts
  selectInstance: (id) => set((state) => ({
    ...(id === null ? clearInstanceSelection : instanceSelection([id], state.localInstances)),
    selectedWallId: null, selectedZoneId: null,
  })),
  selectWall: (id) => set({ selectedWallId: id, ...clearInstanceSelection, selectedZoneId: null }),
  selectZone: (id) => set({ selectedZoneId: id, ...clearInstanceSelection, selectedWallId: null }),
  setInstanceSelection: (ids, primary) => set((state) => ({
    ...instanceSelection(ids, state.localInstances, primary),
    selectedWallId: null, selectedZoneId: null,
  })),
  toggleInstanceInSelection: (id) => set((state) => {
    const has = state.selectedInstanceIds.includes(id);
    const ids = has ? state.selectedInstanceIds.filter(i => i !== id) : [...state.selectedInstanceIds, id];
    const primary = has ? (state.selectedInstanceId === id ? undefined : state.selectedInstanceId) : id;
    return { ...instanceSelection(ids, state.localInstances, primary), selectedWallId: null, selectedZoneId: null };
  }),
  pickInstance: (id, additive) => {
    if (additive) get().toggleInstanceInSelection(id);
    else get().selectInstance(id);
  },
  selectAllInstances: () => set((state) => ({
    ...instanceSelection(state.localInstances.map(i => i.id), state.localInstances, state.selectedInstanceId),
    selectedWallId: null, selectedZoneId: null,
  })),
```

(`create` muss `(set, get)` nehmen, falls es heute nur `set` nutzt.)

`deleteSelectedInstance`:

```ts
  deleteSelectedInstance: () => set((state) => {
    if (state.selectedInstanceIds.length === 0) return state;
    const doomed = new Set(state.selectedInstanceIds);
    localEditSeq++;
    return {
      pastInstances: [...state.pastInstances, state.localInstances].slice(-MAX_HISTORY_SIZE),
      localInstances: state.localInstances.filter(inst => !doomed.has(inst.id)),
      futureInstances: [],
      hasUnsavedChanges: true,
      ...clearInstanceSelection,
      transformAxisLock: 'none',
    };
  }),
```

Überall `selectedInstanceId: null` → `...clearInstanceSelection` ersetzen: `setActiveProject`, `setActiveVersion`, `setLocalInstances`, `undo`, `redo`, `openWallEditor`, `closeWallEditor`.

Auto-Sync-Temp-ID-Ersatz (bei `selectedInstanceId: current.selectedInstanceId === inst.id ? …`) ergänzen:

```ts
            selectedInstanceIds: remapSelection(current.selectedInstanceIds, inst.id, created.id),
```

- [ ] **Step 5: `npm test` → PASS; `npx tsc -b` grün.**

- [ ] **Step 6: Commit** `feat: multi-selection state in the editor store`

---

### Task 2: ⇧-Klick, Cmd+A, Hervorhebung, Tasten/Toolbar

**Files:**
- Modify: `src/components/SelectableInstance.tsx:75-79`, `src/components/VideoInstance.tsx:207-211`, `src/components/ModelInstance.tsx:87-90`, `src/components/SplatInstance.tsx:88-91`
- Modify: `src/components/PlacedArtworks.tsx:38` (InstanceSlot)
- Modify: `src/pages/EditorPage.tsx` (Keys, Toolbar, `openWallEditorForSelection`, `canOpenWallEditor`, `isMonitorSelected`)
- Create: `src/lib/selectionFaces.ts` + Test `src/lib/selectionFaces.test.ts`

**Interfaces:**
- Consumes: `pickInstance`, `selectAllInstances`, `selectedInstanceIds` (Task 1)
- Produces: `commonFaceTarget(instances: ArtworkInstanceData[], walls: ModularWallData[], roomFaces: RoomFace[]): WallEditorTarget | null` — gemeinsame Fläche aller Werke oder `null`.

- [ ] **Step 1: Failing test** (`src/lib/selectionFaces.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { commonFaceTarget } from './selectionFaces';
import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';

const wall = { id: 1, position_x: 0, position_y: 1.5, position_z: 0, rotation_y: 0, width: 4, height: 3, thickness: 0.1 } as ModularWallData;
const pic = (id: number, z: number, wallId: number | null = 1): ArtworkInstanceData => ({
  id, wallId, artwork: { asset: { path: '', width: 100, height: 100, dpi: 72, type: 'image' } },
  position_x: 0, position_y: 1.5, position_z: z, rotation_x: 0, rotation_y: z > 0 ? 0 : Math.PI, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1,
});

describe('commonFaceTarget', () => {
  it('returns the face when all artworks hang on it', () => {
    expect(commonFaceTarget([pic(1, 0.06), pic(2, 0.06)], [wall], [])).toEqual({ kind: 'wall', wallId: 1, side: 'front' });
  });
  it('returns null for artworks on different faces', () => {
    expect(commonFaceTarget([pic(1, 0.06), pic(2, -0.06)], [wall], [])).toBeNull();
  });
  it('returns null for an empty selection', () => {
    expect(commonFaceTarget([], [wall], [])).toBeNull();
  });
});
```

(Seitenbestimmung prüfen gegen `sideOfInstance` in `src/lib/wallEditor/geometry.ts`; falls `front` die −Z-Seite ist, Erwartungen tauschen — die Funktion selbst leitet nur aus `targetForInstance` ab.)

- [ ] **Step 2: `npm test` → FAIL (module not found).**

- [ ] **Step 3: Implementieren** (`src/lib/selectionFaces.ts`)

```ts
import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { targetForInstance, targetKey, type WallEditorTarget } from './wallEditor/faces';
import type { RoomFace } from './wallEditor/roomFaces';

/** The wall face every artwork hangs on, or null when they are spread over several (or none). */
export function commonFaceTarget(
  instances: ArtworkInstanceData[], walls: ModularWallData[], roomFaces: RoomFace[],
): WallEditorTarget | null {
  let common: WallEditorTarget | null = null;
  for (const inst of instances) {
    const target = targetForInstance(inst, walls, roomFaces);
    if (!target) return null;
    if (common && targetKey(common) !== targetKey(target)) return null;
    common = target;
  }
  return common;
}
```

(`RoomFace`-Importpfad aus `faces.ts` übernehmen.)

- [ ] **Step 4: Klick-Handler** — in allen vier Instanz-Komponenten:

```ts
        const pickInstance = useEditorStore((state) => state.pickInstance);
        …
        const handleClick = (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (consumeMarqueeClick()) return;
            pickInstance(instance.id, e.nativeEvent.shiftKey);
        };
```

`consumeMarqueeClick` kommt aus `src/lib/selectionBridge.ts` (Task 5 legt die Datei an; hier zunächst mit Stub anlegen):

```ts
let suppressClick = false;
/** Marks the click that ends a ⇧-drag marquee so it does not also toggle an artwork. */
export function suppressNextClick(): void { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); }
export function consumeMarqueeClick(): boolean { const s = suppressClick; suppressClick = false; return s; }
```

`selectInstance`-Selektor in diesen Komponenten entfernen, wo danach unbenutzt.

- [ ] **Step 5: Hervorhebung** (`PlacedArtworks.tsx` InstanceSlot):

```ts
    const selected = useEditorStore((state) => isEditor && state.selectedInstanceIds.includes(instance.id));
```

`forceMax` in `SelectableInstance` bleibt an `selected` gekoppelt, aber nur für das primäre Werk: in `SelectableInstance` zusätzlich

```ts
        const isPrimary = useEditorStore((state) => state.selectedInstanceId === instance.id);
        … forceMax: isEditor && isPrimary,
```

- [ ] **Step 6: EditorPage Tasten/Toolbar**

- `hasSelection` → `store.selectedInstanceIds.length > 0 || !!store.selectedWallId || !!store.selectedZoneId`.
- Neu vor `switch (key)`: Cmd/Strg+A

```ts
      if (cmdOrCtrl && key === 'a') {
        e.preventDefault();
        store.selectAllInstances();
        return;
      }
```

- `case 's'`: Monitor-Prüfung über alle:

```ts
            if (store.localInstances.some(i => store.selectedInstanceIds.includes(i.id) && i.medium === 'monitor')) break;
```

- `case 'x'|'y'|'z'` und `delete/backspace`: Bedingung `store.selectedInstanceIds.length > 0`.
- Selektoren: `const hasInstanceSelection = useEditorStore((s) => s.selectedInstanceIds.length > 0);` ersetzt `selectedInstanceId` in den Toolbar-`disabled`-Props; `isMonitorSelected` prüft alle ausgewählten.
- `openWallEditorForSelection` und `canOpenWallEditor`: statt primärem Werk `commonFaceTarget(selectedInstances, …)`; `openWallEditor(target, selectedInstanceIds)`.

- [ ] **Step 7: `npm test`, `npx tsc -b`, `npx eslint` auf geänderte Dateien → grün.**

- [ ] **Step 8: Commit** `feat: shift-click and select-all for artworks in the 3D editor`

---

### Task 3: Gruppen-Transform per Gizmo

**Files:**
- Create: `src/lib/instanceTransform.ts` (Einzel-Finalisierung, aus `InstanceTransformControls` extrahiert)
- Create: `src/lib/selectionTransform.ts`
- Create: `src/components/SelectionPivot.tsx`
- Modify: `src/components/InstanceTransformControls.tsx`
- Test: `src/lib/selectionTransform.test.ts`

**Interfaces:**
- Produces:
  - `detachIfOffWall(inst: ArtworkInstanceData, walls: ModularWallData[]): ArtworkInstanceData`
  - `finalizeInstanceTransform(inst, object: THREE.Object3D, mode: TransformMode, walls): ArtworkInstanceData`
  - `applyGroupDelta(start: THREE.Matrix4, pivotStart: THREE.Matrix4, pivotNow: THREE.Matrix4, mode: TransformMode, out: THREE.Matrix4): THREE.Matrix4`
  - `floorDeltaLimit(minYs: number[], bottoms: number[]): number` — kleinstes erlaubtes Y-Delta der Gruppe
  - `selectionPivotStore` nicht nötig; Pivot-Objekt lebt in `SelectionPivot` und wird per Ref an `InstanceTransformControls` gegeben.

- [ ] **Step 1: Failing tests** (`src/lib/selectionTransform.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyGroupDelta, floorDeltaLimit } from './selectionTransform';

const m = (x: number, y: number, z: number, rotY = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(s, s, s));
const pos = (mat: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(mat);

describe('applyGroupDelta', () => {
  it('translate moves every member by the pivot delta', () => {
    const out = applyGroupDelta(m(1, 1.5, 0), m(0, 1.5, 0), m(2, 1.5, 3), 'translate', new THREE.Matrix4());
    expect(pos(out).toArray().map(v => +v.toFixed(6))).toEqual([3, 1.5, 3]);
  });

  it('rotate turns members around the pivot and turns them too', () => {
    const out = applyGroupDelta(m(1, 0, 0), m(0, 0, 0), m(0, 0, 0, Math.PI / 2), 'rotate', new THREE.Matrix4());
    const p = pos(out);
    expect(p.x).toBeCloseTo(0); expect(p.z).toBeCloseTo(-1);
    const q = new THREE.Quaternion(); out.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    expect(new THREE.Euler().setFromQuaternion(q).y).toBeCloseTo(Math.PI / 2);
  });

  it('scale scales each member about its own centre and keeps positions', () => {
    const out = applyGroupDelta(m(1, 1, 0), m(0, 1, 0), m(0, 1, 0, 0, 2), 'scale', new THREE.Matrix4());
    const s = new THREE.Vector3(); out.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    expect(s.x).toBeCloseTo(2);
    expect(pos(out).x).toBeCloseTo(1);
  });
});

describe('floorDeltaLimit', () => {
  it('is the largest downward move that keeps every member above its minimum', () => {
    // member bottoms at 0.5 and 0.2 above their min Y → group may move down by 0.2
    expect(floorDeltaLimit([1.0, 0.8], [1.5, 1.0])).toBeCloseTo(-0.2);
  });
});
```

- [ ] **Step 2: `npm test` → FAIL.**

- [ ] **Step 3: `src/lib/selectionTransform.ts`**

```ts
import * as THREE from 'three';
import type { TransformMode } from '@/store/editorStore';

const _inv = new THREE.Matrix4();
const _delta = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _ps = new THREE.Vector3();
const _pss = new THREE.Vector3();

/**
 * World matrix of a group member after the pivot moved from `pivotStart` to `pivotNow`.
 * translate/rotate carry the member rigidly with the pivot (the arrangement keeps its shape);
 * scale multiplies each member's own scale by the pivot's scale factor and leaves positions —
 * otherwise pictures would wander off their walls.
 */
export function applyGroupDelta(
  start: THREE.Matrix4, pivotStart: THREE.Matrix4, pivotNow: THREE.Matrix4, mode: TransformMode, out: THREE.Matrix4,
): THREE.Matrix4 {
  if (mode === 'scale') {
    pivotStart.decompose(_p, _q, _ps);
    pivotNow.decompose(_p, _q, _pss);
    start.decompose(_p, _q, _s);
    _s.set(_s.x * (_pss.x / _ps.x), _s.y * (_pss.y / _ps.y), _s.z * (_pss.z / _ps.z));
    return out.compose(_p, _q, _s);
  }
  _delta.multiplyMatrices(pivotNow, _inv.copy(pivotStart).invert());
  return out.multiplyMatrices(_delta, start);
}

/**
 * Lowest allowed vertical delta for a rigid group: `minYs[i]` is the lowest centre height member
 * i may have (artworkMinY), `ys[i]` its current centre height. Returns a value ≤ 0.
 */
export function floorDeltaLimit(minYs: number[], ys: number[]): number {
  let limit = -Infinity;
  for (let i = 0; i < ys.length; i++) limit = Math.max(limit, minYs[i] - ys[i]);
  return Math.min(0, limit);
}
```

- [ ] **Step 4: `src/lib/instanceTransform.ts`** — Wand-Ablöse-Check und Finalisierung aus `InstanceTransformControls.handleMouseUp` (Zeilen 77–120) wörtlich übernehmen:

```ts
import type * as THREE from 'three';
import { artworkMinY, type ArtworkInstanceData, type ModularWallData, type TransformMode } from '@/store/editorStore';

/** Detaches an artwork from its wall once it sits beyond the wall's thickness or width. */
export function detachIfOffWall(inst: ArtworkInstanceData, walls: ModularWallData[]): ArtworkInstanceData {
  if (!inst.wallId) return inst;
  const wall = walls.find(w => w.id === inst.wallId);
  if (!wall) return inst;
  const dx = inst.position_x - wall.position_x;
  const dz = inst.position_z - wall.position_z;
  const cos = Math.cos(-wall.rotation_y);
  const sin = Math.sin(-wall.rotation_y);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const tolerance = wall.thickness / 2 + 0.15;
  const halfW = wall.width / 2 + 0.15;
  return Math.abs(localZ) > tolerance || Math.abs(localX) > halfW ? { ...inst, wallId: null } : inst;
}

/** Writes the transform of `object` (the artwork's group) back to the instance for one gizmo mode. */
export function finalizeInstanceTransform(
  inst: ArtworkInstanceData, object: THREE.Object3D, mode: TransformMode, walls: ModularWallData[],
): ArtworkInstanceData {
  if (mode === 'translate') object.position.y = Math.max(artworkMinY(inst, object.scale.y), object.position.y);
  const updated: ArtworkInstanceData = {
    ...inst,
    position_x: mode === 'translate' ? object.position.x : inst.position_x,
    position_y: mode === 'translate' ? object.position.y : inst.position_y,
    position_z: mode === 'translate' ? object.position.z : inst.position_z,
    rotation_x: mode === 'rotate' ? object.rotation.x : inst.rotation_x,
    rotation_y: mode === 'rotate' ? object.rotation.y : inst.rotation_y,
    rotation_z: mode === 'rotate' ? object.rotation.z : inst.rotation_z,
    scale_x: mode === 'scale' ? object.scale.x : inst.scale_x,
    scale_y: mode === 'scale' ? object.scale.y : inst.scale_y,
    scale_z: mode === 'scale' ? object.scale.z : inst.scale_z,
  };
  return mode === 'translate' ? detachIfOffWall(updated, walls) : updated;
}
```

Gruppen-Rotation verschiebt auch Positionen → für Gruppen gilt: Position **und** Rotation **und** (bei scale) Skalierung übernehmen — `finalizeGroupMember(inst, object, walls)`: alle neun Werte schreiben, Boden-Clamp, `detachIfOffWall`.

```ts
/** Group transforms move, turn and scale members at once — write all of it back. */
export function finalizeGroupMember(inst: ArtworkInstanceData, object: THREE.Object3D, walls: ModularWallData[]): ArtworkInstanceData {
  const y = Math.max(artworkMinY(inst, object.scale.y), object.position.y);
  object.position.y = y;
  return detachIfOffWall({
    ...inst,
    position_x: object.position.x, position_y: y, position_z: object.position.z,
    rotation_x: object.rotation.x, rotation_y: object.rotation.y, rotation_z: object.rotation.z,
    scale_x: object.scale.x, scale_y: object.scale.y, scale_z: object.scale.z,
  }, walls);
}
```

`InstanceTransformControls.handleMouseUp` nutzt `finalizeInstanceTransform` (Verhalten identisch).

- [ ] **Step 5: `src/components/SelectionPivot.tsx`**

```tsx
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore, instanceRefMap } from '@/store/editorStore';
import { instanceWorldBounds } from '@/lib/instanceBounds';

export interface SelectionPivotHandle {
  object: THREE.Object3D | null;
  /** Remembers the start matrices of the pivot and every member. */
  begin(): void;
  /** Applies the pivot's current transform to all members (called every frame while dragging). */
  apply(): void;
  /** Members as [id, group] after the drag. */
  members(): [number, THREE.Group][];
}

/** Invisible object at the centre of a multi-selection; the transform gizmo drives it. */
export const SelectionPivot = forwardRef<SelectionPivotHandle>((_, ref) => { … });
```

Verhalten:
- `ids = useEditorStore(useShallow(s => s.selectedInstanceIds))`; `isTransforming` aus Store.
- Effekt auf `[ids, localInstances]` (nicht während `isTransforming`): Box aller `instanceWorldBounds(inst)` vereinen, Pivot-`position` = Box-Mitte, `quaternion` = Identität, `scale` = 1, `updateMatrixWorld()`.
- `begin()`: `pivotStart = pivot.matrixWorld.clone()`; pro id `start = group.matrix.clone()` (Instanz-Gruppen hängen unter nicht transformierten Eltern — Welt = lokal; im Code per `group.parent.matrixWorld` gegenprüfen und sonst mit `parentInverse` rechnen); dazu `minY = artworkMinY(inst, group.scale.y)` und `y0 = group.position.y`.
- `apply()`: für Translate zuerst `dy = pivot.position.y - pivotStartY`, `dy = Math.max(dy, floorDeltaLimit(minYs, y0s))`, Pivot-Y entsprechend korrigieren; dann `applyGroupDelta(start, pivotStart, pivot.matrix, mode, tmp)` und `tmp.decompose(group.position, group.quaternion, group.scale)`.
- Rendert `<object3D ref={…} />` (unsichtbar, keine Geometrie).

- [ ] **Step 6: `InstanceTransformControls` Gruppenmodus**

- `ids = useEditorStore(useShallow(s => s.selectedInstanceIds))`; `isGroup = ids.length > 1`.
- `pivotRef = useRef<SelectionPivotHandle>(null)`; bei `isGroup` `<SelectionPivot ref={pivotRef} />` rendern und `TransformControls object={pivotRef.current?.object}` — da Ref beim ersten Render leer ist, Pivot-Objekt per `useState`-Callback-Ref setzen (`const [pivotObject, setPivotObject] = useState<THREE.Object3D | null>(null)`, `SelectionPivot` ruft `onObject(obj)`).
- `handleMouseDown`: bei Gruppe `pivotRef.current.begin()`.
- `useFrame`: bei Gruppe während `isTransforming` `pivotRef.current.apply()`, `setLiveTransform(readTransform(pivot))` im bestehenden 100-ms-Takt, `invalidate()`.
- `handleMouseUp` bei Gruppe:

```ts
        const store = useEditorStore.getState();
        const byId = new Map(pivot.members());
        store.commitLocalChange(store.localInstances.map(inst => {
            const group = byId.get(inst.id);
            return group ? finalizeGroupMember(inst, group, store.localWalls) : inst;
        }));
```

(IDs kommen aus `store.selectedInstanceIds` zum Commit-Zeitpunkt; `members()` liest `instanceRefMap` neu → Temp-ID-Remap unkritisch, da `remapInstanceRefs` die Map mitzieht.)
- Achsensperre/Modus wie beim Einzelwerk. Skalieren gesperrt, wenn ein Monitor in der Auswahl ist (`mode` fällt auf `translate` zurück, Toolbar schon in Task 2 gesperrt).

- [ ] **Step 7: `npm test` (selectionTransform + Store), `npx tsc -b` → grün.**

- [ ] **Step 8: Headless-Check**: zwei Werke auswählen (⇧-Klick), Gizmo ziehen → beide bewegen sich, ein Undo stellt beide zurück.

- [ ] **Step 9: Commit** `feat: move, rotate and scale a multi-selection with the gizmo`

---

### Task 4: Welt-Bounds pro Werk

**Files:**
- Create: `src/lib/instanceBounds.ts`
- Test: `src/lib/instanceBounds.test.ts`

**Interfaces:**
- Produces: `instanceWorldBounds(inst: ArtworkInstanceData, target?: THREE.Box3): THREE.Box3` — Bilder aus `artworkFrameLayout` (Rahmen + Passepartout), sonst Mesh-Bounds aus `instanceRefMap` (Rahmen-Instancer-Meshes ignorieren wie `measureGroup`), Fallback symmetrisch aus Pixelgröße/`artwork`-Maßen, niemals leer/NaN.

(Wird von Task 3 `SelectionPivot`, Task 5 Marquee und Task 6 Ausrichten genutzt — Task 4 vor Task 3 umsetzen.)

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { instanceWorldBounds } from './instanceBounds';
import type { ArtworkInstanceData } from '@/store/editorStore';

const picture = (patch: Partial<ArtworkInstanceData> = {}): ArtworkInstanceData => ({
  id: 1, frameStyle: 'none', artwork: { width: 100, height: 50, asset: { path: '', width: 1000, height: 500, dpi: 72, type: 'image' } },
  position_x: 2, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1, ...patch,
});

describe('instanceWorldBounds', () => {
  it('unframed picture spans its physical size around the anchor', () => {
    const b = instanceWorldBounds(picture());
    expect(b.min.x).toBeCloseTo(1.5); expect(b.max.x).toBeCloseTo(2.5);
    expect(b.min.y).toBeCloseTo(1.25); expect(b.max.y).toBeCloseTo(1.75);
  });

  it('rotated picture swaps extents into z', () => {
    const b = instanceWorldBounds(picture({ rotation_y: Math.PI / 2 }));
    expect(b.max.z - b.min.z).toBeCloseTo(1);
    expect(b.max.x - b.min.x).toBeLessThan(0.1);
  });

  it('a frame and passepartout grow the bounds', () => {
    const plain = instanceWorldBounds(picture());
    const framed = instanceWorldBounds(picture({ frameStyle: 'alu8-silber-matt', passepartoutWidth: 10 }));
    expect(framed.max.x - framed.min.x).toBeGreaterThan(plain.max.x - plain.min.x + 0.2);
  });

  it('fallback bounds for a model that has not loaded are finite', () => {
    const b = instanceWorldBounds(picture({ id: 999, medium: 'model3d', artwork: { asset: { path: '', width: 0, height: 0, dpi: null, type: 'model3d' } } }));
    expect(Number.isFinite(b.min.x) && Number.isFinite(b.max.y)).toBe(true);
    expect(b.isEmpty()).toBe(false);
  });
});
```

(Frame-Style-ID gegen `src/lib/frameStyles.ts` prüfen.)

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implementieren**

```ts
import * as THREE from 'three';
import { instanceRefMap, type ArtworkInstanceData } from '@/store/editorStore';
import { artworkFrameLayout, baseArtworkSize } from './wallEditor/footprint';

const FALLBACK_SIZE = 0.5;
const _local = new THREE.Box3();
const _matrix = new THREE.Matrix4();
const _box = new THREE.Box3();

const instanceMatrix = (inst: ArtworkInstanceData, withScale: boolean) => _matrix.compose(
  new THREE.Vector3(inst.position_x, inst.position_y, inst.position_z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(inst.rotation_x, inst.rotation_y, inst.rotation_z)),
  withScale ? new THREE.Vector3(inst.scale_x, inst.scale_y, inst.scale_z) : new THREE.Vector3(1, 1, 1),
);

/** Measured bounds of the artwork's meshes (frames are drawn instanced elsewhere). */
function measured(id: number, target: THREE.Box3): THREE.Box3 | null {
  const group = instanceRefMap.get(id);
  if (!group) return null;
  group.updateWorldMatrix(true, true);
  target.makeEmpty();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || object.userData.wallEditorIgnore) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb || bb.isEmpty()) return;
    target.union(_box.copy(bb).applyMatrix4(mesh.matrixWorld));
  });
  return target.isEmpty() ? null : target;
}

/** World-space bounds of an artwork: frame and passepartout included for pictures. Never empty. */
export function instanceWorldBounds(inst: ArtworkInstanceData, target = new THREE.Box3()): THREE.Box3 {
  const type = inst.artwork.asset.type ?? 'image';
  if (type === 'image' && inst.medium !== 'monitor') {
    const { left, right, bottom, top } = artworkFrameLayout(inst);
    _local.min.set(left, bottom, -0.01);
    _local.max.set(right, top, 0.03);
    return target.copy(_local).applyMatrix4(instanceMatrix(inst, false));
  }
  const fromMeshes = measured(inst.id, target);
  if (fromMeshes) return fromMeshes;
  const base = type === 'model3d' || type === 'splat' ? { w: 1, h: 1 } : baseArtworkSize(inst);
  const w = base.w || FALLBACK_SIZE;
  const h = base.h || FALLBACK_SIZE;
  const floor = type === 'model3d' || type === 'splat';
  _local.min.set(-w / 2, floor ? 0 : -h / 2, -w / 2);
  _local.max.set(w / 2, floor ? h : h / 2, floor ? w / 2 : 0.05);
  return target.copy(_local).applyMatrix4(instanceMatrix(inst, true));
}
```

- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat: world bounds of placed artworks`

---

### Task 5: Auswahlrahmen per ⇧-Ziehen

**Files:**
- Modify: `src/lib/selectionBridge.ts` (aus Task 2) — Bridge `marqueeHits`
- Create: `src/lib/marquee.ts` (reine Trefferlogik) + Test `src/lib/marquee.test.ts`
- Create: `src/components/SelectionBridge.tsx` (in Canvas, registriert Bridge)
- Create: `src/components/SelectionMarquee.tsx` (DOM-Overlay)
- Modify: `src/components/PlacedArtworks.tsx` (SelectionBridge mounten, nur Editor)
- Modify: `src/components/PlannerCameraSystem.tsx:437` (OrbitControls aus, solange ⇧ gedrückt)
- Modify: `src/pages/EditorPage.tsx` (Overlay rendern)
- Modify: `src/store/editorStore.ts` — `shiftHeld: boolean`, `setShiftHeld(v)`

**Interfaces:**
- Produces:
  - `screenRectOfBox(box: THREE.Box3, camera: THREE.Camera, viewport: { width: number; height: number }): { x: number; y: number; w: number; h: number } | null` (null wenn ganz hinter der Kamera)
  - `rectsOverlap(a, b): boolean`
  - `selectionBridge.marqueeHits(rect: { left: number; top: number; right: number; bottom: number }): number[]` (Client-Koordinaten)
  - `suppressNextClick()`, `consumeMarqueeClick()`

- [ ] **Step 1: Failing tests** (`src/lib/marquee.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { rectsOverlap, screenRectOfBox } from './marquee';

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();

describe('marquee', () => {
  it('projects a box in front of the camera to the screen centre', () => {
    const r = screenRectOfBox(new THREE.Box3(new THREE.Vector3(-0.1, -0.1, 0), new THREE.Vector3(0.1, 0.1, 0)), camera, { width: 1000, height: 1000 })!;
    expect(r.x + r.w / 2).toBeCloseTo(500, 0);
    expect(r.y + r.h / 2).toBeCloseTo(500, 0);
  });
  it('returns null for a box behind the camera', () => {
    expect(screenRectOfBox(new THREE.Box3(new THREE.Vector3(-1, -1, 6), new THREE.Vector3(1, 1, 7)), camera, { width: 1000, height: 1000 })).toBeNull();
  });
  it('rectsOverlap', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: `src/lib/marquee.ts`**

```ts
import * as THREE from 'three';

export interface ScreenRect { x: number; y: number; w: number; h: number }

const _corner = new THREE.Vector3();
const _view = new THREE.Vector3();

/** Screen rectangle (px, top-left origin) of a world box; null if it lies entirely behind the camera. */
export function screenRectOfBox(box: THREE.Box3, camera: THREE.Camera, viewport: { width: number; height: number }): ScreenRect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, inFront = 0;
  for (let i = 0; i < 8; i++) {
    _corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    _view.copy(_corner).applyMatrix4(camera.matrixWorldInverse);
    if (_view.z >= 0) continue; // behind the camera
    inFront++;
    _corner.project(camera);
    const sx = (_corner.x + 1) / 2 * viewport.width;
    const sy = (1 - _corner.y) / 2 * viewport.height;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  if (inFront === 0) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export const rectsOverlap = (a: ScreenRect, b: ScreenRect) =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
```

- [ ] **Step 4: Bridge + SelectionBridge**

`selectionBridge.ts` ergänzen:

```ts
export const selectionBridge: { marqueeHits: (rect: { left: number; top: number; right: number; bottom: number }) => number[] } = {
  marqueeHits: () => [],
};
```

`SelectionBridge.tsx` (in Canvas): registriert `marqueeHits` mit `get()` aus `useThree`:
- `rect` in Canvas-Koordinaten umrechnen (`gl.domElement.getBoundingClientRect()`).
- Für jedes `localInstances`-Werk, dessen `instanceRefMap`-Gruppe sichtbar ist (alle Vorfahren `visible`): `screenRectOfBox(instanceWorldBounds(inst), camera, size)`; überlappt → Sichtprüfung: `raycaster.set(camera.position, dir zur Box-Mitte)`, `intersectObjects(scene.children, true)`, erster sichtbarer Treffer (Muster aus `WallEditorCamera.pick`, `__ghost__` überspringen) gehört zum Werk (Vorfahr mit `userData.instanceId === inst.id`) **oder** `hit.distance >= dist - 0.05` → Treffer.
- Cleanup setzt `marqueeHits = () => []`.

- [ ] **Step 5: Overlay `SelectionMarquee.tsx`**

- Props: `containerRef: RefObject<HTMLDivElement | null>`.
- `pointerdown` (capture) am Container: nur `e.button === 0 && e.shiftKey`, `plannerViewMode === 'perspective'`, `!wallEditor`, `!isTransforming`, Ziel ist das Canvas. Start merken, **nicht** `preventDefault` (Klick soll ⇧-Klick bleiben).
- `pointermove`: ab 4 px Abstand Rahmen aktiv → `setPointerCapture`, Rechteck (Tailwind `border border-blue-400 bg-blue-400/10`, `pointer-events-none`, `position:absolute`) zeichnen.
- `pointerup`: Rahmen aktiv → `ids = selectionBridge.marqueeHits(rect)`; `store.setInstanceSelection([...store.selectedInstanceIds, ...ids], ids.at(-1) ?? store.selectedInstanceId)`; `suppressNextClick()`.
- `keydown/keyup` für `Shift` am `window` → `setShiftHeld(e.shiftKey)`; `blur` → `setShiftHeld(false)`.
- In `EditorPage` neben `WallEditor` rendern: `{viewMode === 'perspective' && !wallEditorOpen && isVisible && <SelectionMarquee containerRef={containerRef} />}`.
- `onPointerMissed` in EditorPage: `if (consumeMarqueeClick()) return;` vor dem Abwählen.

- [ ] **Step 6: OrbitControls** — `PlannerCameraSystem`:

```ts
    const shiftHeld = useEditorStore((s) => s.shiftHeld);
    … enabled={!isTransforming && wallPhase === 'idle' && !shiftHeld}
```

- [ ] **Step 7: `npm test`, `npx tsc -b` → grün; Headless-Check: ⇧-Ziehen über zwei Bilder wählt beide, Bild hinter Wand bleibt ungewählt, Kamera dreht nicht.**

- [ ] **Step 8: Commit** `feat: shift-drag marquee selection in the 3D editor`

---

### Task 6: Auswahl-Operationen (rein)

**Files:**
- Create: `src/lib/selectionOperations.ts`
- Test: `src/lib/selectionOperations.test.ts`

**Interfaces:**
- Consumes: `instanceWorldBounds` (Task 4), `detachIfOffWall` (Task 3), `artworkMinY`, `nextTempId`
- Produces (alle: `(instances, ids, walls, …) → ArtworkInstanceData[] | null`; `null` = nichts zu tun → kein Commit):
  - `alignHeight(instances, ids, walls, edge: 'bottom' | 'center' | 'top', target?: number)` — Ziel = Wert des letzten ids-Eintrags (primär), sonst `target` (Meter, Weltkoordinate)
  - `alignAxis(instances, ids, walls, axis: 'x' | 'z', edge: 'min' | 'center' | 'max')`
  - `distributeAxis(instances, ids, walls, axis: 'x' | 'z')`
  - `scaleSelection(instances, ids, factor: number)`
  - `setSelectionFrame(instances, ids, patch: { frameStyle?: FrameStyleId; passepartoutWidth?: number; passepartoutPlacement?: PassepartoutPlacement })`
  - `duplicateSelection(instances, ids, primaryId, walls): { instances: ArtworkInstanceData[]; copies: number[] } | null`
  - `isFramable(inst): boolean` (Bild, kein Monitor)

- [ ] **Step 1: Failing tests** (Auszug; alle Fälle umsetzen)

```ts
import { describe, expect, it } from 'vitest';
import { alignAxis, alignHeight, distributeAxis, duplicateSelection, scaleSelection, setSelectionFrame } from './selectionOperations';
import type { ArtworkInstanceData } from '@/store/editorStore';

const pic = (id: number, x: number, y: number, w = 100, h = 100, patch: Partial<ArtworkInstanceData> = {}): ArtworkInstanceData => ({
  id, frameStyle: 'none', artwork: { width: w, height: h, asset: { path: '', width: 1000, height: 1000, dpi: 72, type: 'image' } },
  position_x: x, position_y: y, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1, ...patch,
});
const byId = (list: ArtworkInstanceData[] | null, id: number) => list!.find(i => i.id === id)!;

describe('alignHeight', () => {
  it('aligns bottoms to the primary (last) artwork', () => {
    const out = alignHeight([pic(1, 0, 1.5), pic(2, 2, 2, 100, 50)], [1, 2], [], 'bottom');
    expect(byId(out, 1).position_y - 0.5).toBeCloseTo(byId(out, 2).position_y - 0.25);
  });
  it('sets centres to a fixed height', () => {
    const out = alignHeight([pic(1, 0, 1.2), pic(2, 2, 1.8)], [1, 2], [], 'center', 1.5);
    expect(byId(out, 1).position_y).toBeCloseTo(1.5);
    expect(byId(out, 2).position_y).toBeCloseTo(1.5);
  });
  it('never puts an artwork below the floor', () => {
    const out = alignHeight([pic(1, 0, 1.5)], [1], [], 'center', 0.1);
    expect(byId(out, 1).position_y).toBeCloseTo(0.5);
  });
  it('no-op for an empty selection', () => {
    expect(alignHeight([pic(1, 0, 1.5)], [], [], 'center')).toBeNull();
  });
});

describe('alignAxis / distributeAxis', () => {
  it('aligns left edges on x to the primary', () => {
    const out = alignAxis([pic(1, 0, 1.5), pic(2, 3, 1.5, 200)], [1, 2], [], 'x', 'min');
    expect(byId(out, 1).position_x - 0.5).toBeCloseTo(byId(out, 2).position_x - 1);
  });
  it('no-op with a single artwork', () => {
    expect(alignAxis([pic(1, 0, 1.5)], [1], [], 'x', 'min')).toBeNull();
  });
  it('distributes equal gaps and keeps the outer artworks', () => {
    const out = distributeAxis([pic(1, 0, 1.5), pic(2, 1.2, 1.5), pic(3, 6, 1.5)], [1, 2, 3], [], 'x');
    expect(byId(out, 1).position_x).toBeCloseTo(0);
    expect(byId(out, 3).position_x).toBeCloseTo(6);
    expect(byId(out, 2).position_x).toBeCloseTo(3);
  });
  it('distribute is a no-op below three artworks', () => {
    expect(distributeAxis([pic(1, 0, 1.5), pic(2, 2, 1.5)], [1, 2], [], 'x')).toBeNull();
  });
});

describe('scale / frame / duplicate', () => {
  it('scaleSelection multiplies scale and skips monitors', () => {
    const out = scaleSelection([pic(1, 0, 1.5), pic(2, 2, 1.5, 100, 100, { medium: 'monitor' })], [1, 2], 1.25);
    expect(byId(out, 1).scale_x).toBeCloseTo(1.25);
    expect(byId(out, 2).scale_x).toBe(1);
  });
  it('setSelectionFrame only touches pictures', () => {
    const model = pic(2, 2, 0, 100, 100, { medium: 'model3d', artwork: { asset: { path: '', width: 0, height: 0, dpi: null, type: 'model3d' } } });
    const out = setSelectionFrame([pic(1, 0, 1.5), model], [1, 2], { frameStyle: 'alu8-silber-matt' });
    expect(byId(out, 1).frameStyle).toBe('alu8-silber-matt');
    expect(byId(out, 2).frameStyle).toBe(model.frameStyle);
  });
  it('duplicateSelection adds copies with new negative ids, offset to the right of the group', () => {
    const res = duplicateSelection([pic(1, 0, 1.5), pic(2, 1.5, 1.5)], [1, 2], 2, [])!;
    expect(res.copies).toHaveLength(2);
    expect(res.copies.every(id => id < 0)).toBe(true);
    const c = res.instances.filter(i => res.copies.includes(i.id));
    // group spans −0.5 … 2.0 (2.5 m) → copies shifted by 2.6 m along +x (picture's right)
    expect(c.map(i => +i.position_x.toFixed(3)).sort()).toEqual([2.6, 4.1]);
  });
});
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implementieren** (`src/lib/selectionOperations.ts`)

```ts
import * as THREE from 'three';
import { artworkMinY, nextTempId, type ArtworkInstanceData, type ModularWallData } from '@/store/editorStore';
import type { FrameStyleId, PassepartoutPlacement } from './frameStyles';
import { instanceWorldBounds } from './instanceBounds';
import { detachIfOffWall } from './instanceTransform';

export type HeightEdge = 'bottom' | 'center' | 'top';
export type AxisEdge = 'min' | 'center' | 'max';
export type WorldAxis = 'x' | 'z';

const DUPLICATE_GAP_M = 0.1;

export const isFramable = (inst: ArtworkInstanceData) =>
  (inst.artwork.asset.type ?? 'image') === 'image' && inst.medium !== 'monitor';

function selected(instances: ArtworkInstanceData[], ids: number[]) {
  const set = new Set(ids);
  return instances.filter(i => set.has(i.id));
}

/** Applies per-id patches in one pass; returns null when nothing changed. */
function patchAll(instances: ArtworkInstanceData[], patches: Map<number, Partial<ArtworkInstanceData>>, walls: ModularWallData[], moved: boolean) {
  if (patches.size === 0) return null;
  return instances.map(inst => {
    const patch = patches.get(inst.id);
    if (!patch) return inst;
    const next = { ...inst, ...patch };
    return moved ? detachIfOffWall(next, walls) : next;
  });
}

const heightOf = (box: THREE.Box3, edge: HeightEdge) =>
  edge === 'bottom' ? box.min.y : edge === 'top' ? box.max.y : (box.min.y + box.max.y) / 2;

export function alignHeight(instances: ArtworkInstanceData[], ids: number[], walls: ModularWallData[], edge: HeightEdge, target?: number) {
  const members = selected(instances, ids);
  if (members.length === 0 || (target === undefined && members.length < 2)) return null;
  const primary = members.find(m => m.id === ids[ids.length - 1]) ?? members[members.length - 1];
  const goal = target ?? heightOf(instanceWorldBounds(primary), edge);
  const patches = new Map<number, Partial<ArtworkInstanceData>>();
  for (const inst of members) {
    const dy = goal - heightOf(instanceWorldBounds(inst), edge);
    patches.set(inst.id, { position_y: Math.max(artworkMinY(inst), inst.position_y + dy) });
  }
  return patchAll(instances, patches, walls, false);
}

const axisOf = (box: THREE.Box3, axis: WorldAxis, edge: AxisEdge) =>
  edge === 'min' ? box.min[axis] : edge === 'max' ? box.max[axis] : (box.min[axis] + box.max[axis]) / 2;
const positionKey = (axis: WorldAxis) => (axis === 'x' ? 'position_x' : 'position_z') as const;

export function alignAxis(instances: ArtworkInstanceData[], ids: number[], walls: ModularWallData[], axis: WorldAxis, edge: AxisEdge) {
  const members = selected(instances, ids);
  if (members.length < 2) return null;
  const primary = members.find(m => m.id === ids[ids.length - 1]) ?? members[members.length - 1];
  const goal = axisOf(instanceWorldBounds(primary), axis, edge);
  const key = positionKey(axis);
  const patches = new Map<number, Partial<ArtworkInstanceData>>();
  for (const inst of members) {
    patches.set(inst.id, { [key]: inst[key] + goal - axisOf(instanceWorldBounds(inst), axis, edge) });
  }
  return patchAll(instances, patches, walls, true);
}

export function distributeAxis(instances: ArtworkInstanceData[], ids: number[], walls: ModularWallData[], axis: WorldAxis) {
  const members = selected(instances, ids);
  if (members.length < 3) return null;
  const items = members
    .map(inst => ({ inst, box: instanceWorldBounds(inst) }))
    .sort((a, b) => (a.box.min[axis] + a.box.max[axis]) - (b.box.min[axis] + b.box.max[axis]));
  const first = items[0].box.min[axis];
  const last = items[items.length - 1].box.max[axis];
  const total = items.reduce((sum, { box }) => sum + box.max[axis] - box.min[axis], 0);
  const gap = (last - first - total) / (items.length - 1);
  const key = positionKey(axis);
  const patches = new Map<number, Partial<ArtworkInstanceData>>();
  let cursor = first;
  for (const { inst, box } of items) {
    patches.set(inst.id, { [key]: inst[key] + cursor - box.min[axis] });
    cursor += box.max[axis] - box.min[axis] + gap;
  }
  return patchAll(instances, patches, walls, true);
}

export function scaleSelection(instances: ArtworkInstanceData[], ids: number[], factor: number) {
  if (!(factor > 0) || factor === 1) return null;
  const patches = new Map<number, Partial<ArtworkInstanceData>>();
  for (const inst of selected(instances, ids)) {
    if (inst.medium === 'monitor') continue;
    const scale_y = inst.scale_y * factor;
    patches.set(inst.id, {
      scale_x: inst.scale_x * factor, scale_y, scale_z: inst.scale_z * factor,
      position_y: Math.max(artworkMinY(inst, scale_y), inst.position_y),
    });
  }
  return patchAll(instances, patches, [], false);
}

export function setSelectionFrame(instances: ArtworkInstanceData[], ids: number[], patch: { frameStyle?: FrameStyleId; passepartoutWidth?: number; passepartoutPlacement?: PassepartoutPlacement }) {
  const patches = new Map<number, Partial<ArtworkInstanceData>>();
  for (const inst of selected(instances, ids)) if (isFramable(inst)) patches.set(inst.id, patch);
  return patchAll(instances, patches, [], false);
}

/**
 * Copies the selection next to itself: the whole group moves by its own width plus 10 cm to the
 * right of the primary artwork (as seen from in front of it), so pictures stay on their wall.
 */
export function duplicateSelection(instances: ArtworkInstanceData[], ids: number[], primaryId: number | null, walls: ModularWallData[]) {
  const members = selected(instances, ids);
  if (members.length === 0) return null;
  const primary = members.find(m => m.id === primaryId) ?? members[members.length - 1];
  const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(primary.rotation_x, primary.rotation_y, primary.rotation_z));
  right.y = 0;
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  let min = Infinity, max = -Infinity;
  const corner = new THREE.Vector3();
  for (const inst of members) {
    const box = instanceWorldBounds(inst);
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      const d = corner.dot(right);
      min = Math.min(min, d); max = Math.max(max, d);
    }
  }
  const shift = right.multiplyScalar(max - min + DUPLICATE_GAP_M);
  const copies = members.map(inst => detachIfOffWall({
    ...inst, id: nextTempId(), artworkId: undefined,
    position_x: inst.position_x + shift.x, position_z: inst.position_z + shift.z,
  }, walls));
  return { instances: [...instances, ...copies], copies: copies.map(c => c.id) };
}
```

**Prüfen vor Implementierung:** Wie legt Auto-Sync neue Instanzen an (POST-Body aus `ArtworkInstanceData`)? Wenn `artworkId` beim POST für bestehende Artworks benötigt wird (Kopie = neue Instanz desselben Artworks), `artworkId` **nicht** löschen, sondern übernehmen. Test-Erwartung ggf. anpassen. Kopie-Offsets im Test: Gruppe `-0.5 … 2.0` → Shift `2.6`.

- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat: align, distribute, scale, frame and duplicate a selection`

---

### Task 7: MultiSelectionPanel, Löschen, Duplizieren

**Files:**
- Create: `src/components/FrameControls.tsx` (aus `PropertiesPanel.tsx` verschoben: `FrameControls`, `PassepartoutValue`, `NO_PASSEPARTOUT`, `passepartoutOf`, `finishSwatch`, `formatCm`, `formatMm`, `selectClass`, `toggleClass`)
- Create: `src/components/MultiSelectionPanel.tsx`
- Modify: `src/components/PropertiesPanel.tsx`
- Modify: `src/pages/EditorPage.tsx` (Cmd/Strg+D)

**Interfaces:**
- Consumes: Task 6 Operationen, `selectedInstanceIds`, `setInstanceSelection`, `deleteSelectedInstance`
- Produces: `FrameControls` mit optionalem `pictureCm?` (fehlt → Außenmaß/Formathinweis ausgeblendet) und optionalem `mixed?: boolean` (zeigt „Gemischt — Änderung gilt für alle Bilder“); `duplicateCurrentSelection(): void` in `src/lib/selectionActions.ts` (Store lesen → `duplicateSelection` → `commitLocalChange` → `setInstanceSelection(copies)`), genutzt von Panel und Taste.

- [ ] **Step 1: FrameControls verschieben** — Code 1:1 aus `PropertiesPanel.tsx` (`interface PassepartoutValue` … `FrameControls`) nach `FrameControls.tsx`, exportieren, `PropertiesPanel` importiert. `pictureCm` optional machen; ohne `pictureCm` die Blöcke „Außenmaß“ und `outsideFormats` nicht rendern. `mixed`-Hinweis unter „Rahmen“-Label.

- [ ] **Step 2: `npx tsc -b` → grün (reiner Umzug).**

- [ ] **Step 3: `src/lib/selectionActions.ts`**

```ts
import { useEditorStore } from '@/store/editorStore';
import { duplicateSelection } from './selectionOperations';

/** Duplicates the current selection (one undo step) and selects the copies. */
export function duplicateCurrentSelection(): void {
  const store = useEditorStore.getState();
  const result = duplicateSelection(store.localInstances, store.selectedInstanceIds, store.selectedInstanceId, store.localWalls);
  if (!result) return;
  store.commitLocalChange(result.instances);
  store.setInstanceSelection(result.copies);
}

/** Commits the result of a selection operation; null means nothing to do. */
export function commitSelectionOperation(next: ReturnType<typeof import('./selectionOperations').alignHeight>): void {
  if (next) useEditorStore.getState().commitLocalChange(next);
}
```

(Typ von `commitSelectionOperation` als `ArtworkInstanceData[] | null` schreiben — `import()`-Typ oben nur Skizze, im Code direkt `ArtworkInstanceData[] | null`.)

- [ ] **Step 4: `MultiSelectionPanel.tsx`** — Layout wie `ArtworkPropertiesContent` (`p-4 space-y-5`, `Label` uppercase):
  1. Kopf „{n} Werke ausgewählt“ + Titel-Liste (`displayArtworkTitle`), primäres `font-semibold text-white`; Klick → `setInstanceSelection([id])`; ⇧/Cmd-Klick → `toggleInstanceInSelection(id)`.
  2. **Ausrichten**: Zeile „Höhe“ mit drei Icon-Buttons (Lucide `AlignVerticalJustifyEnd` = Unterkante, `AlignVerticalJustifyCenter` = Mitte, `AlignVerticalJustifyStart` = Oberkante; Tooltips „Unterkanten angleichen“ …), `NumericInput` „Mittelhöhe (cm)“ (Enter/Blur → `alignHeight(…, 'center', cm / 100)`); Zeilen „X“ und „Z“ mit min/Mitte/max (`AlignStartVertical`/`AlignCenterVertical`/`AlignEndVertical`), plus „Verteilen“-Button je Achse (`disabled` bei < 3).
  3. **Rahmen & Passepartout** (nur wenn `framable.length > 0`): `FrameControls` mit Werten des ersten rahmbaren (primär bevorzugt), `mixed` wenn `frameStyle`/Passepartout abweichen; Handler rufen `setSelectionFrame` und `setDefaultFrameStyle`/`setDefaultPassepartout` wie das Einzelpanel.
  4. **Größe**: Buttons „−10 %“, „+10 %“ und `NumericInput` „Faktor (%)“ → `scaleSelection`. Hinweis, wenn Monitore dabei: „Monitore behalten ihre Größe.“
  5. **Aktionen**: „Duplizieren (⌘D)“ → `duplicateCurrentSelection`; „Im 2D-Editor öffnen“ (nur bei `commonFaceTarget`); „Löschen“ destructive → `deleteSelectedInstance` + `gooeyToast.success('Gelöscht', { description: \`${n} Werke entfernt.\` })`.

- [ ] **Step 5: PropertiesPanel** — `const multiCount = useEditorStore(s => s.selectedInstanceIds.length);` im Properties-Tab: `multiCount > 1 ? <MultiSelectionPanel /> : selectedWallId ? … : <ArtworkPropertiesContent …>`. `hasPropertiesContent` auch bei `multiCount > 0`. Tab-Sync-Effekt reagiert auf `multiCount`.

- [ ] **Step 6: Cmd/Strg+D in EditorPage** (vor `switch`, nach Cmd+A):

```ts
      if (cmdOrCtrl && key === 'd') {
        e.preventDefault();
        duplicateCurrentSelection();
        return;
      }
```

- [ ] **Step 7: `npm test`, `npx tsc -b`, eslint geänderte Dateien → grün. Headless: drei Bilder wählen → Panel zeigt Kopf, „Mittelhöhe 150“ setzt alle, Rahmen ändern wirkt auf alle, Cmd+D legt Kopien an, Undo nimmt Kopien zurück.**

- [ ] **Step 8: Commit** `feat: properties panel for a multi-selection`

---

### Task 8: Werkliste „Im Raum“

**Files:**
- Create: `src/lib/placedArtworkGroups.ts` + Test `src/lib/placedArtworkGroups.test.ts`
- Create: `src/components/PlacedArtworkList.tsx`
- Modify: `src/components/AssetSidebar.tsx`

**Interfaces:**
- Produces:
  - `groupPlacedArtworks(instances, walls, roomFaces): { key: string; label: string; ids: number[] }[]` — Reihenfolge: Stellwände (nach `label`/ID), Raumwände, zuletzt „Frei im Raum“; innerhalb einer Gruppe nach Position entlang der Fläche (links → rechts) bzw. ID.
  - `rangeSelection(order: number[], anchor: number | null, id: number): number[]`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { rangeSelection } from './placedArtworkGroups';

describe('rangeSelection', () => {
  it('selects the inclusive range between anchor and id in list order', () => {
    expect(rangeSelection([5, 3, 8, 1], 3, 1)).toEqual([3, 8, 1]);
    expect(rangeSelection([5, 3, 8, 1], 1, 5)).toEqual([5, 3, 8, 1]);
  });
  it('without an anchor selects only the id', () => {
    expect(rangeSelection([5, 3], null, 3)).toEqual([3]);
  });
});
```

Plus ein `groupPlacedArtworks`-Test mit einer Stellwand (zwei Bilder vorn, eins hinten) und einem freien 3D-Modell: drei Gruppen, Labels enthalten `WALL_SIDE_LABELS`-Text, freies Modell in „Frei im Raum“.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implementieren** — `groupPlacedArtworks` über `targetForInstance` und `targetKey`; Label für Stellwand: `${wall.label || 'Stellwand'} · ${WALL_SIDE_LABELS[side]}`; Raumwand: `face.label ?? 'Raumwand'` (Feld aus `RoomFace` prüfen); `rangeSelection` wie getestet.

- [ ] **Step 4: `PlacedArtworkList.tsx`**
- Daten: `localInstances`, `localWalls`, `roomFaces` (`useWallEditorView`), `selectedInstanceIds` (`useShallow`), `selectedInstanceId`.
- Pro Gruppe: Kopf-Button (Chevron einklappen + Klick auf Label = `setInstanceSelection(group.ids)`), Zeilen mit Thumbnail (`asset.thumbnailPath ?? asset.path` bei Bildern, sonst Typ-Icon `Box`/`Play`/`Sparkles`), Titel (`displayArtworkTitle`), markiert wenn ausgewählt, primär `font-semibold`.
- Klick: `metaKey||ctrlKey` → `toggleInstanceInSelection`; `shiftKey` → `setInstanceSelection(rangeSelection(order, selectedInstanceId, id), id)`; sonst `selectInstance(id)`.
- `useEffect` auf `selectedInstanceId`: Zeile `scrollIntoView({ block: 'nearest' })`.
- Leerer Zustand: „Noch keine Werke im Raum.“

- [ ] **Step 5: AssetSidebar** — Umschalter oben im Header: zwei Buttons „Assets“ / „Im Raum“, State `view` mit `localStorage`-Key `curahub-sidebar-view` (Lesen/Schreiben in try/catch). `view === 'placed'` → `<PlacedArtworkList />` statt Asset-Grid.

- [ ] **Step 6: Tests + tsc + eslint grün; Headless: Liste zeigt Gruppen, ⇧-Klick wählt Bereich, 3D-Hervorhebung folgt.**

- [ ] **Step 7: Commit** `feat: list of placed artworks with multi-selection`

---

### Task 9: Übergabe 2D ↔ 3D

**Files:**
- Modify: `src/store/editorStore.ts` (`openWallEditor`, `closeWallEditor`)
- Modify: `src/pages/EditorPage.tsx` (`handleCanvasDoubleClick`)
- Test: `src/store/editorStore.selection.test.ts` (erweitern)

**Interfaces:**
- Consumes: `openFaceOf`, `instanceOnFace` (`lib/wallEditor/faces.ts`)

- [ ] **Step 1: Failing tests**

```ts
it('closing the wall editor hands its selection back to 3D', () => {
  useEditorStore.setState({ wallEditor: { kind: 'room', faceId: 'f1' }, wallEditorSelection: [1, 2] });
  useEditorStore.getState().closeWallEditor();
  const s = useEditorStore.getState();
  expect(s.selectedInstanceIds).toEqual([1, 2]);
  expect(s.selectedInstanceId).toBe(2);
});
```

(Öffnen-Übergabe hängt an Raumflächen-Geometrie → über `openWallEditor(target, selection)`-Aufrufer abgedeckt; Aufrufer übergeben die gefilterte Auswahl.)

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implementieren**
- `closeWallEditor`: statt `selectedInstanceId: null` → `...instanceSelection(state.wallEditorSelection, state.localInstances)`; bei nicht-leerer Werkauswahl `selectedWallId: null` (Werke haben Vorrang), sonst bisheriges Wand-Verhalten.
- Aufrufer, die `openWallEditor(target, [inst.id])` übergeben (`openWallEditorForSelection`, `OpenArtworkWallButton`, `handleCanvasDoubleClick`): Auswahl = `selectedInstanceIds` gefiltert auf `instanceOnFace(inst, resolveFace(target, …))`, bei Doppelklick zusätzlich das angeklickte Werk.

- [ ] **Step 4: Tests grün; Headless: zwei Bilder einer Wand wählen → E → beide im 2D-Editor markiert; dort drittes dazu → Esc → alle drei im 3D markiert.**

- [ ] **Step 5: Commit** `feat: hand the selection between the 3D and the 2D wall editor`

---

### Task 10: Doku + Abschluss-Verifikation

**Files:**
- Modify: `CLAUDE.md` (Abschnitt „Architecture → State Management“ + neuer Unterabschnitt „Multi-Selection (3D)“, Commands um `npm test`)

- [ ] **Step 1: CLAUDE.md** — Kurzbeschreibung: `selectedInstanceIds` + primär, Setter, Gesten, `SelectionPivot`, reine Module und wofür, `npm test` (vitest, nur reine Module).
- [ ] **Step 2:** `npm test`, `npm run build`, `npx eslint` auf alle geänderten Dateien.
- [ ] **Step 3:** Headless-Chrome-Durchlauf aller Gesten (Spec §7).
- [ ] **Step 4: Commit** `docs: multi-selection in CLAUDE.md`

## Reihenfolge

Task 1 → 2 → 4 → 3 → 5 → 6 → 7 → 8 → 9 → 10 (Task 4 liefert Bounds für 3 und 5).
