# Bücher auf Sockeln (PDF → 3D-Buch + Flip-Viewer) — Design Spec
**Date:** 2026-09-30
**Status:** Approved (in chat), awaiting spec review

---

## Overview

Curators upload PDFs in the asset browser. The server reads page count and page size, renders page 1 as the cover and stores the PDF privately. In the room a book is one placeable instance: a **closed book lying flat, cover up, on a 1.20 m pedestal**, with a label plate (artist, title, year) on the pedestal. Clicking the book opens a 2D flip-through viewer; while it is open the 3D controls are locked. ESC or the close button closes it and releases the controls.

Decisions taken in chat:

- Presentation **A**: closed, flat, cover up (no lectern tilt, no open spread).
- Server rendering with **poppler-utils** (`pdfinfo`, `pdftoppm`) as a child process; viewer with **pdfjs-dist** in the browser.
- Processing feedback by **polling** the existing `GET /assets/:id/processing` pattern — no WebSocket/SSE.
- Canvas ↔ overlay state in a **Zustand store**, not React context.
- Public access **C**: a per-book switch „Im öffentlichen Viewer lesbar" (default off). The PDF is never served by the public static `/uploads` handler.

Out of scope: open-book / lectern presentation, zoom and text search in the viewer, a download button, pre-rendering all pages, OCR, WebSocket/SSE, books on walls, undo/redo for book settings (artwork metadata has none either).

---

## 1. Database & storage

### Prisma (`server/prisma/schema.prisma`) — one additive migration

```prisma
model Artwork {
  // existing: title, artist, year, description, width, height (cm)
  depth          Float?   // Book thickness in cm; null = automatic from the page count
  publicReadable Boolean  @default(false) // Book can be opened in the public viewer
}
```

- `Asset.type = "book"` (type is a string, no enum change).
- `ArtworkInstance.medium = "book"`, `wallId = null`, `position_y = 0`, scale 1. The pedestal is **not** a separate record: one instance = pedestal + book + label plate, so they cannot come apart.

### Files

| File | Where | Served by |
|---|---|---|
| Original PDF | `<uploads>/.books/<stored>.pdf` | only `GET /api/books/:assetId/pdf` (§2.4) — dot-directory, never served by `express.static` (same trick as `.partial`) |
| Cover, full (longest edge 2048 px, WebP) | `<uploads>/<stem>-cover.webp` = `Asset.path` | `/uploads` (public, harmless) |
| Cover thumbs | same tier naming as image assets (`-thumb-512/256.webp`), `Asset.thumbnailPath` | `/uploads` |
| Cover from the PDF (kept for „Zurücksetzen") | `<uploads>/<stem>-cover-pdf.webp` | `/uploads` |

`Asset.path` pointing at the cover means every generic code path that treats `path` as a displayable image (tiles, `artworkTextureManager` LOD tiers) works unchanged.

### `Asset.metadata` for books

```ts
type BookAssetMetadata = {
  pdfFile: string;          // basename inside <uploads>/.books/
  pageCount: number;
  pageWidthMm: number;      // page 1, after /Rotate
  pageHeightMm: number;
  coverSource: 'pdf' | 'override';
  coverVersion: number;     // +1 on every cover change; clients append ?v=<coverVersion> (cover file names stay the same, /uploads is cached 7 days)
  originalSize: number;     // bytes
  error?: string;           // German message when status = 'failed'
};
```

`Artwork.width/height` (cm) are filled from `pageWidthMm/pageHeightMm` when processing finishes.

---

## 2. Server

### 2.1 Upload (`server/src/routes/upload.ts`)

- `AssetType` gains `'book'`. `detectAssetType`: extension `.pdf` **and** the file starts with `%PDF-` (magic bytes read from disk; the browser's MIME type is not trusted). Otherwise 400 „Datei ist kein gültiges PDF".
- Size limit 200 MB; files > 100 MB go through the existing chunked upload (Cloudflare limit).
- Duplicate detection by SHA-256 as for every type.
- The PDF is moved to `<uploads>/.books/`, the asset is created with `status: 'processing'`, `path = /uploads/<stem>-cover.webp` (file appears when the job finishes; `processing` keeps clients from loading it), an `Artwork` is created as for other types, and `enqueueBookJob(assetId)` is called. Response as today, `status: 'processing'`.

### 2.2 Job queue (`server/src/lib/bookJobs.ts`)

Same shape as `videoJobs.ts`: in-memory queue, concurrency 1, `resumeBookJobs()` on startup re-enqueues assets with `type = 'book'` and `status = 'processing'`. Phases reported by `/assets/:id/processing`: `queued` → `analyzing` → `cover` → `tiers`.

1. **analyzing** — `pdfinfo -box -f 1 -l 1 <file>` via `execFile` (argument array, no shell), timeout 30 s → `SIGKILL`. Parse `Pages`, `Encrypted`, page-1 `CropBox` (fallback `MediaBox`) and `Page rot`. `Encrypted: yes` with a user password → fail „PDF ist passwortgeschützt". `Pages: 0` → fail „PDF enthält keine Seiten".
2. **cover** — `pdftoppm -f 1 -l 1 -scale-to 2048 -png <file> <tmp>` via `execFile`, timeout 60 s. Output pixel count capped by `-scale-to`.
3. **tiers** — sharp: full WebP (2048, quality 80) as `-cover.webp` and `-cover-pdf.webp`, thumbs 512/256. Fill `Artwork.width/height`, set metadata, `status = 'ready'`.

Any failure: `status = 'failed'`, `metadata.error` set, temp files removed. The PDF stays so the curator can delete the asset normally.

Pure helper `server/src/lib/pdfGeometry.ts`: `parsePdfInfo(stdout)` → `{ pages, encrypted, box: {w, h} in pt, rotate }`; `pageSizeMm(box, rotate)` (pt × 25.4 / 72, swap for 90/270).

Docker: `apk add poppler-utils` in the runtime stage next to ffmpeg. Local dev: `brew install poppler`.

### 2.3 Book settings

- `POST /assets/:id/cover` (multer, JPG/PNG, 20 MB) — sharp regenerates `-cover.webp` + thumbs from the upload, `coverSource = 'override'`. Invalid image → 400 „Bild konnte nicht gelesen werden", old cover stays.
- `DELETE /assets/:id/cover` — copies `-cover-pdf.webp` back to `-cover.webp`, regenerates thumbs, `coverSource = 'pdf'`.
- `PUT /artworks/:id` (the existing artwork update) gains `depth` (number 0.3–8 or null) and `publicReadable` (boolean), Zod-validated.
- Both cover endpoints increment `metadata.coverVersion` and return the updated asset.
- `DELETE /assets/:id` additionally removes `.books/<pdfFile>` and the three cover files (honouring the existing shared-`fileHash` rule).

### 2.4 PDF route (`server/src/routes/books.ts`)

`GET /api/books/:assetId/pdf` (extensionless → Cloudflare neither caches it nor drops `Range`, same reason as `/uploads/stream`).

Access if **either**:
- a valid JWT whose user owns the asset's project, **or**
- `artwork.publicReadable = true` **and** the artwork has an instance in a version with `is_published = true`.

Otherwise 404 (not 403 — don't confirm existence). File path from `metadata.pdfFile` through the `resolveUploadPath`-style basename check. `res.sendFile` (Range support, `Accept-Ranges: bytes`). Headers: `Content-Type: application/pdf`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: private, max-age=3600`.

### 2.5 Public route

`GET /public/exhibition/:slug` returns all book instances (the book stands in the room); `artwork.publicReadable` only gates opening it. For books it never includes `metadata.pdfFile`; the client derives the PDF URL from the asset id.

---

## 3. Asset browser (curation)

- `src/lib/uploadFiles.ts`: `.pdf` accepted (`UPLOAD_ACCEPT`, `isSupportedUploadFile`).
- `VideoProcessingBadge` → `AssetProcessingBadge` with phase labels per type; book phases: „In Warteschlange", „PDF wird gelesen", „Cover wird erzeugt", „Vorschaubilder". Drag stays blocked until `ready` (`isAssetReady` already does this). `failed` shows „Fehlgeschlagen" + `metadata.error` as tooltip.
- `BookPreviewTile`: cover thumb, small book badge with the page count („212 S.").
- Dialog **„Buch-Einstellungen"** (opened from the tile's menu and from the properties panel of a selected book):
  - Titel, Künstler:in, Jahr (existing artwork fields).
  - Cover: „Ersatz-Cover hochladen" (JPG/PNG) / „Cover aus PDF verwenden".
  - „Dicke anpassen": slider 0.3–8 cm, step 0.1, with „Automatisch (1,4 cm)" reset; stored in `Artwork.depth`.
  - Switch „Im öffentlichen Viewer lesbar" with the hint „Wer das Buch öffnen kann, kann das PDF auch herunterladen."
  - Read-only: Seiten, Seitenformat in mm.

---

## 4. 3D object

### 4.1 Pure geometry (`src/lib/book/geometry.ts`, Vitest)

- `autoThicknessCm(pages) = clamp(ceil(pages / 2) × 0.01 + 0.4, 0.3, 8)` — 0.1 mm per sheet (80 g/m²) + 2 × 2 mm board. 200 pages → 1.4 cm.
- `bookSize(artwork, meta)` → `{ w, h, d }` in m (w/h from artwork cm, d from `depth ?? auto`).
- `pedestalSize(book)` → footprint = book + 0.10 m margin per side, minimum 0.40 × 0.40 m; height `PEDESTAL_HEIGHT = 1.20`.
- `bookHitBox(book)` → book footprint + 0.01 m per side, height `max(d, 0.05)`.

### 4.2 Component tree (`src/components/book/`)

```tsx
<group ref={registerRef} userData={{ instanceId, medium: 'book' }}>  // instance transform (x/z, rotY)
  <PedestalMesh size={pedestal} />                   // box, origin bottom centre, white matte
  <LabelPlate artist title year pedestal={pedestal} />  // front face, near the top, tilted ~15°
  <group position={[0, PEDESTAL_HEIGHT, 0]}>
    <BookMesh size={book} coverUrl={coverUrl} />      // lies flat; cover on +Y, cover top edge towards −Z, spine on −X
    <primitive object={hitProxy} />                   // BoxHitProxy, userData.selectionBounds
  </group>
</group>
```

- **Front** of the pedestal (label side) is local +Z; a curator standing there reads the cover upright.
- `BookMesh`: one shared unit box geometry scaled to x = w, y = d (thickness), z = h; material array — cover (top), back (bottom, neutral), spine and page edges (procedural paper colour, slight line pattern). Cover texture through `artworkTextureManager` (`sizeM = w`), so the existing LOD tiers apply. Missing/failed cover → neutral grey cover.
- `LabelPlate`: canvas texture (pattern of `measureLabelTextures`), Albert Sans, on a thin plate; redrawn when metadata changes.
- `BoxHitProxy`: `SplatHitProxy` generalised (box in local space, custom `raycast`, no geometry, no draw call). `SplatInstance` switches to it.
- Pedestal gets a fixed cuboid collider so the first-person player cannot walk through it (same physics setup as other static geometry — the plan checks where instances sit relative to `<Physics>`).

### 4.3 Editor integration

- `MediumType` + `'book'`; `isFloorAssetType('book') = true`; dispatch in `PlacedArtworks`.
- Drop ghost: translucent pedestal + book instead of `ModelGhostPreview`'s box.
- Gizmo: translate X/Z and rotate Y only; scale off (like the scale figure). Floor clamp keeps y = 0.
- Multi-selection: books take part in group translate/rotate; scale, frame, align-height and the 2D wall editor ignore them.
- Hover: R3F `onPointerOver/Out` on the hit proxy → `hoveredBookId` in `bookViewerStore` + `cursor: pointer`; `SelectionOutline` gets a hover variant (thinner, lighter) for the hovered book.
- Click selects (as today); **double-click** on the book or „Buch öffnen" in the properties panel opens the viewer. In the editor the viewer always opens (curator), regardless of `publicReadable`.

### 4.4 First person (editor preview and public viewer)

R3F events are off in first person; `FPVArtworkRaycaster` already casts the centre ray against `instanceRefMap` with occlusion. It now also reports whether the hit is a book and its distance. When a book is hit within 2.5 m (and, in the public viewer, `publicReadable`), `ArtworkInfoOverlay` shows „Klicken zum Lesen"; a `mousedown` while `document.pointerLockElement` is set opens the viewer.

---

## 5. Viewer overlay & controls lock

### 5.1 Store (`src/store/bookViewerStore.ts`)

```ts
type OpenBook = { assetId: number; title: string; pageCount: number };
interface BookViewerState {
  book: OpenBook | null;
  hoveredBookId: number | null;
  resumeFirstPerson: boolean;   // first person was active when the book opened
  open(book: OpenBook): void;
  close(): void;
  setHoveredBook(id: number | null): void;
}
```

`useControlsLocked()` (`src/lib/controlsLock.ts`) = `isDialogOpen || book !== null` — the one place controls ask. `Player` uses it for `paused` and for mounting `PointerLockControls`; `OrbitControls` get `enabled={!locked}`; `PlannerCameraSystem.handlePointerUnlock` checks it instead of `isDialogOpen` alone; `EditorPage`'s key handler ignores keys while a book is open.

### 5.2 Order of operations

- **Open:** `open()` sets `book` and `resumeFirstPerson` **first**, then `document.exitPointerLock()`. The reverse order would let `handlePointerUnlock` drop the editor out of first person.
- **Close with the button:** `close()`, then — if `resumeFirstPerson` — `requestPointerLock()` inside the click handler (a user gesture).
- **Close with ESC:** `close()`; ESC is not a user activation, so no re-lock; the existing „Klicken zum Weitergehen" state appears and the next click locks.

### 5.3 `BookViewerOverlay` (lazy chunk)

- `React.lazy`; `pdfjs-dist` only in this chunk, worker via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`. Nothing PDF-related is fetched until the overlay mounts.
- `getDocument({ url: /api/books/:id/pdf, httpHeaders: token ? { Authorization } : undefined, disableAutoFetch: true, rangeChunkSize: 1 MB })`.
- Radix `Dialog` (focus trap, ESC → `close()`), full-screen dark backdrop, close button top right („Schließen").
- Spread layout like a real book: cover alone on the right, then 2–3, 4–5, …; single page when the overlay is narrower than 900 px. Arrow keys, clicking the left/right half, buttons; counter „12–13 / 212".
- Flip: CSS 3D `rotateY` of the turning page, 400 ms; none with `prefers-reduced-motion`.
- Rendering: only the current spread plus the neighbours; render tasks of pages that leave that window are cancelled; canvas scale capped at `devicePixelRatio ≤ 2`.
- Errors (404, network, broken file): message „Buch konnte nicht geladen werden" in the overlay; close/ESC keep working.

---

## 6. Error handling (summary)

| Case | Behaviour |
|---|---|
| No `%PDF-` / wrong extension | 400 „Datei ist kein gültiges PDF" |
| Password-protected | job fails, „PDF ist passwortgeschützt" |
| 0 pages, poppler timeout, sharp error | `status: 'failed'`, `metadata.error`, badge „Fehlgeschlagen" |
| Server restart during a job | `resumeBookJobs()` re-enqueues |
| Invalid replacement cover | 400, old cover stays |
| Cover missing in 3D | grey cover, no crash |
| PDF request without access | 404 |
| PDF fails in the viewer | error text, close/ESC work, controls released |
| Asset deleted, instance still placed | existing „missing asset" filter |

---

## 7. Testing

- **Jest (server):** `pdfGeometry` (pt → mm, `/Rotate` 90/270, CropBox → MediaBox fallback, encrypted flag); magic-byte check; `bookJobs` with fixture PDFs (plain, rotated, encrypted, broken, 0 pages) and a mocked `execFile` timeout; PDF route access matrix (owner, other user, anonymous × `publicReadable` × published) and that `/uploads/.books/<file>` returns 404.
- **Vitest (client):** `lib/book/geometry`; `bookViewerStore` + `useControlsLocked`; open order (store set before `exitPointerLock`, spy).
- **Rendering:** headless Chrome over CDP, WebGPU and WebGL: book on pedestal, label plate, hover outline.
- **Manual, on the test stack (SSH tunnel, not locally):** upload → badge phases → place → cover override → thickness slider; first person: open by click, ESC → „Klicken zum Weitergehen" → click re-locks; close button re-locks at once; public viewer with the switch on and off.

---

## Plan refinements (2026-09-30, while writing the implementation plan)

- **Cover files are versioned** — `<stem>-cover-<n>.webp` + `-thumb-512/256.webp`; every change bumps `metadata.coverVersion` and writes new files (old ones deleted). Replaces the `?v=` query: `/uploads` is cached 7 days and the `-thumb-512 → -thumb-256` naming convention would break with a query string.
- **Failure message key** is `metadata.processingError` (same as videos, already read by `/assets/:id/processing`), not `metadata.error`.
- **The job creates the Artwork** (upsert by `assetId`, title from the filename, artist empty, width/height from the page size) — uploads don't create artworks for other types, but the book settings need one before placement.
- **ESC in the editor's first person** closes the book and returns to the orbit view (an unlocked pointer means „out of first person" in the editor, and ESC is no user gesture to re-lock). The public viewer shows its existing entry overlay instead. The close button re-locks at once in both.
- **`VideoProcessingBadge` / `useVideoProcessing` are reused unchanged**; only the phase list and labels gain `cover` („Cover wird erzeugt") and `tiers` („Vorschaubilder"). No rename.
- **Books are fixed-size media** like monitors (`isFixedSizeMedium`): no scale gizmo, no `S`, skipped by group scaling and height alignment.
- **`SplatHitProxy` becomes `BoxHitProxy`** in `src/lib/boxHitProxy.ts`, used by splats and books.
- **Server `INSTANCE_MEDIA`** gains `book` (the instances route validates `medium`).
- **Public-PDF check is scoped to the asset's own project** (`publishedPlacementWhere` in `server/src/lib/bookAccess.ts`): a published placement in another project's exhibition doesn't unlock the PDF.
- **pdfjs-dist 5.7 has no `isEvalSupported` option and no eval** — the option was dropped from `getDocument`.
- **Books in any selection (single or group)** get gizmo rotate Y only / translate without Y; commits force books upright on the floor, yaw read from the quaternion (`'YXZ'`, keeps yaw beyond 90°).
- **Overlay ESC stops propagation** so the editor's escape handler doesn't also fire after the book closes.
- **Book double-clicks don't pass through** to walls behind the pedestal.
- **Public `/public` route** returns all book instances (only `pdfFile` stripped); `publicReadable` gates opening, not visibility.
