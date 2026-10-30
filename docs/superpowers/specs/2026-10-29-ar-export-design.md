# AR-Export veröffentlichter Ausstellungen — Design Spec
**Date:** 2026-10-29
**Status:** Approved (in chat), awaiting spec review
**Part:** B of the mobile viewer programme (see `2026-10-29-published-version-protection-design.md`, table at the top). Builds on D: a published version never changes, so its export never goes stale.

---

## Overview

Every published version gets one AR file pair of the whole exhibition — **GLB** (Android, Scene Viewer) and **USDZ** (iOS, AR Quick Look) — with the works **and the Satellit room**. A server job renders the version in headless Chromium with the app's own components, so frames, passepartouts and hanging match the viewer exactly. Visitors open it from the public viewer with one tap; on desktop they get a QR code. Curators see the export's state in the editor.

Decisions taken in chat:

- One file with **works + room** (no works-only variant). Placed life-size on the floor; pinch-to-scale is left on (both platforms allow it by default), so it also works as a table-top model.
- Entry points: public viewer button on phones, QR dialog on desktop, **status + download + „Neu erzeugen" in the editor**.
- Built by **headless Chromium on the server** (approach A), not in Node and not in the curator's browser.
- Publishing deletes the previous version's files **at once** (not when the new ones are ready), so AR never shows another state than the viewer; meanwhile the button says „AR wird vorbereitet…".
- No precise registration to the real Satellit; the visitor places the model by hand.
- Unpublished versions have no export and are not reachable.

Success: after „Veröffentlichen", within a few minutes, a visitor on an iPhone or an ARCore Android phone taps „In AR ansehen" on `/exhibition/:slug` and stands in the exhibition at real size; the previous version's files are gone from disk.

Out of scope: works-only variant, registration/anchoring to the real room, splats in AR, the twin-joystick viewer (A), the mobile planning view (C), text/labels in the AR scene, automatic re-export after app updates (manual „Neu erzeugen" covers it).

---

## 1. Lifecycle

| Event | Effect |
|---|---|
| `PATCH …/versions/:vid/publish` | Delete files + `ArExport` rows of the exhibition's other versions; upsert `ArExport { status: 'queued' }` for `:vid`; enqueue. |
| Version deleted / exhibition deleted | Delete its files (rows cascade). |
| Server start | Enqueue every published version whose export is missing or not `done` (covers exhibitions published before this feature and jobs cut off by a restart). |
| „Neu erzeugen" (editor) | `POST /api/exhibitions/:eid/versions/:vid/ar-export` → status `queued`, enqueue. Same access as publishing (project access, `exhibitionAccessFilter`). |
| Job finishes for a version that is no longer published | Result discarded, files deleted. |

Artwork metadata (`PUT /artworks/:id`) does not trigger a re-export: titles are not in the file, splats are left out, books are geometry only.

Queue: in-process, one job at a time, same pattern as `videoJobs.ts` / `bookJobs.ts` (single container).

---

## 2. Content of the export

World units metres, Y up, origin at the room centre on the floor (Quick Look and Scene Viewer anchor the bounding box's bottom centre on the detected floor).

| Element | Exported as |
|---|---|
| Satellit | walls, floor, doors, sills, window glass (transparent material). The street view outside the windows is left out. |
| Pictures | picture plane + frame (generated profile geometry, wood/metal textures from the frame worker) + passepartout. Picture textures JPEG, longest side ≤ 2048 px. |
| Videos | poster/still frame on the picture plane, or on the `Monitor65` model for monitors. |
| 3D models | as uploaded (GLB pipeline output). |
| Modular walls | yes. |
| Books | pedestal + closed book with its cover texture; no PDF. |
| Splats | left out (neither platform renders Gaussian splats). |
| Scale figures | only `isPublic` figures, as in `/public`. |
| Hidden / invisible objects, hit proxies, helpers | left out. |

Size: target < 50 MB per file. If either file exceeds **80 MB** the job runs once more with textures ≤ **1024 px**; if a file still exceeds **150 MB** the export fails with „Zu groß für AR".

Lighting: AR viewers light the model with the real environment; the gallery lighting is not exported. Pictures keep PBR materials (roughness 1, metalness 0); whether they need an exposure correction is checked during the manual test and, if needed, becomes a constant in the export step.

---

## 3. Server

### Schema (one migration)

```prisma
model ArExport {
  id          Int       @id @default(autoincrement())
  versionId   Int       @unique
  version     ExhibitionVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  status      String    // 'queued' | 'running' | 'done' | 'failed'
  glb_file    String?
  usdz_file   String?
  glb_size    Int?
  usdz_size   Int?
  skipped     Int       @default(0)   // works that failed to load and were left out
  error       String?
  started_at  DateTime?
  finished_at DateTime?
}
```

### Storage

`<uploads>/.ar/<versionId>-<random>.glb|.usdz` — dot-directory, never served by `express.static` (as `.books/`). A new name per export, so files are served `Cache-Control: public, max-age=31536000, immutable`.

### Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/public/ar/:slug.glb`, `…/:slug.usdz` | none | Files of the exhibition's published version; `model/gltf-binary` / `model/vnd.usdz+zip`, `Range` support; 404 when not published or not `done`. |
| `GET /api/public/exhibition/:slug` | none | Response gains `ar: { status, glbUrl?, usdzUrl? }` (status only `queued` \| `running` \| `done`; `failed` is reported as unavailable). |
| `GET /api/exhibitions/:eid/versions/:vid/ar-export` | project access | Full row + `queuePosition` for the editor. |
| `POST /api/exhibitions/:eid/versions/:vid/ar-export` | project access (as publish) | „Neu erzeugen"; 400 for unpublished versions. |
| `GET /api/exhibitions/:eid/versions/:vid/ar-export/:format` | project access | Download (`Content-Disposition: attachment`). |
| `GET /api/ar-export/:vid/scene` | job token | Scene data of exactly this version (same shape as the public exhibition payload). |
| `POST /api/ar-export/:vid/files` | job token | Multipart upload of `glb` + `usdz` (+ `skipped` count); 403 on a wrong/expired token. |

Job tokens: signed with an in-memory secret (never `JWT_SECRET`), bound to `versionId` + job id, valid 10 min, single job only. They are passed in the URL fragment (`#token=…`), so they never reach a request log.

Every status change calls `publishVersionEvent(req, exhibitionId, 'arExport', versionId)` so open editors refetch.

### Job (`server/src/lib/arExportJobs.ts`)

1. Mark `running`, create the job token.
2. Launch Chromium through a small driver interface (`server/src/lib/headlessBrowser.ts`: `launch() → { open(url), waitForDone(timeoutMs), close() }`, CDP over `--remote-debugging-pipe`, no Puppeteer): `chromium --headless=new --use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist --no-sandbox` with its own temp `--user-data-dir` per launch (container user is unprivileged). Alpine's chromium ships no SwiftShader, so WebGL comes from Mesa's software Vulkan driver (lavapipe).
3. Open `http://127.0.0.1:<PORT>/ar-export/<vid>?maxTexture=2048#token=…`.
4. The page uploads the files; the job waits for the upload (or a page error reported over CDP).
5. Size check → optional second run with `maxTexture=1024` → size limit.
6. Version still published? Store files, delete the previous files of this version, `done`. Otherwise delete, drop the row.
7. Timeout **5 min** → SIGKILL, `failed` with the error text. No automatic retry.

### Docker

Runtime image: `apk add chromium font-noto mesa-vulkan-swrast vulkan-loader` (~300–400 MB; the last two, ~12 MB, are the software WebGL via Mesa lavapipe). New system check `arExport` (`lib/systemChecks`): Chromium binary present and launchable; shown in the wizard and on `/users`. Missing Chromium → jobs fail with „Chromium nicht installiert".

---

## 4. Export page (`/ar-export/:versionId`)

Own lazy route chunk, outside `ProtectedRoute`, `noindex`; without a valid token it shows nothing.

- Fetches `GET /api/ar-export/:vid/scene` with the token.
- Renders a minimal Canvas (classic `WebGLRenderer`, no physics, no controls, no hit proxies) with `Satellit` and the existing instance components in an **export mode** (`exportMode` flag in a small context): full texture tier, videos as still, no window street view, no selection UI.
- Waits until every artwork, frame texture and model has loaded (`artworkLoadProgress`, `onFrameTexturesReady`); works whose load fails count as `skipped`.
- `prepareExportScene(root, { maxTexture })` (pure, `src/lib/arExport/prepareScene.ts`, Vitest): clones the scene graph, expands `InstancedMesh` frames into plain meshes (USDZExporter has no instancing), removes splats, invisible objects and helpers, downsizes textures to `maxTexture`, bakes world transforms relative to the room origin.
- Exports with three's `GLTFExporter` (`binary: true`) and `USDZExporter`, uploads both to `POST /api/ar-export/:vid/files`.

---

## 5. UI

### Public viewer (`/exhibition/:slug`)

Button „In AR ansehen" in the viewer header, behaviour from `arLaunch(platform, urls)` (pure, `src/lib/arExport/launch.ts`, Vitest):

| Platform | Behaviour |
|---|---|
| iOS / iPadOS | `<a rel="ar" href="…usdz">` with a child `<img>` (Quick Look requires it) |
| Android | `intent://arvr.google.com/scene-viewer/1.2?file=<glb>&mode=ar_preferred&title=<exhibition>#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=<viewer url>;end;` — without ARCore Scene Viewer falls back to 3D |
| Desktop | dialog „Auf dem Handy öffnen" with a QR code for `/exhibition/:slug?ar=1` (generated in the browser, small dependency, no server) and the line „Scanne den Code mit dem Handy, um die Ausstellung in echter Größe in deinem Raum zu sehen." |

- `?ar=1` on a phone: an extra large button „In AR öffnen" over the loading screen (iOS needs a tap; no auto-launch).
- Export `queued`/`running`: button disabled, label „AR wird vorbereitet…", the page re-fetches the public payload every 15 s until `done`.
- No export (failed or missing): button hidden.

### Editor

Version panel, row „AR-Export" on the published version:

- „In Warteschlange (Platz N)" · „Wird erzeugt…" · „Fertig · GLB 12 MB · USDZ 14 MB" (+ „2 Werke ausgelassen" when `skipped > 0`) · „Fehlgeschlagen: <error>".
- Buttons „GLB herunterladen", „USDZ herunterladen", „Neu erzeugen" (everyone who may publish).
- Refetches on the `arExport` version event; no polling.

Wiki: a short section in `src/wiki/project-management.md` (publishing) on the AR export, and one in `src/wiki/viewer.md`.

---

## 6. Error handling

| Case | Behaviour |
|---|---|
| Chromium missing | `failed` „Chromium nicht installiert", system check warns |
| Timeout / crash | `failed` with error text, only „Neu erzeugen" retries |
| A work fails to load | left out, `skipped` + 1, export continues |
| File > 80 MB | second run at 1024 px; still > 150 MB → `failed` „Zu groß für AR" |
| Republished during a job | result discarded; the new version's job runs next |
| Job token wrong/expired | 403, nothing stored |
| Server restart mid-job | row stays `running` → requeued at start |

---

## 7. Tests

- **Jest (server):** queue + lifecycle (publish deletes the other versions' files and rows, delete cleans up, start requeues missing/`running`/`queued`); token sign/verify/expiry/version binding; `public/ar` 404 for unpublished or not-done, correct MIME and `Range`; upload with a wrong token → 403; republished-during-job discards; size steps (80 MB rerun, 150 MB fail). Chromium is behind the `headlessBrowser` interface and faked in tests.
- **Vitest (client):** `prepareExportScene` (instances expanded with the right matrices, splats/invisible/helpers removed, textures capped); `arLaunch` per platform (iOS/iPadOS-desktop-UA detection, Android intent string, desktop QR).
- **Manual, on the test stack:** publish → wait → open on an iPhone (Quick Look) and an Android phone (Scene Viewer); check scale against a known picture size, frames/passepartouts, file sizes, that the old files are gone after re-publishing.
