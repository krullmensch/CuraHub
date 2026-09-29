# Maßstabsfigur + POV-Augenhöhe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Curators can place black low-poly 1.73 m figures in an exhibition version (saved, per-figure "visible in viewer" switch), and the first-person camera sits at the eye height of a 1.73 m person (1.62 m).

**Architecture:** A new `ScaleFigure` table per `ExhibitionVersion`, a `/scale-figures` REST route modelled on `walls.ts`, copied with versions and filtered by `isPublic` in `/public`. On the client, `editorStore` gets `localScaleFigures` + a third auto-sync diff block (same pattern as walls), a `ScaleFigures` R3F component renders one shared geometry from `public/models/scale-figure.glb` with its own selection and `TransformControls`. Player height constants move into `src/lib/playerDimensions.ts`.

**Tech Stack:** React 19, R3F 9 / drei 10, Three.js r186, Zustand 5, Express 5, Prisma 5 (MySQL), Zod 4, Jest + supertest, Blender (via Blender MCP) for the model.

**Spec:** `docs/superpowers/specs/2026-09-28-scale-figure-design.md`

## Global Constraints

- Branch: `feat/scale-figure` (already checked out). Never commit to `main`, never push.
- Figure height exactly **1.73 m** (`PLAYER_STATURE`), eye height **1.62 m** (`PLAYER_EYE_HEIGHT`).
- Figures: only `position_x`, `position_z`, `rotation_y`, `isPublic` are stored; always standing on the floor (y = 0), never scaled. `isPublic` defaults to `false`.
- All user-facing strings in **German**.
- No `any`; strict TS (`noUnusedLocals`, `noUnusedParameters`). Import `THREE` as namespace.
- Never create Three.js objects in render — module scope or `useMemo`.
- No `ShaderMaterial`/`onBeforeCompile` (WebGPU path).
- Nothing from `src/components/Player.tsx` may be imported by the store, `Scene.tsx` or `ViewerPage.tsx` (it pulls Rapier into the main chunk — RND-08). Use `src/lib/playerDimensions.ts`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before a task is done: `npm run lint` and `npm run build` (root) pass; server tasks also `cd server && npx tsc --noEmit` and the Jest tests of that task.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/playerDimensions.ts` (new) | Stature, eye height, capsule dimensions of the first-person player |
| `src/components/Player.tsx` | Uses the constants; re-exports `PLAYER_EYE_OFFSET` |
| `public/models/scale-figure.glb` (new) | The figure mesh, named `ScaleFigure` |
| `server/prisma/schema.prisma` + migration | `ScaleFigure` model |
| `server/src/routes/scaleFigures.ts` (new) | CRUD route |
| `server/src/tests/scaleFigures.test.ts` (new) | Route, version-copy and public tests |
| `server/src/routes/versions.ts` | Copy/include figures |
| `server/src/routes/public.ts` | Public figures only |
| `server/src/index.ts` | Mount the route |
| `src/store/editorStore.ts` | `ScaleFigureData`, state, actions, selection, auto-sync |
| `src/lib/scaleFigure.ts` (new) | Model URL/name, spawn-pose math, canvas bridge |
| `src/components/ScaleFigures.tsx` (new) | Rendering, loading, gizmo |
| `src/components/Scene.tsx` | Mount `ScaleFigures` |
| `src/components/ArtworkPlacement.tsx` | Drop raycast ignores figures |
| `src/components/SaveVersionDialog.tsx` | Send figures with a new version |
| `src/pages/ViewerPage.tsx` | Public figures, camera start height |
| `src/pages/EditorPage.tsx` | Toolbar button, keys, G/R enablement |
| `src/components/PropertiesPanel.tsx` | Figure properties section |
| `CLAUDE.md` | Document the feature |

---

### Task 1: First-person eye height 1.62 m

**Files:**
- Create: `src/lib/playerDimensions.ts`
- Modify: `src/components/Player.tsx:18-20`, `src/components/Player.tsx:131`
- Modify: `src/store/editorStore.ts:311-316`
- Modify: `src/pages/ViewerPage.tsx:212`

**Interfaces:**
- Produces: `PLAYER_STATURE = 1.73`, `PLAYER_EYE_HEIGHT = 1.62`, `PLAYER_CAPSULE_RADIUS`, `PLAYER_CAPSULE_HALF_HEIGHT`, `PLAYER_BODY_CENTER`, `PLAYER_EYE_OFFSET` from `src/lib/playerDimensions.ts` (all `number`). `Player.tsx` keeps exporting `PLAYER_EYE_OFFSET` (PhysicsWorld imports it from there).

There is no frontend test runner; this task is verified by the arithmetic check in Step 2, build/lint, and visually in Task 8.

- [ ] **Step 1: Create `src/lib/playerDimensions.ts`**

```ts
/**
 * The first-person player is a 1.73 m tall person. The scale figure (ScaleFigures) has the
 * same height, so first person shows what the figure would see.
 * Kept out of Player.tsx: that file pulls in Rapier, which must stay in the lazy physics chunk.
 */
export const PLAYER_STATURE = 1.73;
/** Eye height of a 1.73 m tall person (≈ 93.5 % of stature). */
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_CAPSULE_RADIUS = 0.3;
/** Half the length of the capsule's cylinder: 2 · 0.565 + 2 · 0.3 = 1.73 m. */
export const PLAYER_CAPSULE_HALF_HEIGHT = PLAYER_STATURE / 2 - PLAYER_CAPSULE_RADIUS;
/** Height of the body's centre when standing on the floor. */
export const PLAYER_BODY_CENTER = PLAYER_STATURE / 2;
/** Height of the camera above the body's centre. */
export const PLAYER_EYE_OFFSET = PLAYER_EYE_HEIGHT - PLAYER_BODY_CENTER;
```

- [ ] **Step 2: Check the numbers**

Run: `node -e "const S=1.73,E=1.62,R=0.3,h=S/2-R,c=S/2;console.log({h,c,eye:c+(E-c),top:c+h+R})"`
Expected: `h ≈ 0.565`, `c ≈ 0.865`, `eye ≈ 1.62`, `top ≈ 1.73`.

- [ ] **Step 3: Use the constants in `src/components/Player.tsx`**

Replace lines 18–20:

```ts
/** Height of the camera above the player body's center. */
export const PLAYER_EYE_OFFSET = 0.8;
const DEFAULT_SPAWN: [number, number, number] = [-5.99, 0.8, 2.6];
```

with:

```ts
export { PLAYER_EYE_OFFSET };
const DEFAULT_SPAWN: [number, number, number] = [-5.99, PLAYER_BODY_CENTER, 2.6];
```

Add to the imports at the top:

```ts
import { PLAYER_BODY_CENTER, PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS, PLAYER_EYE_OFFSET } from '../lib/playerDimensions';
```

Replace `<CapsuleCollider args={[0.5, 0.3]} />` with:

```tsx
<CapsuleCollider args={[PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS]} />
```

- [ ] **Step 4: Store default pose (`src/store/editorStore.ts:311-316`)**

Replace:

```ts
  // Updated when leaving the first-person preview; the player respawns here on the next entry.
  // Default = the player's spawn point (body at y 0.8 + eye offset 0.8), looking into the room.
  firstPersonCameraState: {
    position: [-5.99, 1.6, 2.6],
```

with:

```ts
  // Updated when leaving the first-person preview; the player respawns here on the next entry.
  // Default = the player's spawn point at eye height (lib/playerDimensions), looking into the room.
  firstPersonCameraState: {
    position: [-5.99, PLAYER_EYE_HEIGHT, 2.6],
```

and add `import { PLAYER_EYE_HEIGHT } from '../lib/playerDimensions';` to the store's imports (use the same relative style as the other `../lib/...` imports in that file).

- [ ] **Step 5: Viewer camera start (`src/pages/ViewerPage.tsx:212`)**

Replace `camera={{ position: [0, 1.7, 0], fov: 60 }}` with `camera={{ position: [0, PLAYER_EYE_HEIGHT, 0], fov: 60 }}` and add `import { PLAYER_EYE_HEIGHT } from '../lib/playerDimensions';`.

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run build`
Expected: both succeed. Then confirm Player.tsx isn't imported by store/viewer: `grep -n "components/Player\|'../Player'\|\"./Player\"" src/store/editorStore.ts src/pages/ViewerPage.tsx src/components/Scene.tsx` → no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/playerDimensions.ts src/components/Player.tsx src/store/editorStore.ts src/pages/ViewerPage.tsx
git commit -m "feat: first-person eye height of a 1.73 m tall person

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Low-poly figure model

**Executor note:** needs the Blender MCP tools (`mcp__blender__*`, load via ToolSearch `select:mcp__blender__get_addon_status,mcp__blender__get_scene_info,mcp__blender__execute_blender_code,mcp__blender__get_viewport_screenshot`). Run this task in the controller session if a subagent has no Blender access.

**Files:**
- Create: `public/models/scale-figure.glb`

**Interfaces:**
- Produces: GLB with one mesh node named `ScaleFigure`, identity transform, soles at y = 0, height 1.73 m, facing +Z, flat normals, no materials. Task 6 reads `nodes.ScaleFigure.geometry`.

- [ ] **Step 1: Check Blender**

Call `get_addon_status` (note `blender_version`) and `get_scene_info`. Blender must be running with the MCP add-on connected; if not, ask the user to start it.

- [ ] **Step 2: Build the figure (skin-modifier skeleton → subdivide → decimate)**

Run with `execute_blender_code`:

```python
import bpy
from mathutils import Vector

H = 1.73
for o in list(bpy.data.objects):
    if o.name.startswith("ScaleFigure"):
        bpy.data.objects.remove(o, do_unlink=True)

# Joint: (position, skin radius x/y). Blender is Z-up; the figure faces -Y, which the glTF
# exporter turns into +Z.
joints = {
    "pelvis": ((0.0, 0.0, 0.93), (0.16, 0.11)),
    "waist":  ((0.0, 0.0, 1.10), (0.14, 0.10)),
    "chest":  ((0.0, 0.0, 1.30), (0.17, 0.11)),
    "neck":   ((0.0, 0.0, 1.47), (0.055, 0.055)),
    "head":   ((0.0, -0.01, 1.60), (0.085, 0.10)),
    "crown":  ((0.0, 0.0, 1.69), (0.07, 0.08)),
}
for side, s in (("L", 1), ("R", -1)):
    joints.update({
        f"hip{side}":      ((s * 0.09, 0.0, 0.90), (0.085, 0.085)),
        f"knee{side}":     ((s * 0.10, -0.01, 0.49), (0.055, 0.06)),
        f"ankle{side}":    ((s * 0.10, 0.02, 0.08), (0.04, 0.045)),
        f"toe{side}":      ((s * 0.10, -0.13, 0.03), (0.04, 0.03)),
        f"shoulder{side}": ((s * 0.19, 0.0, 1.40), (0.055, 0.055)),
        f"elbow{side}":    ((s * 0.25, 0.02, 1.10), (0.042, 0.042)),
        f"wrist{side}":    ((s * 0.29, 0.0, 0.86), (0.032, 0.028)),
        f"hand{side}":     ((s * 0.31, 0.0, 0.73), (0.038, 0.018)),
    })
edges = [("pelvis", "waist"), ("waist", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown")]
for side in ("L", "R"):
    edges += [("pelvis", f"hip{side}"), (f"hip{side}", f"knee{side}"), (f"knee{side}", f"ankle{side}"),
              (f"ankle{side}", f"toe{side}"), ("chest", f"shoulder{side}"), (f"shoulder{side}", f"elbow{side}"),
              (f"elbow{side}", f"wrist{side}"), (f"wrist{side}", f"hand{side}")]

names = list(joints)
index = {n: i for i, n in enumerate(names)}
mesh = bpy.data.meshes.new("ScaleFigure")
mesh.from_pydata([joints[n][0] for n in names], [(index[a], index[b]) for a, b in edges], [])
obj = bpy.data.objects.new("ScaleFigure", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = obj
obj.select_set(True)

bpy.ops.object.modifier_add(type='SKIN')  # the operator also creates the skin vertex layer
obj.modifiers[-1].branch_smoothing = 0.5
skin = mesh.skin_vertices[0].data
for n in names:
    skin[index[n]].radius = joints[n][1]
skin[index["pelvis"]].use_root = True

sub = obj.modifiers.new("Subdivision", 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
dec = obj.modifiers.new("Decimate", 'DECIMATE'); dec.ratio = 0.35
for m in list(obj.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)

# Soles to z = 0, exact height H (x/y stay centred on the pelvis)
me = obj.data
zs = [v.co.z for v in me.vertices]
zmin, zmax = min(zs), max(zs)
k = H / (zmax - zmin)
for v in me.vertices:
    v.co = Vector((v.co.x * k, v.co.y * k, (v.co.z - zmin) * k))
for p in me.polygons:
    p.use_smooth = False
me.update()

tris = sum(len(p.vertices) - 2 for p in me.polygons)
zs = [v.co.z for v in me.vertices]
print({"triangles": tris, "height": max(zs) - min(zs), "min_z": min(zs)})
```

Expected print: `height` 1.73, `min_z` 0.0, `triangles` between 400 and 1200. If triangles is outside, change `dec.ratio` (lower = fewer) and re-run the whole script.

- [ ] **Step 3: Look at it**

Call `get_viewport_screenshot`. Expected: a recognisable standing person, arms slightly away from the body, faceted. If limbs look broken (skin modifier artefacts at the pelvis/chest branches), raise `branch_smoothing` to 0.8 and re-run Step 2. Show the screenshot to the user before exporting.

- [ ] **Step 4: Export**

```python
import bpy
obj = bpy.data.objects["ScaleFigure"]
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(
    filepath="/Users/mkrullmann/Documents/GitHub/CuraHub/public/models/scale-figure.glb",
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_normals=True,
    export_texcoords=False,
    export_materials='NONE',
)
```

If a keyword is rejected by this Blender version, list the valid ones with `[p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties]` and drop/rename only that keyword.

- [ ] **Step 5: Verify the GLB**

Create `<your scratchpad>/verify-glb.mjs`:

```js
import { readFileSync } from 'node:fs';
const buf = readFileSync(process.argv[2]);
const jsonLength = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
const prim = gltf.meshes[0].primitives[0];
const pos = gltf.accessors[prim.attributes.POSITION];
const triangles = prim.indices !== undefined ? gltf.accessors[prim.indices].count / 3 : pos.count / 3;
console.log(JSON.stringify({ nodes: gltf.nodes, min: pos.min, max: pos.max, height: pos.max[1] - pos.min[1], triangles, bytes: buf.length }, null, 1));
```

Run: `node <scratchpad>/verify-glb.mjs public/models/scale-figure.glb`
Expected: one node `{"name":"ScaleFigure","mesh":0}` without `translation`/`rotation`/`scale`; `min[1]` ≈ 0; `height` 1.73 ± 0.005; the figure's front is +Z (`max[2]` includes the toes, ≈ +0.13–0.18); `triangles` 400–1200; `bytes` < 80000.

- [ ] **Step 6: Commit**

```bash
git add public/models/scale-figure.glb
git commit -m "feat: add low-poly 1.73 m scale figure model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `ScaleFigure` table and `/scale-figures` route

**Files:**
- Modify: `server/prisma/schema.prisma` (new model + relation on `ExhibitionVersion`)
- Create: migration via Prisma
- Create: `server/src/routes/scaleFigures.ts`
- Modify: `server/src/index.ts:72` and `:86` (mount), `server/src/lib/idempotency.ts` (doc comment)
- Test: `server/src/tests/scaleFigures.test.ts`

**Interfaces:**
- Produces: REST `GET /scale-figures?versionId=`, `POST /scale-figures` (body `{ versionId, position_x, position_z, rotation_y?, isPublic? }` → 201 row), `PATCH /scale-figures/:id` (any of `position_x`, `position_z`, `rotation_y`, `isPublic` → 200 row), `DELETE /scale-figures/:id` → `{ success: true }`. Also mounted under `/api/`. Row JSON: `{ id, versionId, position_x, position_z, rotation_y, isPublic, createdAt }`. Prisma client: `prisma.scaleFigure`, relation `ExhibitionVersion.scaleFigures`.

Tests run against the dev MySQL database from `server/.env` (like `auth.test.ts`); they create and delete their own users/project. The DB must be running (`docker compose up -d` in the repo root if it isn't).

- [ ] **Step 1: Schema**

Add to `server/prisma/schema.prisma` after `model ModularWall { … }`:

```prisma
// 1.73 m scale figure standing on the floor (client: src/components/ScaleFigures.tsx).
model ScaleFigure {
  id          Int               @id @default(autoincrement())

  version     ExhibitionVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  versionId   Int

  position_x  Float             @default(0)
  position_z  Float             @default(0)
  rotation_y  Float             @default(0)

  // Shown in the public viewer
  isPublic    Boolean           @default(false)

  createdAt   DateTime          @default(now())
}
```

In `model ExhibitionVersion`, after `walls               ModularWall[]`, add:

```prisma
  scaleFigures        ScaleFigure[]
```

- [ ] **Step 2: Migrate**

Run: `cd server && npx prisma migrate dev --name scale_figures`
Expected: new folder `server/prisma/migrations/<timestamp>_scale_figures/` with a `CREATE TABLE ScaleFigure` migration, client regenerated.

- [ ] **Step 3: Write the failing test `server/src/tests/scaleFigures.test.ts`**

```ts
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { app } from '../index';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_dev_key';
const SUFFIX = `sf-test-${Date.now()}`;
const OWNER_EMAIL = `${SUFFIX}-owner@hsbi.de`;
const STRANGER_EMAIL = `${SUFFIX}-stranger@hsbi.de`;

let ownerId: number;
let ownerToken: string;
let strangerToken: string;
let exhibitionId: number;
let exhibitionSlug: string;
let versionId: number;

const tokenFor = (userId: number) => jwt.sign({ userId, role: 'curator' }, JWT_SECRET, { expiresIn: '1h' });
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: OWNER_EMAIL, role: 'curator' } });
    const stranger = await prisma.user.create({ data: { email: STRANGER_EMAIL, role: 'curator' } });
    ownerId = owner.id;
    ownerToken = tokenFor(owner.id);
    strangerToken = tokenFor(stranger.id);
    const project = await prisma.project.create({ data: { name: 'SF Test', slug: SUFFIX, ownerId: owner.id } });
    exhibitionSlug = `${SUFFIX}-ex`;
    const exhibition = await prisma.exhibition.create({
        data: { title: 'SF Test', slug: exhibitionSlug, room_id: 1, projectId: project.id },
    });
    exhibitionId = exhibition.id;
    const version = await prisma.exhibitionVersion.create({
        data: { exhibition_id: exhibition.id, created_by_user_id: owner.id, comment: 'root' },
    });
    versionId = version.id;
});

afterAll(async () => {
    // Project → exhibitions → versions → figures cascade
    await prisma.project.deleteMany({ where: { slug: SUFFIX } });
    await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, STRANGER_EMAIL] } } });
    await prisma.$disconnect();
});

describe('scale figures API', () => {
    let figureId: number;

    it('creates a figure, private by default', async () => {
        const res = await request(app).post('/scale-figures').set(auth(ownerToken))
            .send({ versionId, position_x: 1.5, position_z: -2, rotation_y: 0.5 });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ versionId, position_x: 1.5, position_z: -2, rotation_y: 0.5, isPublic: false });
        figureId = res.body.id;
    });

    it('lists the figures of a version', async () => {
        const res = await request(app).get(`/scale-figures?versionId=${versionId}`).set(auth(ownerToken));
        expect(res.status).toBe(200);
        expect(res.body.map((f: { id: number }) => f.id)).toEqual([figureId]);
    });

    it('updates position and visibility', async () => {
        const res = await request(app).patch(`/scale-figures/${figureId}`).set(auth(ownerToken))
            .send({ position_x: 3, isPublic: true });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ position_x: 3, position_z: -2, isPublic: true });
    });

    it('rejects invalid input', async () => {
        const bad = await request(app).post('/scale-figures').set(auth(ownerToken))
            .send({ versionId, position_x: 'links', position_z: 0 });
        expect(bad.status).toBe(400);
        const far = await request(app).patch(`/scale-figures/${figureId}`).set(auth(ownerToken))
            .send({ position_z: 1e6 });
        expect(far.status).toBe(400);
    });

    it('hides figures from users without access', async () => {
        const list = await request(app).get(`/scale-figures?versionId=${versionId}`).set(auth(strangerToken));
        expect(list.status).toBe(404);
        const create = await request(app).post('/scale-figures').set(auth(strangerToken))
            .send({ versionId, position_x: 0, position_z: 0 });
        expect(create.status).toBe(404);
        const patch = await request(app).patch(`/scale-figures/${figureId}`).set(auth(strangerToken))
            .send({ position_x: 0 });
        expect(patch.status).toBe(404);
        const del = await request(app).delete(`/scale-figures/${figureId}`).set(auth(strangerToken));
        expect(del.status).toBe(404);
    });

    it('deletes a figure', async () => {
        const res = await request(app).delete(`/scale-figures/${figureId}`).set(auth(ownerToken));
        expect(res.status).toBe(200);
        expect(await prisma.scaleFigure.findUnique({ where: { id: figureId } })).toBeNull();
    });
});
```

`ownerId`, `exhibitionId` and `exhibitionSlug` are used by Task 4's tests. So ts-jest doesn't flag them as unused in the meantime, add this at the end of the first `describe` block (it stays):

```ts
    it('sets up a fixture exhibition', () => {
        expect(ownerId).toBeGreaterThan(0);
        expect(exhibitionId).toBeGreaterThan(0);
        expect(exhibitionSlug).toContain(SUFFIX);
    });
```

- [ ] **Step 4: Run to see it fail**

Run: `cd server && NODE_ENV=test npx jest src/tests/scaleFigures.test.ts`
Expected: FAIL — `POST /scale-figures` returns 404 (`Endpoint not found`).

- [ ] **Step 5: Write `server/src/routes/scaleFigures.ts`**

```ts
import { Router, type Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, exhibitionAccessFilter } from '../lib/middleware';
import { idempotency } from '../lib/idempotency';

export const scaleFiguresRouter = Router();
const prisma = new PrismaClient();

const MAX_FIGURES_PER_VERSION = 50;

// Figures stand on the floor and keep their size: only x/z and the turn around y are stored.
const coordinate = z.number().min(-500).max(500);
const angle = z.number().min(-100).max(100);

const createScaleFigureSchema = z.object({
    versionId: z.number().int(),
    position_x: coordinate,
    position_z: coordinate,
    rotation_y: angle.default(0),
    isPublic: z.boolean().default(false),
});

const updateScaleFigureSchema = z.object({
    position_x: coordinate.optional(),
    position_z: coordinate.optional(),
    rotation_y: angle.optional(),
    isPublic: z.boolean().optional(),
});

/** The figure, if the user may edit its exhibition. */
const findAccessibleFigure = (req: Request, id: number) => prisma.scaleFigure.findFirst({
    where: {
        id,
        version: { exhibition: exhibitionAccessFilter(req.user!.userId, req.user!.role === 'admin') },
    },
});

// GET /scale-figures?versionId=:id — all figures of a version
scaleFiguresRouter.get('/', authenticate, async (req: Request, res) => {
    try {
        const versionId = parseInt(req.query.versionId as string, 10);
        if (isNaN(versionId)) return res.status(400).json({ error: 'versionId query param required' });

        const version = await prisma.exhibitionVersion.findFirst({
            where: { id: versionId, exhibition: exhibitionAccessFilter(req.user!.userId, req.user!.role === 'admin') },
        });
        if (!version) return res.status(404).json({ error: 'Version not found' });

        const figures = await prisma.scaleFigure.findMany({
            where: { versionId },
            orderBy: { createdAt: 'asc' },
        });
        res.json(figures);
    } catch (e) {
        console.error('Failed to fetch scale figures:', e);
        res.status(500).json({ error: 'Failed to fetch scale figures' });
    }
});

// POST /scale-figures — add a figure
scaleFiguresRouter.post('/', authenticate, idempotency, async (req: Request, res) => {
    try {
        const data = createScaleFigureSchema.parse(req.body);

        const version = await prisma.exhibitionVersion.findFirst({
            where: { id: data.versionId, exhibition: exhibitionAccessFilter(req.user!.userId, req.user!.role === 'admin') },
        });
        if (!version) return res.status(404).json({ error: 'Version not found' });

        const count = await prisma.scaleFigure.count({ where: { versionId: data.versionId } });
        if (count >= MAX_FIGURES_PER_VERSION) {
            return res.status(400).json({ error: `Maximal ${MAX_FIGURES_PER_VERSION} Maßstabsfiguren pro Version` });
        }

        const figure = await prisma.scaleFigure.create({ data });
        res.status(201).json(figure);
    } catch (e) {
        console.error('Failed to create scale figure:', e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: e.issues });
        }
        res.status(500).json({ error: 'Failed to create scale figure' });
    }
});

// PATCH /scale-figures/:id — move, turn, show/hide in the viewer
scaleFiguresRouter.patch('/:id', authenticate, async (req: Request, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid scale figure ID' });

        const data = updateScaleFigureSchema.parse(req.body);
        if (!(await findAccessibleFigure(req, id))) return res.status(404).json({ error: 'Scale figure not found' });

        const figure = await prisma.scaleFigure.update({ where: { id }, data });
        res.json(figure);
    } catch (e) {
        console.error('Failed to update scale figure:', e);
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation Error', details: e.issues });
        }
        res.status(500).json({ error: 'Failed to update scale figure' });
    }
});

// DELETE /scale-figures/:id
scaleFiguresRouter.delete('/:id', authenticate, async (req: Request, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid scale figure ID' });

        if (!(await findAccessibleFigure(req, id))) return res.status(404).json({ error: 'Scale figure not found' });

        await prisma.scaleFigure.delete({ where: { id } });
        res.json({ success: true });
    } catch (e) {
        console.error('Failed to delete scale figure:', e);
        res.status(500).json({ error: 'Failed to delete scale figure' });
    }
});
```

- [ ] **Step 6: Mount it (`server/src/index.ts`)**

Add next to the walls router import: `import { scaleFiguresRouter } from './routes/scaleFigures';` (match the import style of `wallsRouter` there).
After `app.use('/walls', wallsRouter);` add `app.use('/scale-figures', scaleFiguresRouter);`
After `app.use('/api/walls', wallsRouter);` add `app.use('/api/scale-figures', scaleFiguresRouter);`

In `server/src/lib/idempotency.ts`, change the doc line "`POST /instances` and `POST /walls`" to "`POST /instances`, `POST /walls` and `POST /scale-figures`".

- [ ] **Step 7: Run to see it pass**

Run: `cd server && NODE_ENV=test npx jest src/tests/scaleFigures.test.ts && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/src/routes/scaleFigures.ts server/src/index.ts server/src/lib/idempotency.ts server/src/tests/scaleFigures.test.ts
git commit -m "feat: store scale figures per exhibition version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Figures in versions and the public viewer

**Files:**
- Modify: `server/src/routes/versions.ts` (schema :33-46, GET include :125, POST :290-379, merge :535-615)
- Modify: `server/src/routes/public.ts:80-100`
- Test: `server/src/tests/scaleFigures.test.ts` (append)

**Interfaces:**
- Consumes: `prisma.scaleFigure`, relation `scaleFigures` (Task 3).
- Produces: version JSON (GET one version, POST create, POST merge) includes `scaleFigures: ScaleFigure[]`; `POST /exhibitions/:id/versions` accepts optional `scaleFigures: { position_x, position_z, rotation_y, isPublic }[]`; `GET /public/exhibition/:slug` returns `scaleFigures` with only `isPublic = true` rows.

- [ ] **Step 1: Append failing tests to `server/src/tests/scaleFigures.test.ts`**

```ts
describe('scale figures in versions and the public viewer', () => {
    beforeAll(async () => {
        await prisma.scaleFigure.createMany({
            data: [
                { versionId, position_x: 1, position_z: 1, rotation_y: 0, isPublic: true },
                { versionId, position_x: 2, position_z: 2, rotation_y: 1, isPublic: false },
            ],
        });
    });

    it('returns figures with a version', async () => {
        const res = await request(app).get(`/exhibitions/${exhibitionId}/versions/${versionId}`).set(auth(ownerToken));
        expect(res.status).toBe(200);
        expect(res.body.scaleFigures).toHaveLength(2);
    });

    it('copies the source version\'s figures when the client sends none', async () => {
        const res = await request(app).post(`/exhibitions/${exhibitionId}/versions`).set(auth(ownerToken))
            .send({ comment: 'copy', sourceVersionId: versionId });
        expect(res.status).toBe(201);
        expect(res.body.scaleFigures.map((f: { position_x: number }) => f.position_x).sort()).toEqual([1, 2]);
    });

    it('takes the figures the client sends', async () => {
        const res = await request(app).post(`/exhibitions/${exhibitionId}/versions`).set(auth(ownerToken))
            .send({
                comment: 'client',
                sourceVersionId: versionId,
                scaleFigures: [{ position_x: 5, position_z: 6, rotation_y: 0.25, isPublic: true }],
            });
        expect(res.status).toBe(201);
        expect(res.body.scaleFigures).toEqual([
            expect.objectContaining({ position_x: 5, position_z: 6, rotation_y: 0.25, isPublic: true }),
        ]);
    });

    it('copies figures when a branch is merged', async () => {
        const branch = await prisma.exhibitionVersion.create({
            data: {
                exhibition_id: exhibitionId,
                created_by_user_id: ownerId,
                parent_version_id: versionId,
                branch_name: `${SUFFIX}-branch`,
                comment: 'branch',
                scaleFigures: { create: [{ position_x: 7, position_z: 7, rotation_y: 0, isPublic: false }] },
            },
        });
        const res = await request(app).post(`/exhibitions/${exhibitionId}/versions/${branch.id}/merge`).set(auth(ownerToken));
        expect(res.status).toBe(201);
        expect(res.body.scaleFigures).toEqual([expect.objectContaining({ position_x: 7, isPublic: false })]);
    });

    it('shows only public figures of the published version', async () => {
        await prisma.exhibitionVersion.update({ where: { id: versionId }, data: { is_published: true } });
        const res = await request(app).get(`/public/exhibition/${exhibitionSlug}`);
        expect(res.status).toBe(200);
        expect(res.body.scaleFigures).toEqual([expect.objectContaining({ position_x: 1, isPublic: true })]);
    });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd server && NODE_ENV=test npx jest src/tests/scaleFigures.test.ts`
Expected: the five new tests FAIL (`scaleFigures` undefined).

- [ ] **Step 3: `versions.ts` — schema and helper**

In `createVersionSchema`, after the `walls: z.array(...).optional()` entry (add a comma after it), add:

```ts
    scaleFigures: z.array(scaleFigureSnapshotSchema).optional(),
```

Above `createVersionSchema`, add:

```ts
// Scale figures are copied as plain snapshots (no ids) into a new version.
const scaleFigureSnapshotSchema = z.object({
    position_x: z.number().min(-500).max(500),
    position_z: z.number().min(-500).max(500),
    rotation_y: z.number().min(-100).max(100),
    isPublic: z.boolean(),
});
type ScaleFigureSnapshot = z.infer<typeof scaleFigureSnapshotSchema>;
const snapshotFigure = (f: ScaleFigureSnapshot): ScaleFigureSnapshot => ({
    position_x: f.position_x,
    position_z: f.position_z,
    rotation_y: f.rotation_y,
    isPublic: f.isPublic,
});
```

- [ ] **Step 4: `versions.ts` — GET one version**

In the `include` of `GET /exhibitions/:exhibitionId/versions/:versionId` (after `walls: true,`), add `scaleFigures: true,`.

- [ ] **Step 5: `versions.ts` — POST create**

After the `wallsToCreate` block (just before `// Create version with walls first, then instances with remapped wallIds`), add:

```ts
        // Scale figures: from the client, else copied from the source version
        let figuresToCreate: ScaleFigureSnapshot[] = [];
        if (data.scaleFigures) {
            figuresToCreate = data.scaleFigures.map(snapshotFigure);
        } else if (sourceVersionId) {
            const sourceFigures = await prisma.scaleFigure.findMany({
                where: { versionId: sourceVersionId },
                orderBy: { id: 'asc' },
            });
            figuresToCreate = sourceFigures.map(snapshotFigure);
        }
```

In `tx.exhibitionVersion.create({ data: { … walls: { create: wallsToCreate } } })` add after the `walls` entry:

```ts
                    scaleFigures: {
                        create: figuresToCreate
                    },
```

In the final `tx.exhibitionVersion.findUniqueOrThrow` include (after `walls: true,`), add `scaleFigures: true,`.

- [ ] **Step 6: `versions.ts` — merge**

In the merge route: `include: { instances: true, walls: true, }` → add `scaleFigures: true,`.
After `const instancesToCreate = sourceVersion.instances.map(...)` add:

```ts
        const figuresToCreate = sourceVersion.scaleFigures.map(snapshotFigure);
```

In its `tx.exhibitionVersion.create` data: `walls: { create: wallsToCreate }` → `walls: { create: wallsToCreate },` followed by `scaleFigures: { create: figuresToCreate }`.
In its final `findUniqueOrThrow` include, after `walls: true,` add `scaleFigures: true,`.

- [ ] **Step 7: `public.ts`**

In the version query include, after `walls: true,` add:

```ts
                // Only figures the curator switched on for the viewer
                scaleFigures: { where: { isPublic: true } },
```

In `res.json({ … })`, after `walls: version.walls,` add `scaleFigures: version.scaleFigures,`.

- [ ] **Step 8: Run to see them pass**

Run: `cd server && NODE_ENV=test npx jest src/tests/scaleFigures.test.ts && npx tsc --noEmit`
Expected: all PASS, no type errors. Also run the whole suite once: `cd server && npm test` — the pre-existing tests behave as before (note any that already failed before this branch; don't fix unrelated failures).

- [ ] **Step 9: Commit**

```bash
git add server/src/routes/versions.ts server/src/routes/public.ts server/src/tests/scaleFigures.test.ts
git commit -m "feat: copy scale figures with versions and show public ones in the viewer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Store — figure state, selection, auto-sync, save dialog

**Files:**
- Modify: `src/store/editorStore.ts` (types ~:70, state interface ~:165-215, actions interface ~:245-275, defaults ~:330-362, select actions :398-400, `openWallEditor` ~:600-614, wall actions ~:590, sync ~:700-1200)
- Modify: `src/components/SaveVersionDialog.tsx:62-76`

**Interfaces:**
- Consumes: REST from Task 3/4.
- Produces (exported from `src/store/editorStore.ts`):
  ```ts
  export interface ScaleFigureData { id: number; versionId?: number; position_x: number; position_z: number; rotation_y: number; isPublic: boolean; }
  // state
  localScaleFigures: ScaleFigureData[];
  selectedFigureId: number | null;
  // actions
  setLocalScaleFigures(figures: ScaleFigureData[]): void;
  addScaleFigure(figure: ScaleFigureData): void;
  updateScaleFigure(id: number, updates: Partial<Omit<ScaleFigureData, 'id'>>): void;
  deleteScaleFigure(id: number): void;
  selectFigure(id: number | null): void;
  ```
  `selectInstance`, `selectWall`, `selectZone` and `openWallEditor` also clear `selectedFigureId`. Temp ids come from the existing `nextTempId()`.

No frontend test runner exists; verification is `npm run build` (type check) + `npm run lint` here and the end-to-end run in Task 8.

- [ ] **Step 1: Type**

After `export interface ModularWallData { … }` add:

```ts
/** A 1.73 m scale figure standing on the floor (components/ScaleFigures.tsx). */
export interface ScaleFigureData {
  id: number;
  versionId?: number;
  position_x: number;
  position_z: number;
  rotation_y: number;
  /** Shown in the public viewer. */
  isPublic: boolean;
}
```

- [ ] **Step 2: State + action declarations in `interface EditorState`**

After `selectedZoneId: number | null;` add `selectedFigureId: number | null;`.
After `localWalls: ModularWallData[];` add:

```ts

  // Scale figures (1.73 m people for judging scale)
  localScaleFigures: ScaleFigureData[];
```

After `selectZone: (id: number | null) => void;` add `selectFigure: (id: number | null) => void;`.
After `toggleWallLock: (id: number) => void;` add:

```ts

  // Scale figure actions
  setLocalScaleFigures: (figures: ScaleFigureData[]) => void;
  addScaleFigure: (figure: ScaleFigureData) => void;
  updateScaleFigure: (id: number, updates: Partial<Omit<ScaleFigureData, 'id'>>) => void;
  deleteScaleFigure: (id: number) => void;
```

- [ ] **Step 3: Defaults**

After `selectedZoneId: null,` (in the Phase 4.2 defaults) add `selectedFigureId: null,`.
After `localWalls: [],` add:

```ts

  // Scale figure defaults
  localScaleFigures: [],
```

- [ ] **Step 4: Selection**

Replace the three select actions with:

```ts
  selectInstance: (id) => set({ selectedInstanceId: id, selectedWallId: null, selectedZoneId: null, selectedFigureId: null }),
  selectWall: (id) => set({ selectedWallId: id, selectedInstanceId: null, selectedZoneId: null, selectedFigureId: null }),
  selectZone: (id) => set({ selectedZoneId: id, selectedInstanceId: null, selectedWallId: null, selectedFigureId: null }),
  selectFigure: (id) => set({ selectedFigureId: id, selectedInstanceId: null, selectedWallId: null, selectedZoneId: null }),
```

In `openWallEditor`'s returned object, after `selectedZoneId: null,` add `selectedFigureId: null,`.

- [ ] **Step 5: Actions**

After the `toggleWallLock` action (before `// FPV actions`) add:

```ts
  // Scale figure actions (auto-sync persists them, like walls; no undo — walls have none either)
  setLocalScaleFigures: (figures) => {
    // Only real ids count as persisted; temp ids stay "new" so auto-sync POSTs them.
    prevScaleFigures = figures.filter(f => f.id > 0);
    return set({ localScaleFigures: figures, selectedFigureId: null });
  },
  addScaleFigure: (figure) => {
    localEditSeq++;
    return set((state) => ({
      localScaleFigures: [...state.localScaleFigures, figure],
      hasUnsavedChanges: true,
    }));
  },
  updateScaleFigure: (id, updates) => {
    localEditSeq++;
    return set((state) => ({
      localScaleFigures: state.localScaleFigures.map(f => f.id === id ? { ...f, ...updates } : f),
      hasUnsavedChanges: true,
    }));
  },
  deleteScaleFigure: (id) => {
    localEditSeq++;
    return set((state) => ({
      localScaleFigures: state.localScaleFigures.filter(f => f.id !== id),
      selectedFigureId: state.selectedFigureId === id ? null : state.selectedFigureId,
      hasUnsavedChanges: true,
    }));
  },
```

- [ ] **Step 6: Sync module — declarations**

`idempotencyKeyFor`: change the parameter type `kind: 'inst' | 'wall'` to `kind: 'inst' | 'wall' | 'figure'`.
After `let prevWalls: ModularWallData[] = [];` add `let prevScaleFigures: ScaleFigureData[] = [];`.
After `const syncingWallTempIds = new Set<number>();` add `const syncingFigureTempIds = new Set<number>();`.

- [ ] **Step 7: Sync module — diff block**

In `syncToBackend`, change `const { localInstances, localWalls, activeVersionId } = state;` to `const { localInstances, localWalls, localScaleFigures, activeVersionId } = state;` and after `const currWalls = localWalls;` add `const currFigures = localScaleFigures;`.

After the "Updated walls → PATCH" loop (just before `// Wait for every request in this batch …`) add:

```ts
    // ── Scale figure sync (mirrors wall sync above) ──
    const prevFigureMap = new Map(prevScaleFigures.map(f => [f.id, f]));
    const currFigureMap = new Map(currFigures.map(f => [f.id, f]));
    const nextFiguresMap = new Map(prevScaleFigures.map(f => [f.id, f]));

    // New figures (temp negative IDs) → POST
    for (const figure of currFigures) {
      if (figure.id >= 0 || prevFigureMap.has(figure.id)) continue;
      if (syncingFigureTempIds.has(figure.id)) continue;

      syncingFigureTempIds.add(figure.id);
      tasks.push((async () => {
        try {
          const res = await fetchWithRetry('/api/scale-figures', {
            method: 'POST',
            headers: { ...headers, 'Idempotency-Key': idempotencyKeyFor('figure', figure.id) },
            body: JSON.stringify({
              versionId: activeVersionId,
              position_x: figure.position_x,
              position_z: figure.position_z,
              rotation_y: figure.rotation_y,
              isPublic: figure.isPublic,
            }),
          });

          if (res?.status === 401) { has401 = true; anyFailure = true; return; }
          if (!res?.ok) {
            anyFailure = true;
            console.error('[AutoSync] Failed to create scale figure after retries:', figure.id, res?.status);
            return;
          }

          const created: ScaleFigureData = await res.json();
          const current = useEditorStore.getState();
          // Only the id changes: edits made while the POST was in flight stay and are PATCHed
          // by the next batch (the snapshot below holds the values that were POSTed).
          useEditorStore.setState({
            localScaleFigures: current.localScaleFigures.map(f =>
              f.id === figure.id ? { ...f, id: created.id, versionId: created.versionId } : f
            ),
            selectedFigureId: current.selectedFigureId === figure.id ? created.id : current.selectedFigureId,
          });
          nextFiguresMap.set(created.id, { ...figure, id: created.id, versionId: created.versionId });
          createIdempotencyKeys.delete(`figure:${figure.id}`);
        } finally {
          syncingFigureTempIds.delete(figure.id);
        }
      })());
    }

    // Deleted figures (real IDs only) → DELETE
    for (const prev of prevScaleFigures) {
      if (prev.id <= 0 || currFigureMap.has(prev.id)) continue;
      tasks.push((async () => {
        const res = await fetchWithRetry(`/api/scale-figures/${prev.id}`, { method: 'DELETE', headers });
        if (res?.status === 401) { has401 = true; anyFailure = true; return; }
        if (!res?.ok) {
          anyFailure = true;
          console.error('[AutoSync] Failed to delete scale figure after retries:', prev.id, res?.status);
          return;
        }
        nextFiguresMap.delete(prev.id);
      })());
    }

    // Updated figures → PATCH
    for (const curr of currFigures) {
      if (curr.id < 0) continue;
      const prev = prevFigureMap.get(curr.id);
      if (!prev) continue;
      const changed = curr.position_x !== prev.position_x || curr.position_z !== prev.position_z ||
        curr.rotation_y !== prev.rotation_y || curr.isPublic !== prev.isPublic;
      if (!changed) {
        nextFiguresMap.set(curr.id, curr);
        continue;
      }
      tasks.push((async () => {
        const res = await fetchWithRetry(`/api/scale-figures/${curr.id}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({
            position_x: curr.position_x, position_z: curr.position_z,
            rotation_y: curr.rotation_y, isPublic: curr.isPublic,
          }),
        });
        if (res?.status === 401) { has401 = true; anyFailure = true; return; }
        if (!res?.ok) {
          anyFailure = true;
          console.error('[AutoSync] Failed to update scale figure after retries:', curr.id, res?.status);
          return;
        }
        nextFiguresMap.set(curr.id, curr);
      })());
    }
```

After `prevWalls = Array.from(nextWallsMap.values());` add `prevScaleFigures = Array.from(nextFiguresMap.values());`.

- [ ] **Step 8: Sync module — subscriptions**

Change the first subscription's condition to:

```ts
  if (state.localInstances !== prevState.localInstances || state.localWalls !== prevState.localWalls ||
      state.localScaleFigures !== prevState.localScaleFigures) {
```

In the version-change subscription, after `prevWalls = [];` add `prevScaleFigures = [];` and after `syncingWallTempIds.clear();` add `syncingFigureTempIds.clear();`.

- [ ] **Step 9: Save dialog (`src/components/SaveVersionDialog.tsx`)**

After the `walls: useEditorStore.getState().localWalls.map(w => ({ … }))` entry, add a comma and:

```ts
          scaleFigures: useEditorStore.getState().localScaleFigures.map(f => ({
            position_x: f.position_x,
            position_z: f.position_z,
            rotation_y: f.rotation_y,
            isPublic: f.isPublic,
          })),
```

- [ ] **Step 10: Verify**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 11: Commit**

```bash
git add src/store/editorStore.ts src/components/SaveVersionDialog.tsx
git commit -m "feat: keep scale figures in the editor store and sync them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `ScaleFigures` component, scene and viewer

**Files:**
- Create: `src/lib/scaleFigure.ts`
- Create: `src/components/ScaleFigures.tsx`
- Modify: `src/components/Scene.tsx` (props, mount next to `ModularWallsController`)
- Modify: `src/components/ArtworkPlacement.tsx:157-161`
- Modify: `src/pages/ViewerPage.tsx` (`ExhibitionData`, `<Scene>` prop)

**Interfaces:**
- Consumes: `ScaleFigureData`, `localScaleFigures`, `selectedFigureId`, `selectFigure`, `updateScaleFigure`, `setLocalScaleFigures`, `transformMode`, `setIsTransforming`, `wallEditor`, `activeVersionId` (Task 5); `PLAYER_STATURE` (Task 1); GLB node `ScaleFigure` (Task 2).
- Produces:
  ```ts
  // src/lib/scaleFigure.ts
  export const SCALE_FIGURE_HEIGHT: number;          // = PLAYER_STATURE
  export const SCALE_FIGURE_URL = '/models/scale-figure.glb';
  export interface FigurePose { position_x: number; position_z: number; rotation_y: number }
  export function spawnPoseFromCamera(position: {x:number;y:number;z:number}, direction: {x:number;y:number;z:number}): FigurePose;
  export const scaleFigureBridge: { spawnPose: () => FigurePose | null };
  // src/components/ScaleFigures.tsx
  export const ScaleFigures: (props: { viewerFigures?: ScaleFigureData[]; isEditor?: boolean }) => JSX.Element;
  ```
  `Scene` gets prop `viewerScaleFigures?: ScaleFigureData[]`.

- [ ] **Step 1: `src/lib/scaleFigure.ts`**

```ts
import { PLAYER_STATURE } from './playerDimensions';

/** The scale figure is as tall as the first-person player. */
export const SCALE_FIGURE_HEIGHT = PLAYER_STATURE;
export const SCALE_FIGURE_URL = '/models/scale-figure.glb';
/** Name of the mesh node in scale-figure.glb. */
export const SCALE_FIGURE_MESH = 'ScaleFigure';

/** Farthest floor point a new figure is put on (metres from the camera). */
const MAX_SPAWN_DISTANCE = 100;
/** Distance in front of the camera when the view doesn't reach the floor. */
const FALLBACK_SPAWN_DISTANCE = 3;

export interface FigurePose {
    position_x: number;
    position_z: number;
    rotation_y: number;
}

type Vec3 = { x: number; y: number; z: number };

/**
 * Where a new figure goes: where the view ray through the screen centre meets the floor
 * (y = 0), else a few metres in front of the camera. The model faces +Z; it is turned to
 * face the camera.
 */
export function spawnPoseFromCamera(position: Vec3, direction: Vec3): FigurePose {
    let x: number;
    let z: number;
    const t = direction.y < -1e-3 ? -position.y / direction.y : Infinity;
    if (t > 0 && t <= MAX_SPAWN_DISTANCE) {
        x = position.x + direction.x * t;
        z = position.z + direction.z * t;
    } else {
        const length = Math.hypot(direction.x, direction.z) || 1;
        x = position.x + (direction.x / length) * FALLBACK_SPAWN_DISTANCE;
        z = position.z + (direction.z / length) * FALLBACK_SPAWN_DISTANCE;
    }
    return { position_x: x, position_z: z, rotation_y: Math.atan2(position.x - x, position.z - z) };
}

/** Lets the editor toolbar (outside the canvas) ask the canvas where a new figure goes. */
export const scaleFigureBridge: { spawnPose: () => FigurePose | null } = {
    spawnPose: () => null,
};
```

- [ ] **Step 2: `src/components/ScaleFigures.tsx`**

```tsx
import { memo, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { TransformControls, useGLTF } from '@react-three/drei';
import { useEditorStore, type ScaleFigureData } from '@/store/editorStore';
import { useAuthStore } from '@/store/authStore';
import { SCALE_FIGURE_MESH, SCALE_FIGURE_URL, scaleFigureBridge, spawnPoseFromCamera } from '@/lib/scaleFigure';

useGLTF.preload(SCALE_FIGURE_URL);

// Shared by every figure: matte black, faceted. Selected: dark blue.
const FIGURE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.9, metalness: 0, flatShading: true });
const SELECTED_MATERIAL = new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.9, metalness: 0, flatShading: true });

const _euler = new THREE.Euler();
const _direction = new THREE.Vector3();

/** Turn around the vertical axis, in the full ±π range (XYZ Euler folds it into ±π/2). */
const yawOf = (object: THREE.Object3D): number => _euler.setFromQuaternion(object.quaternion, 'YXZ').y;

interface FigureProps {
    figure: ScaleFigureData;
    geometry: THREE.BufferGeometry;
    selected: boolean;
    onSelect?: (id: number) => void;
    groupRef?: (group: THREE.Group | null) => void;
}

const Figure = memo(function Figure({ figure, geometry, selected, onSelect, groupRef }: FigureProps) {
    return (
        <group
            ref={groupRef}
            position={[figure.position_x, 0, figure.position_z]}
            rotation={[0, figure.rotation_y, 0]}
            userData={{ scaleFigure: true }}
        >
            <mesh
                name="ScaleFigure"
                geometry={geometry}
                material={selected ? SELECTED_MATERIAL : FIGURE_MATERIAL}
                onClick={onSelect ? (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(figure.id); } : undefined}
            />
        </group>
    );
});

interface ScaleFiguresProps {
    /** Viewer: the published version's public figures. Editor: leave undefined (store). */
    viewerFigures?: ScaleFigureData[];
    isEditor?: boolean;
}

export const ScaleFigures = ({ viewerFigures, isEditor = true }: ScaleFiguresProps) => {
    const { nodes } = useGLTF(SCALE_FIGURE_URL);
    const geometry = (nodes[SCALE_FIGURE_MESH] as THREE.Mesh).geometry;
    const camera = useThree((s) => s.camera);

    const localFigures = useEditorStore((s) => s.localScaleFigures);
    const selectedFigureId = useEditorStore((s) => (isEditor ? s.selectedFigureId : null));
    const wallEditorOpen = useEditorStore((s) => isEditor && !!s.wallEditor);
    const transformMode = useEditorStore((s) => s.transformMode);
    const activeVersionId = useEditorStore((s) => s.activeVersionId);
    const selectFigure = useEditorStore((s) => s.selectFigure);
    const updateScaleFigure = useEditorStore((s) => s.updateScaleFigure);
    const setIsTransforming = useEditorStore((s) => s.setIsTransforming);
    const setLocalScaleFigures = useEditorStore((s) => s.setLocalScaleFigures);
    const hasToken = useAuthStore((s) => !!s.token);

    const interactive = isEditor && !viewerFigures;
    // The selected figure's group, set through its ref (null when nothing is selected)
    const [selectedObject, setSelectedObject] = useState<THREE.Group | null>(null);

    // Editor: load the version's figures
    useEffect(() => {
        if (!interactive) return;
        if (!hasToken || !activeVersionId) {
            setLocalScaleFigures([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/scale-figures?versionId=${activeVersionId}`, {
                    headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: ScaleFigureData[] = await res.json();
                if (!cancelled) setLocalScaleFigures(data);
            } catch (err) {
                console.error('Failed to load scale figures:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [interactive, hasToken, activeVersionId, setLocalScaleFigures]);

    // Editor: the toolbar asks here where a new figure goes
    useEffect(() => {
        if (!interactive) return;
        scaleFigureBridge.spawnPose = () => {
            camera.getWorldDirection(_direction);
            return spawnPoseFromCamera(camera.position, _direction);
        };
        return () => { scaleFigureBridge.spawnPose = () => null; };
    }, [interactive, camera]);

    const handleTransformChange = useCallback(() => {
        if (!selectedObject) return;
        // Figures stand upright on the floor: drop any tilt the free rotation ring adds.
        const yaw = yawOf(selectedObject);
        selectedObject.position.y = 0;
        selectedObject.rotation.set(0, yaw, 0);
    }, [selectedObject]);

    const handleTransformEnd = useCallback(() => {
        setIsTransforming(false);
        const id = useEditorStore.getState().selectedFigureId;
        if (id === null || !selectedObject) return;
        updateScaleFigure(id, {
            position_x: selectedObject.position.x,
            position_z: selectedObject.position.z,
            rotation_y: yawOf(selectedObject),
        });
    }, [selectedObject, setIsTransforming, updateScaleFigure]);

    const figures = viewerFigures ?? localFigures;
    const rotating = transformMode === 'rotate';

    return (
        <group visible={!wallEditorOpen}>
            {figures.map((figure) => (
                <Figure
                    key={figure.id}
                    figure={figure}
                    geometry={geometry}
                    selected={figure.id === selectedFigureId}
                    onSelect={interactive ? selectFigure : undefined}
                    groupRef={figure.id === selectedFigureId ? setSelectedObject : undefined}
                />
            ))}
            {interactive && !wallEditorOpen && selectedObject && (
                <TransformControls
                    object={selectedObject}
                    mode={rotating ? 'rotate' : 'translate'}
                    showX={!rotating}
                    showY={rotating}
                    showZ={!rotating}
                    onMouseDown={() => setIsTransforming(true)}
                    onMouseUp={handleTransformEnd}
                    onChange={handleTransformChange}
                />
            )}
        </group>
    );
};
```

- [ ] **Step 3: Mount in `src/components/Scene.tsx`**

Add `import { ScaleFigures } from './ScaleFigures';` and extend the store type import to `import { useEditorStore, type ArtworkInstanceData, type ModularWallData, type ScaleFigureData } from '../store/editorStore';`.
In `SceneProps` after `viewerWalls?: ModularWallData[];` add:

```ts
    /** Viewer: public scale figures of the published version. */
    viewerScaleFigures?: ScaleFigureData[];
```

Destructure it: `({ isEditor = true, viewerInstances, viewerWalls, viewerScaleFigures, onShadersReady }: SceneProps)`.
After `<ModularWallsController viewerWalls={viewerWalls} isEditor={isEditor} />` add:

```tsx
                    <ScaleFigures viewerFigures={viewerScaleFigures} isEditor={isEditor} />
```

- [ ] **Step 4: Viewer (`src/pages/ViewerPage.tsx`)**

Type import: `import type { ArtworkInstanceData, ModularWallData, ScaleFigureData } from '../store/editorStore';`
In `interface ExhibitionData` after `walls: ModularWallData[];` add `scaleFigures?: ScaleFigureData[];`.
On `<Scene … viewerWalls={data.walls}` add the prop `viewerScaleFigures={data.scaleFigures ?? []}`.

- [ ] **Step 5: Drops ignore figures (`src/components/ArtworkPlacement.tsx`)**

Inside the ancestor walk of the intersect filter, after `if (obj.name === '__ghost__') return false;` add:

```ts
                    if (obj.userData.scaleFigure) return false; // figures don't take artworks
```

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run build`
Expected: both succeed. Rapier must stay out of the main bundle: `grep -l "CapsuleCollider" dist/assets/*.js` lists only the lazy physics chunk (file name contains `PhysicsWorld`), not `index-*.js`.

The spawn math (`spawnPoseFromCamera`) is checked in Task 8 Step 2: a figure added while looking at the floor appears in the middle of the view, facing the camera.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scaleFigure.ts src/components/ScaleFigures.tsx src/components/Scene.tsx src/components/ArtworkPlacement.tsx src/pages/ViewerPage.tsx
git commit -m "feat: render scale figures in the editor and the viewer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Editor UI — toolbar, keys, properties

**Files:**
- Modify: `src/pages/EditorPage.tsx` (imports :14-17, selectors ~:246-262, key handler ~:546-557, toolbar :706-729)
- Modify: `src/components/PropertiesPanel.tsx` (imports :1-29, `PropertiesPanel` :116-138 and :421-449, new `ScaleFigurePropertiesContent` after `WallPropertiesContent`)

**Interfaces:**
- Consumes: `addScaleFigure`, `selectFigure`, `updateScaleFigure`, `deleteScaleFigure`, `selectedFigureId`, `localScaleFigures`, `setTransformMode`, `nextTempId` (Task 5); `scaleFigureBridge`, `SCALE_FIGURE_HEIGHT` (Task 6).
- Produces: user-facing UI only.

- [ ] **Step 1: EditorPage imports**

Line 17: add `PersonStanding` to the lucide import:
`import { Eye, EyeOff, Move, RotateCw, Maximize2, Footprints, PanelsTopLeft, Settings, PersonStanding } from 'lucide-react';`
Add: `import { scaleFigureBridge } from '../lib/scaleFigure';`

- [ ] **Step 2: EditorPage selector + add handler**

Next to `const selectedInstanceId = useEditorStore((state) => state.selectedInstanceId);` add:

```ts
  const selectedFigureId = useEditorStore((state) => state.selectedFigureId);
```

Inside the `EditorPage` component body (near the other handlers such as `openWallEditorForSelection`) add:

```ts
  // Scale figure: placed where the view meets the floor, facing the camera, then selected.
  const placeScaleFigure = () => {
    const pose = scaleFigureBridge.spawnPose();
    if (!pose) return;
    const id = nextTempId();
    const store = useEditorStore.getState();
    store.addScaleFigure({ id, ...pose, isPublic: false });
    store.selectFigure(id);
    store.setTransformMode('translate');
  };
```

- [ ] **Step 3: EditorPage keys**

After the wall-specific hotkey block (the `if (store.selectedWallId) { … return; }` block) add:

```ts
      // Scale figure: G/R pick the gizmo mode, Entf/Backspace removes it
      if (store.selectedFigureId !== null) {
        if (key === 'r' || key === 'g') {
          e.preventDefault();
          setTransformMode(key === 'r' ? 'rotate' : 'translate');
        } else if (key === 'delete' || key === 'backspace') {
          e.preventDefault();
          store.deleteScaleFigure(store.selectedFigureId);
        }
        return;
      }
```

Escape and clicks into empty space already clear the figure: they call `selectInstance(null)`, which now resets `selectedFigureId` (Task 5).

- [ ] **Step 4: EditorPage toolbar**

G and R buttons: change `disabled={!selectedInstanceId}` on the Grab and Rotate `ToolButton`s to `disabled={!selectedInstanceId && selectedFigureId === null}` (Scale and X/Y/Z stay as they are).
After the first-person `ToolButton` (Footprints) add:

```tsx
          {/* Scale figure (1.73 m) */}
          <ToolButton icon={<PersonStanding size={16} />} tooltip="Maßstabsfigur hinzufügen (1,73 m)" onClick={placeScaleFigure} />
```

- [ ] **Step 5: PropertiesPanel wiring**

Lucide import: add `Eye,` and `EyeOff,` to the list. Add `import { SCALE_FIGURE_HEIGHT } from '@/lib/scaleFigure';`.

In `PropertiesPanel`, after `const selectedWallId = …` add `const selectedFigureId = useEditorStore((state) => state.selectedFigureId);`, then:
- the auto-switch effect: condition `if (selectedId || selectedWallId || selectedFigureId !== null)` and deps `[selectedId, selectedWallId, selectedFigureId]`;
- `const hasPropertiesContent = selectedId || selectedWallId || selectedFigureId !== null;`
- render: replace `selectedWallId ? <WallPropertiesContent /> :` with

```tsx
                        selectedFigureId !== null ? <ScaleFigurePropertiesContent /> :
                        selectedWallId ? <WallPropertiesContent /> :
```

- [ ] **Step 6: `ScaleFigurePropertiesContent`**

Add after `WallPropertiesContent`:

```tsx
const ScaleFigurePropertiesContent = () => {
    const figure = useEditorStore((state) => state.localScaleFigures.find(f => f.id === state.selectedFigureId));
    const updateScaleFigure = useEditorStore((state) => state.updateScaleFigure);
    const deleteScaleFigure = useEditorStore((state) => state.deleteScaleFigure);
    if (!figure) return null;
    const toDeg = (rad: number) => ((rad * 180) / Math.PI).toFixed(1);
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
            <div className="text-xs text-zinc-500 italic">
                Maßstabsfigur — {SCALE_FIGURE_HEIGHT.toFixed(2).replace('.', ',')} m
            </div>
            <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Position</Label>
                <div className="grid grid-cols-2 gap-2">
                    {(['x', 'z'] as const).map((axis) => (
                        <div key={axis} className="space-y-1">
                            <Label className="text-[10px] text-zinc-500 uppercase">{axis}</Label>
                            <NumericInput step="0.01" value={figure[`position_${axis}`].toFixed(3)} onChange={(raw) => {
                                const v = parseFloat(raw);
                                if (!isNaN(v)) updateScaleFigure(figure.id, { [`position_${axis}`]: v });
                            }} className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100" />
                        </div>
                    ))}
                </div>
            </div>
            <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Rotation (°)</Label>
                <NumericInput step="1" value={toDeg(figure.rotation_y)} onChange={(raw) => {
                    const deg = parseFloat(raw);
                    if (!isNaN(deg)) updateScaleFigure(figure.id, { rotation_y: (deg * Math.PI) / 180 });
                }} className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100 w-1/3" />
            </div>
            <Separator className="bg-zinc-800" />
            <Button
                variant="secondary"
                size="sm"
                aria-pressed={figure.isPublic}
                onClick={() => updateScaleFigure(figure.id, { isPublic: !figure.isPublic })}
                className={cn("w-full text-xs", figure.isPublic ? "bg-emerald-600/20 text-emerald-400" : "bg-zinc-800 text-zinc-100")}
                title="Legt fest, ob Besucher die Figur im öffentlichen Viewer sehen"
            >
                {figure.isPublic
                    ? <><Eye className="h-4 w-4 mr-2" /> Im Viewer sichtbar</>
                    : <><EyeOff className="h-4 w-4 mr-2" /> Nur im Editor</>}
            </Button>
            <Button
                variant="secondary"
                size="sm"
                onClick={() => deleteScaleFigure(figure.id)}
                className="w-full text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30"
            >
                <Trash2 className="h-4 w-4 mr-2" /> Entfernen
            </Button>
        </div>
    );
};
```

`{ [`position_${axis}`]: v }` has type `{ [x: string]: number }`; if TS rejects it for `Partial<Omit<ScaleFigureData,'id'>>`, write it as `axis === 'x' ? { position_x: v } : { position_z: v }`.

- [ ] **Step 7: Verify**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 8: Commit**

```bash
git add src/pages/EditorPage.tsx src/components/PropertiesPanel.tsx
git commit -m "feat: add, move and publish scale figures from the editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end check and docs

**Files:**
- Modify: `CLAUDE.md` (Architecture section + Phase 6 player constants)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Start both servers**

`preview_start` with `curahub-backend-local` (port 3000) and `curahub-frontend-local` (port 5173) from `.claude/launch.json`. Confirm `curl -s localhost:3000/` → `CuraHub API Phase 5`. Apply the migration to the DB the backend uses if it isn't the one from Task 3.

- [ ] **Step 2: Functional check in the built-in browser (DOM + network; rendering is paused there)**

Log in as the user normally does (ask the user to log in in the browser pane if no session exists — never type credentials). Open an exhibition in the editor, then:
1. Click the `PersonStanding` toolbar button → `read_network_requests` shows `POST /api/scale-figures` 201; the properties panel shows "Maßstabsfigur — 1,73 m".
2. Change X in the panel → `PATCH /api/scale-figures/:id` 200.
3. Click "Nur im Editor" → button reads "Im Viewer sichtbar"; PATCH with `isPublic: true`.
4. Reload → figure still there (`GET /api/scale-figures?versionId=…` returns it).
5. Add a second figure, leave it private, delete it with Backspace → `DELETE` 200.
6. `read_console_messages` with `onlyErrors: true` → no new errors.

- [ ] **Step 3: Visual check in headless Chrome (CLAUDE.md: agent browser panes don't render)**

Start Chrome: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --enable-unsafe-webgpu --remote-debugging-port=9333 --user-data-dir=<scratchpad>/chrome about:blank` (background).
Get a dev token for your own dev user (local dev DB only): `cd server && node -e "require('dotenv').config(); const jwt=require('jsonwebtoken'); console.log(jwt.sign({userId: <your dev user id>, role: 'admin'}, process.env.JWT_SECRET, {expiresIn: '1h'}))"` and write it to `localStorage['curahub-auth']` in the headless page (same JSON shape the app stores; read it from the built-in browser's localStorage after Step 2).
Create `<scratchpad>/cdp.mjs`:

```js
// node cdp.mjs <url> <out.png> [expression evaluated before the screenshot]
import { writeFileSync } from 'node:fs';
const [, , url, out, expression] = process.argv;
const page = (await (await fetch('http://127.0.0.1:9333/json')).json()).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id); };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
if (url !== '-') { await send('Page.navigate', { url }); await new Promise((r) => setTimeout(r, 15000)); }
if (expression) console.log(JSON.stringify((await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
ws.close();
```

Shots to take (both `?renderer=webgpu` and `?renderer=webgl`):
1. Editor perspective with the figure selected (gizmo visible, dark-blue figure) next to a framed artwork → figure reads as a person, correct size relative to the ~3.1 m modular wall.
2. First person (press `v` via `Runtime.evaluate` dispatching a `keydown`), looking at a figure 3–4 m away → the horizon (eye line) passes through the figure's eyes, i.e. the camera is at ≈ 1.62 m.
3. Public viewer `/exhibition/<exhibition slug>` of the published version (publish it in the editor's version panel first, with one public and one private figure) → only the public figure appears.
Read each PNG with the Read tool and check it. Kill Chrome afterwards.

- [ ] **Step 4: Docs (`CLAUDE.md`)**

In "Architecture", after the "Gaussian Splats" subsection add:

```markdown
### Maßstabsfigur (scale figure)

- Black low-poly person, exactly 1.73 m (`SCALE_FIGURE_HEIGHT` = `PLAYER_STATURE`, `src/lib/playerDimensions.ts`), model `public/models/scale-figure.glb` (mesh `ScaleFigure`, built in Blender from a skin-modifier skeleton, see `docs/superpowers/plans/2026-09-28-scale-figure.md` Task 2).
- Table `ScaleFigure` per version (`position_x/z`, `rotation_y`, `isPublic`), route `/scale-figures`, copied with versions and merges; `/public` returns only `isPublic` figures.
- Store: `localScaleFigures`, `selectedFigureId` (exclusive with instance/wall/zone selection), auto-sync diff block like walls, no undo.
- `ScaleFigures.tsx`: one shared geometry + two shared materials, `TransformControls` (X/Z move, Y turn, tilt removed in `onChange`), hidden in the wall editor, no collider. New figures: toolbar button → `scaleFigureBridge.spawnPose()` (screen-centre ray on the floor, facing the camera).
- Artwork drops ignore figures (`userData.scaleFigure`).
```

In "Phase 6", replace the line `**Player constants:** `PLAYER_HEIGHT = 1.8`, `PLAYER_SPEED = 5`. Always use delta time: `velocity * delta`.` with:

```markdown
**Player constants** (`src/lib/playerDimensions.ts`): stature 1.73 m, eye height 1.62 m, capsule radius 0.3 / half height 0.565 (body centre 0.865). Import them from the lib, not from `Player.tsx` (Rapier chunk). Always use delta time: `velocity * delta`.
```

- [ ] **Step 5: Final checks**

Run: `npm run lint && npm run build && (cd server && npx tsc --noEmit && NODE_ENV=test npx jest src/tests/scaleFigures.test.ts)`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe the scale figure and the player's eye height

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

