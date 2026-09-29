# Bücher auf Sockeln — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Curators upload PDFs; each becomes a placeable closed book lying on a 1.20 m pedestal with a label plate, and clicking it opens a 2D flip-through viewer that locks the 3D controls until ESC/close.

**Architecture:** The server keeps the PDF in the dot-directory `<uploads>/.books/` (never served statically), renders page 1 with poppler in a background job (same queue shape as `videoJobs.ts`) and serves the PDF only through an access-checked route. The client treats `book` as a floor asset type: one instance = pedestal + book + label plate. A small Zustand store (`bookViewerStore`) is the bridge between the R3F canvas and the lazily loaded pdf.js overlay; every control reads one `useControlsLocked()` flag.

**Tech Stack:** Express 5 + Prisma/MySQL, poppler-utils (`pdfinfo`, `pdftoppm`), sharp, Jest; React 19, R3F 9, three r186, Zustand 5, Radix Dialog, Tailwind, pdfjs-dist 5, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-book-pedestal-design.md`

## Global Constraints

- All user-facing strings are German (see copy in each task; do not translate them).
- Pedestal height `1.20` m; footprint = book + `0.10` m per side, minimum `0.40 × 0.40` m.
- Book lies flat, cover up, cover top edge towards local −Z, spine on local −X, label plate on the local +Z face of the pedestal.
- Auto thickness: `ceil(pages / 2) × 0.01 cm + 0.4 cm`, clamped to `0.3–8` cm. Slider range `0.3–8` cm, step `0.1`.
- Hit box = book footprint + `0.01` m per side, height `max(thickness, 0.05)` m. Books open from first person within `2.5` m.
- PDF upload limit `200 MB`; replacement cover JPG/PNG/WebP up to `20 MB`.
- poppler is only ever called through `execFile` with an argument array (no shell): `pdfinfo` timeout `30 s`, `pdftoppm` timeout `60 s`, `killSignal: 'SIGKILL'`.
- The PDF lives only in `<uploads>/.books/<stem>.pdf` and is served only by `GET /api/books/:assetId/pdf` (access: project access, or `Artwork.publicReadable` + instance in a published version; otherwise 404).
- `Artwork.publicReadable` defaults to `false`.
- pdf.js in the browser: `isEvalSupported: false`, loaded only inside the lazy overlay chunk.
- No `ShaderMaterial` / `onBeforeCompile` (WebGPU path); textures via `artworkTextureManager` or `CanvasTexture`.
- Never run the app, a local DB or a local headless browser (user rule). Locally allowed: `npm run test`, `npm run lint`, `npm run build`, `cd server && npx jest <pure test files>`, `cd server && npm run build`. Anything needing a running app is verified on the test stack in Task 14.

## Review Focus

- A PDF whose first page has `/Rotate 90` (scanned landscape books) → width and height swap; pinned in Task 1 (`pageSizeMm` test).
- A password-protected PDF → the asset ends as „Fehlgeschlagen" with „PDF ist passwortgeschützt", never stuck in „processing"; pinned in Task 2 (`classifyPopplerError` + `processBookPdf` rejection tests).
- Opening a book while walking in first person must not throw the editor back to the orbit view (unlock handler fires on `exitPointerLock`); pinned in Task 7 (open order test).
- `/uploads/.books/<file>.pdf` must not be downloadable through the static handler; pinned in Task 5 (supertest 404).
- An anonymous request for a book whose switch is off, or which is not in a published version → 404; pinned in Task 5 (`canReadBookPdf` matrix).

---

## File Structure

**Server (create)**
- `server/src/lib/pdfGeometry.ts` — pure: PDF magic check, `pdfinfo` output parser, pt → mm.
- `server/src/lib/bookPdf.ts` — poppler runner, cover set writing/replacing, book metadata type, `processBookPdf`.
- `server/src/lib/bookJobs.ts` — background queue (DB glue), progress for `/assets/:id/processing`.
- `server/src/lib/bookAccess.ts` — pure access rule + safe PDF path.
- `server/src/routes/books.ts` — `GET /:assetId/pdf`.
- `server/prisma/migrations/20260930120000_book_artwork_fields/migration.sql`
- Tests: `server/src/tests/pdfGeometry.test.ts`, `bookPdf.test.ts`, `bookAccess.test.ts`, `booksRoute.test.ts`, `artworkUpdate.test.ts`, extend `assetType.test.ts`.

**Server (modify)**
- `server/prisma/schema.prisma`, `server/src/lib/assetType.ts`, `server/src/lib/artworkTitle.ts`, `server/src/lib/middleware.ts`, `server/src/routes/upload.ts`, `server/src/routes/assets.ts`, `server/src/routes/artworks.ts`, `server/src/routes/instances.ts`, `server/src/routes/public.ts`, `server/src/index.ts`, `Dockerfile`.

**Client (create)**
- `src/lib/book/geometry.ts` — pure sizes (book, pedestal, hit box), cover dims.
- `src/lib/book/spread.ts` — pure spread layout for the viewer.
- `src/lib/book/labelPlate.ts` — pure label text + canvas drawing.
- `src/lib/book/api.ts` — fetch helpers for settings/cover/PDF URL.
- `src/lib/book/viewerActions.ts` — open/close with pointer-lock ordering.
- `src/lib/boxHitProxy.ts` — `BoxHitProxy` (moved from `lib/splats.ts`).
- `src/lib/controlsLock.ts` — `useControlsLocked()` / `isControlsLocked()`.
- `src/store/bookViewerStore.ts`
- `src/components/book/BookInstance.tsx`, `BookMesh.tsx`, `LabelPlate.tsx`, `BookGhost.tsx`, `BookPreviewTile.tsx`, `BookSettingsDialog.tsx`, `BookViewerHost.tsx`, `BookViewerOverlay.tsx`, `BookPropertiesActions.tsx`
- Tests: `src/lib/book/geometry.test.ts`, `spread.test.ts`, `labelPlate.test.ts`, `viewerActions.test.ts`, `src/lib/boxHitProxy.test.ts`, extend `src/lib/uploadFiles.test.ts`, `src/lib/selectionOperations.test.ts`.

**Client (modify)**
- `src/store/editorStore.ts`, `src/lib/uploadFiles.ts`, `src/lib/artworkTitle.ts`, `src/lib/splats.ts`, `src/lib/selectionOperations.ts`, `src/hooks/use-video-processing.ts`, `src/components/SplatInstance.tsx`, `SelectionOutline.tsx`, `PlacedArtworks.tsx`, `ArtworkPlacement.tsx`, `InstanceTransformControls.tsx`, `PropertiesPanel.tsx`, `AssetSidebar.tsx`, `AssetLibrary.tsx`, `FPVArtworkRaycaster.tsx`, `ArtworkInfoOverlay.tsx`, `Player.tsx`, `PlannerCameraSystem.tsx`, `physics/PhysicsWorld.tsx`, `src/pages/EditorPage.tsx`, `src/pages/ViewerPage.tsx`, `package.json`, `CLAUDE.md`.

---

### Task 1: PDF geometry helpers (server, pure)

**Files:**
- Create: `server/src/lib/pdfGeometry.ts`
- Test: `server/src/tests/pdfGeometry.test.ts`

**Interfaces:**
- Produces:
  - `hasPdfMagic(head: Buffer): boolean`
  - `interface PdfInfo { pages: number; encrypted: boolean; box: { width: number; height: number } | null; rotate: number }` (box in pt)
  - `parsePdfInfo(stdout: string): PdfInfo`
  - `pageSizeMm(box: { width: number; height: number }, rotate: number): { widthMm: number; heightMm: number }`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/tests/pdfGeometry.test.ts
import { hasPdfMagic, pageSizeMm, parsePdfInfo } from '../lib/pdfGeometry';

const INFO_A4 = `Producer:       LibreOffice 7.6
Tagged:         no
Encrypted:      no
Pages:          212
Page    1 size: 595.276 x 841.89 pts (A4)
Page    1 rot:  0
Page    1 MediaBox:     0.00     0.00   595.28   841.89
Page    1 CropBox:      0.00     0.00   595.28   841.89
Page    1 BleedBox:     0.00     0.00   595.28   841.89
Page    1 TrimBox:      0.00     0.00   595.28   841.89
PDF version:    1.7
`;

describe('hasPdfMagic', () => {
    it('accepts a PDF header at the start or after a few junk bytes', () => {
        expect(hasPdfMagic(Buffer.from('%PDF-1.7\n'))).toBe(true);
        expect(hasPdfMagic(Buffer.concat([Buffer.alloc(20, 0x20), Buffer.from('%PDF-1.4')]))).toBe(true);
    });
    it('rejects anything else', () => {
        expect(hasPdfMagic(Buffer.from('PK\x03\x04'))).toBe(false);
        expect(hasPdfMagic(Buffer.from(''))).toBe(false);
        expect(hasPdfMagic(Buffer.concat([Buffer.alloc(1100, 0x20), Buffer.from('%PDF-1.4')]))).toBe(false);
    });
});

describe('parsePdfInfo', () => {
    it('reads pages, encryption, the crop box and rotation of page 1', () => {
        expect(parsePdfInfo(INFO_A4)).toEqual({
            pages: 212, encrypted: false, box: { width: 595.28, height: 841.89 }, rotate: 0,
        });
    });
    it('uses the media box when there is no crop box, and normalises rotation', () => {
        const info = parsePdfInfo('Encrypted:      yes (print:yes copy:no)\nPages: 3\nPage    1 rot:  -90\nPage    1 MediaBox:  10 20 310 520\n');
        expect(info).toEqual({ pages: 3, encrypted: true, box: { width: 300, height: 500 }, rotate: 270 });
    });
    it('falls back to the size line and reports a missing box as null', () => {
        expect(parsePdfInfo('Pages: 1\nPage    1 size: 612 x 792 pts (letter)\n').box).toEqual({ width: 612, height: 792 });
        expect(parsePdfInfo('Pages: 0\n')).toEqual({ pages: 0, encrypted: false, box: null, rotate: 0 });
    });
});

describe('pageSizeMm', () => {
    it('converts points to millimetres (one decimal)', () => {
        expect(pageSizeMm({ width: 595.28, height: 841.89 }, 0)).toEqual({ widthMm: 210, heightMm: 297 });
    });
    it('swaps width and height for pages turned by 90 or 270 degrees', () => {
        expect(pageSizeMm({ width: 595.28, height: 841.89 }, 90)).toEqual({ widthMm: 297, heightMm: 210 });
        expect(pageSizeMm({ width: 595.28, height: 841.89 }, 270)).toEqual({ widthMm: 297, heightMm: 210 });
        expect(pageSizeMm({ width: 595.28, height: 841.89 }, 180)).toEqual({ widthMm: 210, heightMm: 297 });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/tests/pdfGeometry.test.ts`
Expected: FAIL — `Cannot find module '../lib/pdfGeometry'`.

- [ ] **Step 3: Write the implementation**

```ts
// server/src/lib/pdfGeometry.ts
/**
 * Pure helpers for book uploads: PDF signature check, parsing `pdfinfo -box -f 1 -l 1` output and
 * converting the first page's box to millimetres. poppler itself is run by lib/bookPdf.ts.
 */

/** PDF readers accept the `%PDF-` header anywhere in the first 1024 bytes. */
export function hasPdfMagic(head: Buffer): boolean {
    const index = head.indexOf('%PDF-', 0, 'latin1');
    return index >= 0 && index <= 1024 - 5;
}

export interface PdfInfo {
    pages: number;
    encrypted: boolean;
    /** Page 1 in PDF points (CropBox, else MediaBox, else the size line); null if unknown. */
    box: { width: number; height: number } | null;
    /** Page 1 rotation, normalised to 0 / 90 / 180 / 270. */
    rotate: number;
}

const NUM = '(-?\\d+(?:\\.\\d+)?)';
const boxLine = (name: string) => new RegExp(`^Page\\s+1\\s+${name}:\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}`, 'm');

function readBox(stdout: string, name: string): { width: number; height: number } | null {
    const m = stdout.match(boxLine(name));
    if (!m) return null;
    const [x1, y1, x2, y2] = m.slice(1, 5).map(Number);
    return { width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

export function parsePdfInfo(stdout: string): PdfInfo {
    const pages = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
    const encrypted = /^Encrypted:\s+yes/m.test(stdout);
    const rot = Number(stdout.match(/^Page\s+1\s+rot:\s+(-?\d+)/m)?.[1] ?? 0);
    const rotate = ((rot % 360) + 360) % 360;
    let box = readBox(stdout, 'CropBox') ?? readBox(stdout, 'MediaBox');
    if (!box) {
        const size = stdout.match(new RegExp(`^Page\\s+1\\s+size:\\s+${NUM}\\s+x\\s+${NUM}`, 'm'));
        if (size) box = { width: Number(size[1]), height: Number(size[2]) };
    }
    if (box && (!(box.width > 0) || !(box.height > 0))) box = null;
    return { pages, encrypted, box, rotate };
}

const PT_TO_MM = 25.4 / 72;
const round1 = (value: number) => Math.round(value * 10) / 10;

export function pageSizeMm(box: { width: number; height: number }, rotate: number): { widthMm: number; heightMm: number } {
    const turned = rotate === 90 || rotate === 270;
    const w = round1((turned ? box.height : box.width) * PT_TO_MM);
    const h = round1((turned ? box.width : box.height) * PT_TO_MM);
    return { widthMm: w, heightMm: h };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/tests/pdfGeometry.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/pdfGeometry.ts server/src/tests/pdfGeometry.test.ts
git commit -m "feat(books): parse PDF page count and page size"
```

---

### Task 2: poppler runner and cover files (server)

**Files:**
- Create: `server/src/lib/bookPdf.ts`
- Modify: `Dockerfile:39`
- Test: `server/src/tests/bookPdf.test.ts`

**Interfaces:**
- Consumes: `parsePdfInfo`, `pageSizeMm` (Task 1); `generateImageThumbnails(sourcePath)` from `server/src/lib/thumbnails.ts` (writes `<stem>-thumb-256.webp` / `-thumb-512.webp` next to the source).
- Produces:
  - `class BookProcessingError extends Error` (message is German and shown to the curator)
  - `interface PdfTools { info(pdfPath: string): Promise<string>; renderFirstPage(pdfPath: string, outPrefix: string): Promise<string> }`, `popplerTools: PdfTools`
  - `classifyPopplerError(err: unknown): BookProcessingError`
  - `BOOKS_DIR = '.books'`, `booksDir(uploadDir: string): string`, `bookStem(pdfFile: string): string`
  - `coverFileNames(stem: string, version: number): { cover: string; thumb512: string; thumb256: string; coverPdf: string }`
  - `interface CoverSet { path: string; thumbnailPath: string; width: number; height: number }` (public `/uploads/...` paths, pixel size)
  - `writeCoverSet(sourcePath: string, uploadDir: string, stem: string, version: number): Promise<CoverSet>`
  - `removeCoverSet(uploadDir: string, stem: string, version: number): void`
  - `type BookJobPhase = 'queued' | 'analyzing' | 'cover' | 'tiers'`
  - `interface BookAssetMetadata { projectId?: string; pdfFile: string; pageCount?: number; pageWidthMm?: number; pageHeightMm?: number; coverSource: 'pdf' | 'override'; coverVersion: number; originalSize: number; processingError?: string }`
  - `readBookMetadata(value: unknown): BookAssetMetadata | null`
  - `interface ProcessedBook { pageCount: number; pageWidthMm: number; pageHeightMm: number; cover: CoverSet }`
  - `processBookPdf(pdfPath: string, uploadDir: string, stem: string, version: number, tools?: PdfTools, onPhase?: (phase: BookJobPhase) => void): Promise<ProcessedBook>`

File naming (all in `<uploads>/`): cover `<stem>-cover-<version>.webp`, thumbs `<stem>-cover-<version>-thumb-512.webp` / `-thumb-256.webp`, page-1 render kept for „Zurücksetzen" `<stem>-cover-pdf.webp`. Versioned names replace the spec's `?v=` query: every cover change gets new URLs, so the 7-day `/uploads` cache and the `-thumb-512 → -thumb-256` naming convention keep working.

- [ ] **Step 1: Write the failing test**

```ts
// server/src/tests/bookPdf.test.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import {
    BookProcessingError, classifyPopplerError, coverFileNames, processBookPdf, readBookMetadata,
    removeCoverSet, writeCoverSet, type PdfTools,
} from '../lib/bookPdf';

const INFO = 'Encrypted: no\nPages: 12\nPage    1 rot:  0\nPage    1 CropBox: 0 0 419.53 595.28\n';

let uploadDir: string;
beforeEach(() => {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'books-'));
    fs.mkdirSync(path.join(uploadDir, '.books'));
});
afterEach(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

const fakeTools = (info: string): PdfTools => ({
    info: async () => info,
    renderFirstPage: async (_pdf, outPrefix) => {
        await sharp({ create: { width: 1448, height: 2048, channels: 3, background: '#c33' } }).png().toFile(`${outPrefix}.png`);
        return `${outPrefix}.png`;
    },
});

describe('processBookPdf', () => {
    it('writes the cover set and reports pages and page size', async () => {
        const phases: string[] = [];
        const result = await processBookPdf('/x.pdf', uploadDir, 'abc-buch', 1, fakeTools(INFO), (p) => phases.push(p));
        expect(result.pageCount).toBe(12);
        expect(result.pageWidthMm).toBeCloseTo(148, 0);
        expect(result.pageHeightMm).toBeCloseTo(210, 0);
        expect(result.cover.path).toBe('/uploads/abc-buch-cover-1.webp');
        expect(result.cover.thumbnailPath).toBe('/uploads/abc-buch-cover-1-thumb-512.webp');
        expect(result.cover.height).toBe(2048);
        const names = coverFileNames('abc-buch', 1);
        for (const f of [names.cover, names.thumb512, names.thumb256, names.coverPdf]) {
            expect(fs.existsSync(path.join(uploadDir, f))).toBe(true);
        }
        // The raw render is removed
        expect(fs.readdirSync(path.join(uploadDir, '.books'))).toEqual([]);
        expect(phases).toEqual(['cover', 'tiers']);
    });

    it('rejects a PDF without pages', async () => {
        await expect(processBookPdf('/x.pdf', uploadDir, 's', 1, fakeTools('Pages: 0\n')))
            .rejects.toThrow(new BookProcessingError('PDF enthält keine Seiten'));
    });

    it('rejects a PDF whose page size cannot be read', async () => {
        await expect(processBookPdf('/x.pdf', uploadDir, 's', 1, fakeTools('Pages: 4\n')))
            .rejects.toThrow('Seitenformat konnte nicht gelesen werden');
    });

    it('passes poppler errors through', async () => {
        const tools: PdfTools = { ...fakeTools(INFO), info: async () => { throw new BookProcessingError('PDF ist passwortgeschützt'); } };
        await expect(processBookPdf('/x.pdf', uploadDir, 's', 1, tools)).rejects.toThrow('PDF ist passwortgeschützt');
    });
});

describe('classifyPopplerError', () => {
    it('recognises password-protected files', () => {
        const err = Object.assign(new Error('Command failed'), { stderr: 'Command Line Error: Incorrect password\n' });
        expect(classifyPopplerError(err).message).toBe('PDF ist passwortgeschützt');
    });
    it('recognises timeouts', () => {
        const err = Object.assign(new Error('killed'), { killed: true, signal: 'SIGKILL' });
        expect(classifyPopplerError(err).message).toBe('PDF konnte nicht rechtzeitig gelesen werden');
    });
    it('falls back to a generic message', () => {
        expect(classifyPopplerError(new Error('Syntax Error')).message).toBe('PDF konnte nicht gelesen werden');
    });
});

describe('cover sets', () => {
    it('writes a versioned set from any image and removes it again', async () => {
        const src = path.join(uploadDir, 'upload.jpg');
        await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#39c' } }).jpeg().toFile(src);
        const set = await writeCoverSet(src, uploadDir, 'stem', 2);
        expect(set).toEqual({ path: '/uploads/stem-cover-2.webp', thumbnailPath: '/uploads/stem-cover-2-thumb-512.webp', width: 2048, height: 1365 });
        removeCoverSet(uploadDir, 'stem', 2);
        expect(fs.existsSync(path.join(uploadDir, 'stem-cover-2.webp'))).toBe(false);
        expect(fs.existsSync(path.join(uploadDir, 'stem-cover-2-thumb-256.webp'))).toBe(false);
    });
});

describe('readBookMetadata', () => {
    it('accepts stored book metadata and rejects anything without a PDF file', () => {
        expect(readBookMetadata({ pdfFile: 'a.pdf', coverVersion: 1, coverSource: 'pdf', originalSize: 5 })?.pdfFile).toBe('a.pdf');
        expect(readBookMetadata({ coverVersion: 1 })).toBeNull();
        expect(readBookMetadata(null)).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/tests/bookPdf.test.ts`
Expected: FAIL — `Cannot find module '../lib/bookPdf'`.

- [ ] **Step 3: Write the implementation**

```ts
// server/src/lib/bookPdf.ts
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { pageSizeMm, parsePdfInfo } from './pdfGeometry';
import { generateImageThumbnails } from './thumbnails';

/**
 * Books (PDF uploads): the PDF is kept in the dot-directory `<uploads>/.books/` — express.static
 * never serves dot-directories, so it is only reachable through routes/books.ts. Page 1 is
 * rendered by poppler (`pdftoppm`), run as a child process with a hard timeout so a hostile PDF
 * can only kill that process, never the server.
 */

const execFileAsync = promisify(execFile);

/** Error whose message is shown to the curator (German). */
export class BookProcessingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BookProcessingError';
    }
}

export interface PdfTools {
    /** stdout of `pdfinfo -box -f 1 -l 1`. */
    info(pdfPath: string): Promise<string>;
    /** Renders page 1 to `<outPrefix>.png` (longest edge 2048 px) and returns that path. */
    renderFirstPage(pdfPath: string, outPrefix: string): Promise<string>;
}

export function classifyPopplerError(err: unknown): BookProcessingError {
    const e = err as { stderr?: unknown; killed?: boolean; signal?: string | null };
    const stderr = typeof e?.stderr === 'string' ? e.stderr : '';
    if (/incorrect password/i.test(stderr)) return new BookProcessingError('PDF ist passwortgeschützt');
    if (e?.killed || e?.signal === 'SIGKILL') return new BookProcessingError('PDF konnte nicht rechtzeitig gelesen werden');
    return new BookProcessingError('PDF konnte nicht gelesen werden');
}

export const popplerTools: PdfTools = {
    async info(pdfPath) {
        try {
            const { stdout } = await execFileAsync('pdfinfo', ['-box', '-f', '1', '-l', '1', pdfPath], {
                timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
            });
            return stdout;
        } catch (err) {
            throw classifyPopplerError(err);
        }
    },
    async renderFirstPage(pdfPath, outPrefix) {
        try {
            await execFileAsync('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to', '2048', '-png', pdfPath, outPrefix], {
                timeout: 60_000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
            });
            return `${outPrefix}.png`;
        } catch (err) {
            throw classifyPopplerError(err);
        }
    },
};

export const BOOKS_DIR = '.books';
export const booksDir = (uploadDir: string) => path.join(uploadDir, BOOKS_DIR);
export const bookStem = (pdfFile: string) => path.basename(pdfFile).replace(/\.pdf$/i, '');

export function coverFileNames(stem: string, version: number) {
    const base = `${stem}-cover-${version}`;
    return {
        cover: `${base}.webp`,
        thumb512: `${base}-thumb-512.webp`,
        thumb256: `${base}-thumb-256.webp`,
        coverPdf: `${stem}-cover-pdf.webp`,
    };
}

export interface CoverSet {
    path: string;
    thumbnailPath: string;
    width: number;
    height: number;
}

/** Cover (longest edge 2048 px, WebP) + 512/256 thumbnails from any image sharp reads. */
export async function writeCoverSet(sourcePath: string, uploadDir: string, stem: string, version: number): Promise<CoverSet> {
    const names = coverFileNames(stem, version);
    const coverPath = path.join(uploadDir, names.cover);
    const info = await sharp(sourcePath)
        .rotate()
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(coverPath);
    await generateImageThumbnails(coverPath);
    return { path: `/uploads/${names.cover}`, thumbnailPath: `/uploads/${names.thumb512}`, width: info.width, height: info.height };
}

export function removeCoverSet(uploadDir: string, stem: string, version: number): void {
    const names = coverFileNames(stem, version);
    for (const file of [names.cover, names.thumb512, names.thumb256]) {
        fs.rmSync(path.join(uploadDir, file), { force: true });
    }
}

export type BookJobPhase = 'queued' | 'analyzing' | 'cover' | 'tiers';

export interface BookAssetMetadata {
    projectId?: string;
    /** Basename inside `<uploads>/.books/`. */
    pdfFile: string;
    pageCount?: number;
    pageWidthMm?: number;
    pageHeightMm?: number;
    coverSource: 'pdf' | 'override';
    coverVersion: number;
    originalSize: number;
    processingError?: string;
}

export function readBookMetadata(value: unknown): BookAssetMetadata | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const meta = value as Record<string, unknown>;
    if (typeof meta.pdfFile !== 'string' || meta.pdfFile === '') return null;
    return {
        ...(meta as object),
        pdfFile: meta.pdfFile,
        coverSource: meta.coverSource === 'override' ? 'override' : 'pdf',
        coverVersion: typeof meta.coverVersion === 'number' && meta.coverVersion > 0 ? meta.coverVersion : 1,
        originalSize: typeof meta.originalSize === 'number' ? meta.originalSize : 0,
    } as BookAssetMetadata;
}

export interface ProcessedBook {
    pageCount: number;
    pageWidthMm: number;
    pageHeightMm: number;
    cover: CoverSet;
}

export async function processBookPdf(
    pdfPath: string,
    uploadDir: string,
    stem: string,
    version: number,
    tools: PdfTools = popplerTools,
    onPhase?: (phase: BookJobPhase) => void,
): Promise<ProcessedBook> {
    const info = parsePdfInfo(await tools.info(pdfPath));
    if (info.pages < 1) throw new BookProcessingError('PDF enthält keine Seiten');
    if (!info.box) throw new BookProcessingError('Seitenformat konnte nicht gelesen werden');
    const { widthMm, heightMm } = pageSizeMm(info.box, info.rotate);

    onPhase?.('cover');
    const renderPrefix = path.join(booksDir(uploadDir), `${stem}-render`);
    const png = await tools.renderFirstPage(pdfPath, renderPrefix);
    try {
        onPhase?.('tiers');
        const coverPdfPath = path.join(uploadDir, coverFileNames(stem, version).coverPdf);
        await sharp(png)
            .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(coverPdfPath);
        const cover = await writeCoverSet(coverPdfPath, uploadDir, stem, version);
        return { pageCount: info.pages, pageWidthMm: widthMm, pageHeightMm: heightMm, cover };
    } finally {
        fs.rmSync(png, { force: true });
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/tests/bookPdf.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Install poppler in the runtime image**

In `Dockerfile` line 38–39 change the runtime dependencies to:

```dockerfile
# Runtime dependencies — ffmpeg for video transcoding/thumbnails, poppler-utils (pdfinfo, pdftoppm) for book covers
RUN apk add --no-cache openssl libc6-compat ca-certificates curl ffmpeg poppler-utils
```

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/bookPdf.ts server/src/tests/bookPdf.test.ts Dockerfile
git commit -m "feat(books): render PDF covers with poppler"
```

---

### Task 3: Schema, upload and background job (server)

**Files:**
- Create: `server/prisma/migrations/20260930120000_book_artwork_fields/migration.sql`, `server/src/lib/bookJobs.ts`
- Modify: `server/prisma/schema.prisma` (model `Artwork`, comments on `Asset.type` / `ArtworkInstance.medium`), `server/src/lib/assetType.ts`, `server/src/lib/artworkTitle.ts:2`, `server/src/routes/upload.ts`, `server/src/routes/assets.ts` (processing route), `server/src/routes/instances.ts:20,159`, `server/src/index.ts`
- Test: `server/src/tests/assetType.test.ts` (extend), `server/src/tests/instanceMedia.test.ts`

**Interfaces:**
- Consumes: Task 1 `hasPdfMagic`; Task 2 `processBookPdf`, `readBookMetadata`, `booksDir`, `bookStem`, `coverFileNames`, `BookProcessingError`, `BookJobPhase`.
- Produces:
  - `AssetType` gains `'book'`; `detectAssetType(_, 'x.pdf') === 'book'`.
  - `INSTANCE_MEDIA` (exported from `routes/instances.ts`) includes `'book'`.
  - `enqueueBookJob(assetId: number): void`, `resumeBookJobs(): Promise<void>`, `getBookJobProgress(assetId: number): BookJobProgress | null` where `BookJobProgress` has the same fields as `VideoJobProgress` (`phase`, `percent: null`, `phaseStartedAt`, `phaseElapsedMs`, `source: null`, `queuePosition`, `proxyHeight: null`) so the client's processing type fits.
  - Prisma `Artwork.depth Float?`, `Artwork.publicReadable Boolean @default(false)`.
  - A finished book asset: `status 'ready'`, `path` = cover, `thumbnailPath` = cover thumb 512, `width/height` = cover pixels, metadata with `pageCount/pageWidthMm/pageHeightMm`, and an `Artwork` (`title` from the filename, `artist` null, `width/height` = page size in cm).

- [ ] **Step 1: Write the failing tests**

Append to `server/src/tests/assetType.test.ts` inside the `describe`:

```ts
    it('detects PDFs as books by extension', () => {
        expect(detectAssetType('application/pdf', 'katalog.pdf')).toBe('book');
        expect(detectAssetType('', 'Katalog.PDF')).toBe('book');
        expect(detectAssetType('application/octet-stream', 'katalog.pdf')).toBe('book');
    });
```

Create `server/src/tests/instanceMedia.test.ts`:

```ts
import { INSTANCE_MEDIA } from '../routes/instances';

describe('instance media', () => {
    it('accepts books next to the existing media', () => {
        expect(INSTANCE_MEDIA).toEqual(['frame', 'wallpaper', 'projector', 'display', 'model3d', 'monitor', 'beamer', 'splat', 'book']);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/assetType.test.ts src/tests/instanceMedia.test.ts`
Expected: FAIL — `.pdf` returns `null`; `INSTANCE_MEDIA` is undefined.

- [ ] **Step 3: Asset type and instance media**

`server/src/lib/assetType.ts`:

```ts
export type AssetType = 'image' | 'video' | 'model3d' | 'splat' | 'book';
```

and as the first line inside `detectAssetType` after `const ext = …`:

```ts
    // Books: the upload handler also checks the %PDF- signature (lib/pdfGeometry).
    if (ext === '.pdf') return 'book';
```

`server/src/routes/instances.ts` — above `instanceSchema`:

```ts
export const INSTANCE_MEDIA = ['frame', 'wallpaper', 'projector', 'display', 'model3d', 'monitor', 'beamer', 'splat', 'book'] as const;
```

and replace both `medium: z.enum([...]).optional()` (lines 20 and 159) with `medium: z.enum(INSTANCE_MEDIA).optional(),`.

`server/src/lib/artworkTitle.ts` line 2 — add `pdf` to the extension list: `…|ply|sog|spz|splat|ksplat|pdf)$/i`. Do the same in the client mirror `src/lib/artworkTitle.ts` (its `MEDIA_EXTENSION_RE`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest src/tests/assetType.test.ts src/tests/instanceMedia.test.ts`
Expected: PASS.

- [ ] **Step 5: Schema + migration**

`server/prisma/schema.prisma`, model `Artwork`, after `height`:

```prisma
  depth          Float?   // Book thickness in cm; null = automatic from the page count
  publicReadable Boolean  @default(false) // Book can be opened in the public viewer
```

Update the comments: `Asset.type` → `// "image", "video", "model3d", "splat", "book"`, `ArtworkInstance.medium` → add `"book"`.

`server/prisma/migrations/20260930120000_book_artwork_fields/migration.sql`:

```sql
-- BOOKS: thickness override (cm, NULL = automatic) and the public-viewer switch for PDF books.
ALTER TABLE `Artwork`
    ADD COLUMN `depth` DOUBLE NULL,
    ADD COLUMN `publicReadable` BOOLEAN NOT NULL DEFAULT false;
```

Run: `cd server && npx prisma generate` (no DB needed). Expected: „Generated Prisma Client".

- [ ] **Step 6: Background job**

Create `server/src/lib/bookJobs.ts`:

```ts
import path from 'path';
import { PrismaClient, type Prisma } from '@prisma/client';
import {
    BookProcessingError, bookStem, booksDir, processBookPdf, readBookMetadata,
    type BookAssetMetadata, type BookJobPhase,
} from './bookPdf';
import { artworkTitleFromFilename } from './artworkTitle';

/**
 * Books are processed in the background like videos (VID-03): the upload stores the PDF in
 * `<uploads>/.books/`, creates the asset with status "processing" and enqueues it here. One job
 * at a time; assets still "processing" after a restart are queued again.
 */

const prisma = new PrismaClient();
const uploadDir = path.join(__dirname, '../../uploads');

export interface BookJobProgress {
    phase: BookJobPhase;
    percent: null;
    phaseStartedAt: number;
    phaseElapsedMs: number;
    source: null;
    queuePosition: number | null;
    proxyHeight: null;
}

const queue: number[] = [];
const progress = new Map<number, { phase: BookJobPhase; phaseStartedAt: number }>();
let running = false;

const setPhase = (assetId: number, phase: BookJobPhase) => progress.set(assetId, { phase, phaseStartedAt: Date.now() });

export function getBookJobProgress(assetId: number): BookJobProgress | null {
    const current = progress.get(assetId);
    if (!current) return null;
    const index = queue.indexOf(assetId);
    return {
        ...current,
        percent: null,
        source: null,
        proxyHeight: null,
        phaseElapsedMs: Date.now() - current.phaseStartedAt,
        queuePosition: index >= 0 ? index + 1 : null,
    };
}

export function enqueueBookJob(assetId: number) {
    if (queue.includes(assetId) || progress.has(assetId)) return;
    queue.push(assetId);
    setPhase(assetId, 'queued');
    pump();
}

export async function resumeBookJobs() {
    const pending = await prisma.asset.findMany({
        where: { type: 'book', status: 'processing' },
        select: { id: true },
        orderBy: { id: 'asc' },
    });
    if (pending.length > 0) console.log(`[BookJobs] Resuming ${pending.length} book job(s)`);
    pending.forEach((a) => enqueueBookJob(a.id));
}

function pump() {
    if (running || queue.length === 0) return;
    const assetId = queue.shift()!;
    running = true;
    runBookJob(assetId)
        .catch((err) => console.error(`[BookJobs] Job for asset ${assetId} crashed:`, err))
        .finally(() => {
            running = false;
            progress.delete(assetId);
            pump();
        });
}

async function markFailed(assetId: number, meta: BookAssetMetadata | Record<string, never>, reason: string) {
    await prisma.asset.updateMany({
        where: { id: assetId, status: 'processing' },
        data: { status: 'failed', metadata: { ...meta, processingError: reason } as Prisma.InputJsonValue },
    });
}

async function runBookJob(assetId: number) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status !== 'processing') return;
    const meta = readBookMetadata(asset.metadata);
    if (!meta) return markFailed(assetId, {}, 'Buchdaten fehlen');

    setPhase(assetId, 'analyzing');
    const pdfPath = path.join(booksDir(uploadDir), path.basename(meta.pdfFile));
    try {
        const result = await processBookPdf(pdfPath, uploadDir, bookStem(meta.pdfFile), meta.coverVersion, undefined,
            (phase) => setPhase(assetId, phase));
        const updated = await prisma.asset.updateMany({
            where: { id: assetId, status: 'processing' },
            data: {
                status: 'ready',
                path: result.cover.path,
                thumbnailPath: result.cover.thumbnailPath,
                width: result.cover.width,
                height: result.cover.height,
                metadata: {
                    ...meta,
                    pageCount: result.pageCount,
                    pageWidthMm: result.pageWidthMm,
                    pageHeightMm: result.pageHeightMm,
                } as Prisma.InputJsonValue,
            },
        });
        if (updated.count === 0) return; // deleted meanwhile
        const widthCm = Math.round(result.pageWidthMm) / 10;
        const heightCm = Math.round(result.pageHeightMm) / 10;
        await prisma.artwork.upsert({
            where: { assetId },
            create: { assetId, title: artworkTitleFromFilename(asset.filename), width: widthCm, height: heightCm },
            update: { width: widthCm, height: heightCm },
        });
        console.log(`[BookJobs] Asset ${assetId}: ${result.pageCount} pages, ${result.pageWidthMm} × ${result.pageHeightMm} mm`);
    } catch (err) {
        const reason = err instanceof BookProcessingError ? err.message : 'PDF konnte nicht verarbeitet werden';
        console.warn(`[BookJobs] Asset ${assetId} failed:`, (err as Error).message);
        await markFailed(assetId, meta, reason);
    }
}
```

- [ ] **Step 7: Upload handler**

In `server/src/routes/upload.ts`:

1. Imports:

```ts
import { hasPdfMagic } from '../lib/pdfGeometry';
import { booksDir, coverFileNames } from '../lib/bookPdf';
import { enqueueBookJob } from '../lib/bookJobs';
```

2. `SIZE_LIMITS` gains `book: 200 * 1024 * 1024, // 200MB (PDF; only page 1 is rendered)`.
3. Both „Unsupported file type" messages (multer `fileFilter` and `POST /chunks`) end with `…, Gaussian splats (.ply, .sog, .spz, .splat, .ksplat), PDF-Bücher (.pdf)`.
4. In `handleStoredUpload`, directly after the splat inspection block (before `// Validate per-type size limit`):

```ts
  // Books: the extension alone is not trusted — the file must carry the PDF signature.
  if (assetType === 'book') {
      const handle = await fs.promises.open(file.path, 'r');
      const head = Buffer.alloc(1024);
      try {
          await handle.read(head, 0, 1024, 0);
      } finally {
          await handle.close();
      }
      if (!hasPdfMagic(head)) {
          discard();
          return { status: 400, body: { error: 'Datei ist kein gültiges PDF' } };
      }
  }
```

5. In the `try` dispatch, before `if (assetType === 'video')`:

```ts
      if (assetType === 'book') {
          const asset = await processBook(file, projectId, folderId, fileHash);
          return { status: 200, body: asset };
      }
```

6. New function next to `processVideo`:

```ts
// ── Books (PDF) ──
// The PDF moves into the dot-directory `.books/` (never served statically, see routes/books.ts);
// cover, page size and the artwork come from a background job (lib/bookJobs.ts).
async function processBook(file: StoredFile, projectId: string | undefined, folderId?: number, fileHash?: string) {
    const stem = file.filename.replace(/\.[^.]+$/, '');
    const pdfFile = `${stem}.pdf`;
    await fs.promises.mkdir(booksDir(uploadDir), { recursive: true });
    await fs.promises.rename(file.path, path.join(booksDir(uploadDir), pdfFile));

    const asset = await prisma.asset.create({
        data: {
            filename: path.basename(file.originalname, path.extname(file.originalname)),
            path: `/uploads/${coverFileNames(stem, 1).cover}`,
            mimetype: 'application/pdf',
            size: file.size,
            type: 'book',
            width: 0,
            height: 0,
            status: 'processing',
            fileHash,
            projectId: projectId ? parseInt(projectId, 10) : undefined,
            folderId,
            metadata: {
                projectId: projectId ? String(projectId) : undefined,
                pdfFile,
                coverSource: 'pdf',
                coverVersion: 1,
                originalSize: file.size,
            },
        },
    });
    console.log(`[Upload] Book ${file.originalname} queued for processing (asset ${asset.id})`);
    enqueueBookJob(asset.id);
    return asset;
}
```

- [ ] **Step 8: Processing route and startup**

`server/src/routes/assets.ts`: import `getBookJobProgress` from `../lib/bookJobs` and change the `job:` line of `GET /:id/processing` to:

```ts
            job: asset.status === 'processing' || meta.proxiesPending === true
                ? getVideoJobProgress(id) ?? getBookJobProgress(id)
                : null,
```

`server/src/index.ts`: `import { resumeBookJobs } from './lib/bookJobs';` and inside the `app.listen` callback after the video resume:

```ts
        resumeBookJobs().catch((err) => console.error('[BookJobs] Resume failed:', err));
```

- [ ] **Step 9: Build and run the server unit tests**

Run: `cd server && npm run build && npx jest src/tests/assetType.test.ts src/tests/instanceMedia.test.ts src/tests/pdfGeometry.test.ts src/tests/bookPdf.test.ts`
Expected: `tsc` without errors; all PASS.

- [ ] **Step 10: Commit**

```bash
git add server/prisma server/src/lib/assetType.ts server/src/lib/artworkTitle.ts src/lib/artworkTitle.ts server/src/lib/bookJobs.ts server/src/routes/upload.ts server/src/routes/assets.ts server/src/routes/instances.ts server/src/index.ts server/src/tests/assetType.test.ts server/src/tests/instanceMedia.test.ts
git commit -m "feat(books): accept PDF uploads and process them in the background"
```

---

### Task 4: Book settings endpoints (server)

**Files:**
- Modify: `server/src/routes/artworks.ts:128-175`, `server/src/routes/assets.ts` (new cover routes, delete cleanup)
- Test: `server/src/tests/artworkUpdate.test.ts`

**Interfaces:**
- Consumes: Task 2 `writeCoverSet`, `removeCoverSet`, `coverFileNames`, `readBookMetadata`, `bookStem`, `booksDir`.
- Produces:
  - `artworkUpdateSchema` (exported from `routes/artworks.ts`) with `depth?: number | null` (0.3–8) and `publicReadable?: boolean`; `PUT /artworks/:id` stores both.
  - `POST /assets/:id/cover` (multipart field `file`, JPG/PNG/WebP ≤ 20 MB) → updated asset incl. `artwork`.
  - `DELETE /assets/:id/cover` → updated asset incl. `artwork` (cover from the PDF again).
  - `DELETE /assets/:id` also removes `.books/<pdfFile>` and `<stem>-cover-pdf.webp` for books.

- [ ] **Step 1: Write the failing test**

```ts
// server/src/tests/artworkUpdate.test.ts
import { artworkUpdateSchema } from '../routes/artworks';

describe('artwork update', () => {
    it('accepts a book thickness between 0.3 and 8 cm, or null for automatic', () => {
        expect(artworkUpdateSchema.parse({ depth: 1.4 }).depth).toBe(1.4);
        expect(artworkUpdateSchema.parse({ depth: null }).depth).toBeNull();
        expect(() => artworkUpdateSchema.parse({ depth: 0.1 })).toThrow();
        expect(() => artworkUpdateSchema.parse({ depth: 9 })).toThrow();
    });
    it('accepts the public-viewer switch as a boolean only', () => {
        expect(artworkUpdateSchema.parse({ publicReadable: true }).publicReadable).toBe(true);
        expect(() => artworkUpdateSchema.parse({ publicReadable: 'ja' })).toThrow();
    });
    it('keeps the existing fields', () => {
        expect(artworkUpdateSchema.parse({ title: 'Katalog', artist: 'A. B.', year: '2024' })).toMatchObject({ title: 'Katalog' });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/tests/artworkUpdate.test.ts`
Expected: FAIL — `artworkUpdateSchema` is undefined.

- [ ] **Step 3: Export and extend the schema**

In `server/src/routes/artworks.ts`, move the inline schema of `PUT /:id` to module level:

```ts
export const artworkUpdateSchema = z.object({
    title: z.string().min(1).optional(),
    artist: z.string().optional(),
    year: z.string().optional(),
    description: z.string().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    /** Book thickness in cm; null = automatic from the page count. */
    depth: z.number().min(0.3).max(8).nullable().optional(),
    /** Book can be opened in the public viewer. */
    publicReadable: z.boolean().optional(),
});
```

In the handler use `const data = artworkUpdateSchema.parse(req.body);` and add to the `prisma.artwork.update` `data`: `depth: data.depth, publicReadable: data.publicReadable,`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/tests/artworkUpdate.test.ts`
Expected: PASS.

- [ ] **Step 5: Cover routes**

In `server/src/routes/assets.ts` add imports:

```ts
import multer from 'multer';
import os from 'os';
import { bookStem, booksDir, coverFileNames, readBookMetadata, removeCoverSet, writeCoverSet } from '../lib/bookPdf';
```

and before `// Uploads directory (real, resolved path)` (move the `uploadsDir` const above these routes if needed):

```ts
const coverUpload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

/** Loads a ready book asset the user may edit (same rule as PATCH /assets/:id). */
async function editableBook(req: Request) {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return null;
    const asset = await prisma.asset.findUnique({ where: { id }, include: { project: { select: { ownerId: true } } } });
    if (!asset || asset.type !== 'book' || asset.status !== 'ready') return null;
    if (req.user!.role !== 'admin' && asset.project?.ownerId !== req.user!.userId) return null;
    const meta = readBookMetadata(asset.metadata);
    return meta ? { asset, meta } : null;
}

/** Writes a new cover set from `sourcePath`, points the asset at it and drops the old set. */
async function replaceCover(req: Request, sourcePath: string, coverSource: 'pdf' | 'override') {
    const book = await editableBook(req);
    if (!book) return null;
    const stem = bookStem(book.meta.pdfFile);
    const version = book.meta.coverVersion + 1;
    const cover = await writeCoverSet(sourcePath, uploadsDir, stem, version);
    const updated = await prisma.asset.update({
        where: { id: book.asset.id },
        data: {
            path: cover.path,
            thumbnailPath: cover.thumbnailPath,
            width: cover.width,
            height: cover.height,
            metadata: { ...book.meta, coverVersion: version, coverSource } as Prisma.InputJsonValue,
        },
        include: { artwork: true },
    });
    removeCoverSet(uploadsDir, stem, book.meta.coverVersion);
    return updated;
}

// POST /assets/:id/cover — replacement cover for a book (JPG/PNG/WebP).
assetsRouter.post('/:id/cover', authenticate, coverUpload.single('file'), async (req: Request, res) => {
    const tmp = req.file?.path;
    try {
        if (!tmp) return res.status(400).json({ error: 'Bild konnte nicht gelesen werden' });
        const updated = await replaceCover(req, tmp, 'override');
        if (!updated) return res.status(404).json({ error: 'Buch nicht gefunden' });
        res.json(updated);
    } catch (err) {
        console.warn('[Books] Cover replacement failed:', (err as Error).message);
        res.status(400).json({ error: 'Bild konnte nicht gelesen werden' });
    } finally {
        if (tmp) fs.rmSync(tmp, { force: true });
    }
});

// DELETE /assets/:id/cover — back to the cover rendered from the PDF.
assetsRouter.delete('/:id/cover', authenticate, async (req: Request, res) => {
    try {
        const book = await editableBook(req);
        if (!book) return res.status(404).json({ error: 'Buch nicht gefunden' });
        const source = path.join(uploadsDir, coverFileNames(bookStem(book.meta.pdfFile), 1).coverPdf);
        const updated = await replaceCover(req, source, 'pdf');
        res.json(updated);
    } catch (err) {
        console.error('[Books] Cover reset failed:', err);
        res.status(500).json({ error: 'Cover konnte nicht zurückgesetzt werden' });
    }
});
```

- [ ] **Step 6: Delete cleanup**

In `DELETE /assets/:id`, after the thumbnail block (before `res.json({ message: … })`):

```ts
        // Books: the private PDF and the page-1 render kept for „Cover aus PDF verwenden".
        const bookMeta = asset.type === 'book' ? readBookMetadata(asset.metadata) : null;
        if (bookMeta) {
            fs.rmSync(path.join(booksDir(uploadsDir), path.basename(bookMeta.pdfFile)), { force: true });
            fs.rmSync(path.join(uploadsDir, coverFileNames(bookStem(bookMeta.pdfFile), 1).coverPdf), { force: true });
        }
```

(The cover and its 512/256 thumbnails are `asset.path` / `asset.thumbnailPath` and are already removed by the existing code.)

- [ ] **Step 7: Build**

Run: `cd server && npm run build && npx jest src/tests/artworkUpdate.test.ts`
Expected: no `tsc` errors; PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/artworks.ts server/src/routes/assets.ts server/src/tests/artworkUpdate.test.ts
git commit -m "feat(books): thickness, public switch and replacement cover endpoints"
```

---

### Task 5: Protected PDF route and public data (server)

**Files:**
- Create: `server/src/lib/bookAccess.ts`, `server/src/routes/books.ts`
- Modify: `server/src/lib/middleware.ts`, `server/src/index.ts`, `server/src/routes/public.ts`
- Test: `server/src/tests/bookAccess.test.ts`, `server/src/tests/booksRoute.test.ts`

**Interfaces:**
- Consumes: Task 2 `booksDir`, `readBookMetadata`; `userCanAccessProject(prisma, userId, projectId, isAdmin)`.
- Produces:
  - `canReadBookPdf(input: { hasProjectAccess: boolean; publicReadable: boolean; inPublishedVersion: boolean }): boolean`
  - `safeBookFile(pdfFile: string): string | null` (basename ending in `.pdf`, else null)
  - `readOptionalUser(req: Request): { userId: number; role: AppRole } | null` in `lib/middleware.ts`
  - `GET /books/:assetId/pdf` and `/api/books/:assetId/pdf`
  - `/public/exhibition/:slug`: book assets without `metadata.pdfFile`.

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/tests/bookAccess.test.ts
import { canReadBookPdf, safeBookFile } from '../lib/bookAccess';

describe('canReadBookPdf', () => {
    const cases: [boolean, boolean, boolean, boolean][] = [
        // hasProjectAccess, publicReadable, inPublishedVersion → allowed
        [true, false, false, true],
        [true, true, true, true],
        [false, true, true, true],
        [false, true, false, false],
        [false, false, true, false],
        [false, false, false, false],
    ];
    it.each(cases)('access=%s readable=%s published=%s → %s', (hasProjectAccess, publicReadable, inPublishedVersion, allowed) => {
        expect(canReadBookPdf({ hasProjectAccess, publicReadable, inPublishedVersion })).toBe(allowed);
    });
});

describe('safeBookFile', () => {
    it('keeps plain PDF basenames and rejects everything else', () => {
        expect(safeBookFile('abc-katalog.pdf')).toBe('abc-katalog.pdf');
        expect(safeBookFile('../../etc/passwd')).toBeNull();
        expect(safeBookFile('sub/abc.pdf')).toBeNull();
        expect(safeBookFile('abc.webp')).toBeNull();
        expect(safeBookFile('')).toBeNull();
    });
});
```

```ts
// server/src/tests/booksRoute.test.ts
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../index';

const booksDir = path.join(__dirname, '../../uploads/.books');
const FILE = `route-test-${Date.now()}.pdf`;

beforeAll(() => {
    fs.mkdirSync(booksDir, { recursive: true });
    fs.writeFileSync(path.join(booksDir, FILE), '%PDF-1.4\n%%EOF\n');
});
afterAll(() => fs.rmSync(path.join(booksDir, FILE), { force: true }));

describe('book PDFs', () => {
    it('are never served by the static uploads handler', async () => {
        for (const prefix of ['/uploads', '/api/uploads']) {
            const res = await request(app).get(`${prefix}/.books/${FILE}`);
            expect(res.status).toBe(404);
        }
    });
    it('answer 404 for a malformed asset id without touching the database', async () => {
        const res = await request(app).get('/api/books/abc/pdf');
        expect(res.status).toBe(404);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/bookAccess.test.ts src/tests/booksRoute.test.ts`
Expected: FAIL — module `../lib/bookAccess` missing; `/api/books/abc/pdf` returns the JSON 404 fallback only after the route exists — the static test may already pass (that is fine: it pins the behaviour).

- [ ] **Step 3: Implement the pure access helpers**

```ts
// server/src/lib/bookAccess.ts
import path from 'path';

/**
 * Who may download a book's PDF: anyone with access to the asset's project (curators in the
 * editor), or — for the public viewer — anyone, when the curator switched „Im öffentlichen Viewer
 * lesbar" on and the book stands in a published version.
 */
export function canReadBookPdf(input: { hasProjectAccess: boolean; publicReadable: boolean; inPublishedVersion: boolean }): boolean {
    return input.hasProjectAccess || (input.publicReadable && input.inPublishedVersion);
}

/** The stored PDF name if it is a plain `.pdf` basename, else null (no path parts). */
export function safeBookFile(pdfFile: string): string | null {
    if (!pdfFile || path.basename(pdfFile) !== pdfFile || !/\.pdf$/i.test(pdfFile)) return null;
    return pdfFile;
}
```

- [ ] **Step 4: Optional user in the middleware**

Append to `server/src/lib/middleware.ts`:

```ts
/** The JWT user if a valid token is sent, else null — for routes that also serve anonymous visitors. */
export const readOptionalUser = (req: Request): { userId: number; role: AppRole } | null => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number; role: AppRole };
  } catch {
    return null;
  }
};
```

- [ ] **Step 5: The route**

```ts
// server/src/routes/books.ts
import { Router } from 'express';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { readOptionalUser, userCanAccessProject } from '../lib/middleware';
import { booksDir, readBookMetadata } from '../lib/bookPdf';
import { canReadBookPdf, safeBookFile } from '../lib/bookAccess';

export const booksRouter = Router();
const prisma = new PrismaClient();
const uploadDir = path.join(__dirname, '../../uploads');

const notFound = (res: import('express').Response) => res.status(404).json({ error: 'Buch nicht gefunden' });

// GET /books/:assetId/pdf — the PDF of a book. Extensionless on purpose: Cloudflare neither
// caches it nor drops the Range header pdf.js relies on (same reason as /uploads/stream).
booksRouter.get('/:assetId/pdf', async (req, res) => {
    const id = Number(req.params.assetId);
    if (!Number.isInteger(id) || id <= 0) return notFound(res);
    try {
        const asset = await prisma.asset.findUnique({
            where: { id },
            include: { artwork: { select: { id: true, publicReadable: true } } },
        });
        if (!asset || asset.type !== 'book' || asset.status !== 'ready') return notFound(res);
        const meta = readBookMetadata(asset.metadata);
        const file = meta ? safeBookFile(meta.pdfFile) : null;
        if (!file) return notFound(res);

        const user = readOptionalUser(req);
        const hasProjectAccess = !!user && (user.role === 'admin'
            || (asset.projectId !== null && await userCanAccessProject(prisma, user.userId, asset.projectId, false)));
        const publicReadable = asset.artwork?.publicReadable === true;
        const inPublishedVersion = !hasProjectAccess && publicReadable && asset.artwork
            ? await prisma.artworkInstance.count({ where: { artworkId: asset.artwork.id, version: { is_published: true } } }) > 0
            : false;
        if (!canReadBookPdf({ hasProjectAccess, publicReadable, inPublishedVersion })) return notFound(res);

        res.sendFile(file, {
            root: booksDir(uploadDir),
            cacheControl: false,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline',
                'X-Content-Type-Options': 'nosniff',
                'Content-Security-Policy': 'sandbox',
                'Cache-Control': 'private, max-age=3600',
            },
        }, (err) => {
            if (err && !res.headersSent) notFound(res);
        });
    } catch (err) {
        console.error('[Books] PDF request failed:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Buch konnte nicht geladen werden' });
    }
});
```

`server/src/index.ts`: `import { booksRouter } from './routes/books';`, then `app.use('/books', booksRouter);` in the direct block and `app.use('/api/books', booksRouter);` in the `/api` block.

- [ ] **Step 6: Public data without the PDF name**

In `server/src/routes/public.ts`, `GET /exhibition/:slug`, replace `instances: version.instances,` with:

```ts
            // Books: the PDF name stays server-side; the viewer asks /api/books/:id/pdf.
            instances: version.instances.map((inst) => {
                const asset = inst.artwork?.asset;
                if (asset?.type !== 'book' || !asset.metadata || typeof asset.metadata !== 'object' || Array.isArray(asset.metadata)) return inst;
                const { pdfFile: _pdfFile, ...metadata } = asset.metadata as Record<string, unknown>;
                return { ...inst, artwork: { ...inst.artwork, asset: { ...asset, metadata } } };
            }),
```

If ESLint flags `_pdfFile` as unused, destructure with `// eslint-disable-next-line @typescript-eslint/no-unused-vars` on the line above (server lint config).

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd server && npm run build && npx jest src/tests/bookAccess.test.ts src/tests/booksRoute.test.ts`
Expected: PASS (7 + 2 tests). `booksRoute` must not need a DB: the static test never reaches Prisma, and the malformed id returns before the query.

- [ ] **Step 8: Commit**

```bash
git add server/src/lib/bookAccess.ts server/src/routes/books.ts server/src/lib/middleware.ts server/src/index.ts server/src/routes/public.ts server/src/tests/bookAccess.test.ts server/src/tests/booksRoute.test.ts
git commit -m "feat(books): serve book PDFs only through an access-checked route"
```

---

### Task 6: Client types and book geometry (pure)

**Files:**
- Create: `src/lib/book/geometry.ts`
- Modify: `src/store/editorStore.ts:40-50, 66-74, 75-110, 162`
- Test: `src/lib/book/geometry.test.ts`

**Interfaces:**
- Produces (editorStore):
  - `AssetType` + `'book'`; `MediumType` + `'book'`; `isFloorAssetType('book') === true`; `artworkMinY` returns 0 for `medium === 'book'`.
  - `isFixedSizeMedium(medium: string | null | undefined): boolean` — `'monitor' | 'book'`.
  - `ArtworkInstanceData.artwork` gains `depth?: number | null; publicReadable?: boolean;`, `artwork.asset` gains `id?: number;` and its `metadata` type becomes `BookAssetMeta & { videoProxies?: … }` where `interface BookAssetMeta { pageCount?: number; pageWidthMm?: number; pageHeightMm?: number; coverVersion?: number; coverSource?: 'pdf' | 'override' }` (exported).
  - `DragState.draggedAsset` gains `book?: BookDragInfo` with `interface BookDragInfo { assetId: number; pageCount: number; depth: number | null; publicReadable: boolean; title: string; artist: string | null; year: string | null; thumbnailPath: string | null }` (exported).
- Produces (geometry):
  - `PEDESTAL_HEIGHT = 1.2`, `PEDESTAL_MARGIN = 0.1`, `PEDESTAL_MIN = 0.4`, `HIT_PAD = 0.01`, `HIT_MIN_HEIGHT = 0.05`, `BOOK_OPEN_DISTANCE = 2.5`
  - `interface BookSize { width: number; length: number; thickness: number }` (m; width = page width along X, length = page height along Z, thickness along Y)
  - `interface PedestalSize { width: number; depth: number; height: number }`
  - `autoThicknessCm(pageCount: number): number`
  - `bookSize(input: { widthCm?: number | null; heightCm?: number | null; depthCm?: number | null; pageCount?: number | null }): BookSize`
  - `bookSizeOf(inst: ArtworkInstanceData): BookSize`
  - `pedestalSize(book: BookSize): PedestalSize`
  - `bookHitBox(book: BookSize): { min: [number, number, number]; max: [number, number, number] }` (local to the book group whose origin is the pedestal top centre)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/book/geometry.test.ts
import { describe, expect, it } from 'vitest';
import { autoThicknessCm, bookHitBox, bookSize, pedestalSize, PEDESTAL_HEIGHT } from './geometry';
import { artworkMinY, isFixedSizeMedium, isFloorAssetType } from '@/store/editorStore';

describe('autoThicknessCm', () => {
  it('counts 0.1 mm per sheet plus 4 mm of board', () => {
    expect(autoThicknessCm(200)).toBeCloseTo(1.4);
    expect(autoThicknessCm(201)).toBeCloseTo(1.41);
  });
  it('stays between 0.3 and 8 cm', () => {
    expect(autoThicknessCm(0)).toBeCloseTo(0.4);
    expect(autoThicknessCm(20000)).toBe(8);
  });
});

describe('bookSize', () => {
  it('uses the page size and the manual thickness', () => {
    expect(bookSize({ widthCm: 21, heightCm: 29.7, depthCm: 2, pageCount: 200 })).toEqual({ width: 0.21, length: 0.297, thickness: 0.02 });
  });
  it('falls back to the automatic thickness and to A4', () => {
    const size = bookSize({ widthCm: null, heightCm: undefined, depthCm: null, pageCount: 200 });
    expect(size.width).toBeCloseTo(0.21);
    expect(size.length).toBeCloseTo(0.297);
    expect(size.thickness).toBeCloseTo(0.014);
  });
});

describe('pedestalSize', () => {
  it('adds 10 cm per side, at least 40 × 40 cm, 1.20 m high', () => {
    expect(pedestalSize({ width: 0.21, length: 0.297, thickness: 0.014 })).toEqual({ width: 0.41, depth: 0.497, height: PEDESTAL_HEIGHT });
    expect(pedestalSize({ width: 0.1, length: 0.15, thickness: 0.01 })).toEqual({ width: 0.4, depth: 0.4, height: 1.2 });
  });
});

describe('bookHitBox', () => {
  it('is 1 cm larger than the book per side and at least 5 cm high', () => {
    expect(bookHitBox({ width: 0.2, length: 0.3, thickness: 0.014 })).toEqual({ min: [-0.11, 0, -0.16], max: [0.11, 0.05, 0.16] });
    expect(bookHitBox({ width: 0.2, length: 0.3, thickness: 0.08 }).max[1]).toBeCloseTo(0.08);
  });
});

describe('book medium', () => {
  it('stands on the floor and keeps its size', () => {
    expect(isFloorAssetType('book')).toBe(true);
    expect(isFixedSizeMedium('book')).toBe(true);
    expect(isFixedSizeMedium('monitor')).toBe(true);
    expect(isFixedSizeMedium('frame')).toBe(false);
    const inst = { medium: 'book' as const, scale_y: 1, artwork: { asset: { path: '', width: 1, height: 1, dpi: 72 } } };
    expect(artworkMinY(inst)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/book/geometry.test.ts`
Expected: FAIL — `./geometry` not found.

- [ ] **Step 3: Store types**

In `src/store/editorStore.ts`:

```ts
export type AssetType = 'image' | 'video' | 'model3d' | 'splat' | 'book';
export type MediumType = 'frame' | 'wallpaper' | 'projector' | 'display' | 'model3d' | 'monitor' | 'beamer' | 'splat' | 'book';

/** Assets that stand on the floor (3D models, Gaussian splats, books on pedestals) instead of hanging on a wall. */
export function isFloorAssetType(type: string | null | undefined): boolean {
  return type === 'model3d' || type === 'splat' || type === 'book';
}

/** Media whose size is given (monitor model, book from its PDF) — never scaled. */
export function isFixedSizeMedium(medium: string | null | undefined): boolean {
  return medium === 'monitor' || medium === 'book';
}

/** Book data kept in Asset.metadata (server: lib/bookPdf.ts BookAssetMetadata). */
export interface BookAssetMeta {
  pageCount?: number;
  pageWidthMm?: number;
  pageHeightMm?: number;
  coverVersion?: number;
  coverSource?: 'pdf' | 'override';
}

/** What a dragged book needs before the server returns the instance (drop ghost, first render). */
export interface BookDragInfo {
  assetId: number;
  pageCount: number;
  depth: number | null;
  publicReadable: boolean;
  title: string;
  artist: string | null;
  year: string | null;
  thumbnailPath: string | null;
}
```

In `artworkMinY` change the first check to `if (inst.medium === 'model3d' || inst.medium === 'splat' || inst.medium === 'book') return 0;`.

In `ArtworkInstanceData.artwork` add after `height`:

```ts
    /** Book thickness in cm; null = automatic from the page count. */
    depth?: number | null;
    /** Book can be opened in the public viewer. */
    publicReadable?: boolean;
```

and in `asset`: `id?: number;` plus `metadata?: (BookAssetMeta & { videoProxies?: Record<string, string> | null }) | null;`.

In `DragState.draggedAsset` append `; book?: BookDragInfo` to the object type.

- [ ] **Step 4: Geometry**

```ts
// src/lib/book/geometry.ts
import type { ArtworkInstanceData } from '@/store/editorStore';

/**
 * Sizes of a book on its pedestal, in metres. The book lies flat, cover up; the pedestal's origin
 * is the centre of its bottom face, the book group's origin the centre of the pedestal top.
 */

export const PEDESTAL_HEIGHT = 1.2;
export const PEDESTAL_MARGIN = 0.1;
export const PEDESTAL_MIN = 0.4;
export const HIT_PAD = 0.01;
export const HIT_MIN_HEIGHT = 0.05;
/** First person: books open from this distance or closer. */
export const BOOK_OPEN_DISTANCE = 2.5;

/** Page width (X), page height (Z, cover top towards −Z), thickness (Y). */
export interface BookSize {
  width: number;
  length: number;
  thickness: number;
}

export interface PedestalSize {
  width: number;
  depth: number;
  height: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** 0.1 mm per sheet (80 g/m²) plus 2 × 2 mm board, 0.3–8 cm. */
export function autoThicknessCm(pageCount: number): number {
  return clamp(Math.ceil(Math.max(0, pageCount) / 2) * 0.01 + 0.4, 0.3, 8);
}

export function bookSize(input: { widthCm?: number | null; heightCm?: number | null; depthCm?: number | null; pageCount?: number | null }): BookSize {
  const widthCm = input.widthCm && input.widthCm > 0 ? input.widthCm : 21;
  const heightCm = input.heightCm && input.heightCm > 0 ? input.heightCm : 29.7;
  const depthCm = input.depthCm ?? autoThicknessCm(input.pageCount ?? 0);
  return { width: round4(widthCm / 100), length: round4(heightCm / 100), thickness: round4(depthCm / 100) };
}

export function bookSizeOf(inst: ArtworkInstanceData): BookSize {
  return bookSize({
    widthCm: inst.artwork.width,
    heightCm: inst.artwork.height,
    depthCm: inst.artwork.depth,
    pageCount: inst.artwork.asset.metadata?.pageCount,
  });
}

export function pedestalSize(book: BookSize): PedestalSize {
  return {
    width: round4(Math.max(PEDESTAL_MIN, book.width + 2 * PEDESTAL_MARGIN)),
    depth: round4(Math.max(PEDESTAL_MIN, book.length + 2 * PEDESTAL_MARGIN)),
    height: PEDESTAL_HEIGHT,
  };
}

export function bookHitBox(book: BookSize): { min: [number, number, number]; max: [number, number, number] } {
  const hx = round4(book.width / 2 + HIT_PAD);
  const hz = round4(book.length / 2 + HIT_PAD);
  return { min: [-hx, 0, -hz], max: [hx, round4(Math.max(book.thickness, HIT_MIN_HEIGHT)), hz] };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/book/geometry.test.ts && npx tsc -b --noEmit`
Expected: PASS; `tsc` may report exhaustiveness errors where `AssetType`/`MediumType` unions are switched on — fix each by treating `'book'` like `'model3d'` only where it is a pure type error (no behaviour change yet; behaviour follows in Tasks 10–13).

- [ ] **Step 6: Commit**

```bash
git add src/lib/book/geometry.ts src/lib/book/geometry.test.ts src/store/editorStore.ts
git commit -m "feat(books): client types and pedestal geometry"
```

---

### Task 7: Viewer store, controls lock and open/close order

**Files:**
- Create: `src/store/bookViewerStore.ts`, `src/lib/controlsLock.ts`, `src/lib/book/viewerActions.ts`
- Test: `src/lib/book/viewerActions.test.ts`

**Interfaces:**
- Produces:
  - `interface OpenBook { assetId: number; title: string; pageCount: number; publicView: boolean }`
  - `useBookViewerStore` with state `book: OpenBook | null`, `resumeFirstPerson: boolean`, `hoveredBookId: number | null`, `bookInReachId: number | null` and actions `setOpen(book: OpenBook, resumeFirstPerson: boolean)`, `clear()`, `setHoveredBook(id: number | null)`, `setBookInReach(id: number | null)`.
  - `useControlsLocked(): boolean`, `isControlsLocked(): boolean` (`isDialogOpen || book !== null`).
  - `interface PointerEnv { pointerLocked(): boolean; exitPointerLock(): void; requestPointerLock(): void; leaveFirstPerson(): void }`
  - `openBook(book: OpenBook, env?: PointerEnv): void`, `closeBook(reason: 'button' | 'escape', env?: PointerEnv): void`, `domPointerEnv: PointerEnv`.

Close rules: button → re-lock at once (a click is a user gesture); escape → no re-lock (ESC is not a user activation). In the editor an unlocked pointer means „out of first person", so ESC-closing in the editor returns to the orbit view (`leaveFirstPerson`); in the public viewer (`publicView`) the existing entry overlay („Klicken zum Betreten") takes the next click. This refines the spec's „Klicken zum Weitergehen" for the editor, which has no such overlay.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/book/viewerActions.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { closeBook, openBook, type PointerEnv } from './viewerActions';
import { useBookViewerStore } from '@/store/bookViewerStore';
import { isControlsLocked } from '@/lib/controlsLock';
import { useEditorStore } from '@/store/editorStore';

const BOOK = { assetId: 7, title: 'Katalog', pageCount: 12, publicView: false };

function fakeEnv(locked: boolean) {
  const log: string[] = [];
  const env: PointerEnv = {
    pointerLocked: () => locked,
    exitPointerLock: () => log.push(`exit(book=${useBookViewerStore.getState().book ? 'set' : 'null'})`),
    requestPointerLock: () => log.push('request'),
    leaveFirstPerson: () => log.push('leave'),
  };
  return { env, log };
}

beforeEach(() => {
  useBookViewerStore.getState().clear();
  useEditorStore.setState({ isDialogOpen: false });
});

describe('openBook', () => {
  it('sets the book before releasing the pointer, so the unlock handler sees the lock', () => {
    const { env, log } = fakeEnv(true);
    openBook(BOOK, env);
    expect(log).toEqual(['exit(book=set)']);
    expect(useBookViewerStore.getState().resumeFirstPerson).toBe(true);
    expect(isControlsLocked()).toBe(true);
  });
  it('does not touch the pointer when it was not locked', () => {
    const { env, log } = fakeEnv(false);
    openBook(BOOK, env);
    expect(log).toEqual([]);
    expect(useBookViewerStore.getState().resumeFirstPerson).toBe(false);
  });
});

describe('closeBook', () => {
  it('re-locks at once after the close button in first person', () => {
    const { env, log } = fakeEnv(true);
    openBook(BOOK, env);
    closeBook('button', env);
    expect(log).toEqual(['exit(book=set)', 'request']);
    expect(isControlsLocked()).toBe(false);
  });
  it('leaves first person after ESC in the editor (no user gesture to re-lock)', () => {
    const { env, log } = fakeEnv(true);
    openBook(BOOK, env);
    closeBook('escape', env);
    expect(log).toEqual(['exit(book=set)', 'leave']);
  });
  it('leaves re-entry to the entry overlay after ESC in the public viewer', () => {
    const { env, log } = fakeEnv(true);
    openBook({ ...BOOK, publicView: true }, env);
    closeBook('escape', env);
    expect(log).toEqual(['exit(book=set)']);
  });
  it('does nothing when no book is open', () => {
    const { env, log } = fakeEnv(false);
    closeBook('button', env);
    expect(log).toEqual([]);
  });
});

describe('controls lock', () => {
  it('also follows the existing dialog flag', () => {
    useEditorStore.setState({ isDialogOpen: true });
    expect(isControlsLocked()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/book/viewerActions.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

```ts
// src/store/bookViewerStore.ts
import { create } from 'zustand';

/**
 * The open book (2D flip viewer) and the book under the cursor/crosshair. Separate from
 * editorStore so the public viewer, which has no editor state, can use it too.
 */

export interface OpenBook {
  assetId: number;
  title: string;
  pageCount: number;
  /** Opened in the public viewer (no editor view modes). */
  publicView: boolean;
}

interface BookViewerState {
  book: OpenBook | null;
  /** The pointer was locked (first person) when the book opened. */
  resumeFirstPerson: boolean;
  /** Orbit view: book under the mouse (hover outline). */
  hoveredBookId: number | null;
  /** First person: book under the crosshair within BOOK_OPEN_DISTANCE. */
  bookInReachId: number | null;
  setOpen: (book: OpenBook, resumeFirstPerson: boolean) => void;
  clear: () => void;
  setHoveredBook: (id: number | null) => void;
  setBookInReach: (id: number | null) => void;
}

export const useBookViewerStore = create<BookViewerState>((set) => ({
  book: null,
  resumeFirstPerson: false,
  hoveredBookId: null,
  bookInReachId: null,
  setOpen: (book, resumeFirstPerson) => set({ book, resumeFirstPerson }),
  clear: () => set({ book: null, resumeFirstPerson: false }),
  setHoveredBook: (id) => set((s) => (s.hoveredBookId === id ? s : { hoveredBookId: id })),
  setBookInReach: (id) => set((s) => (s.bookInReachId === id ? s : { bookInReachId: id })),
}));
```

```ts
// src/lib/controlsLock.ts
import { useEditorStore } from '@/store/editorStore';
import { useBookViewerStore } from '@/store/bookViewerStore';

/**
 * One answer to „may the 3D controls move?": no while a dialog (metadata etc.) or the book viewer
 * is open. Player, PointerLockControls, OrbitControls and the editor's keys all ask this.
 */
export function useControlsLocked(): boolean {
  const dialogOpen = useEditorStore((s) => s.isDialogOpen);
  const bookOpen = useBookViewerStore((s) => s.book !== null);
  return dialogOpen || bookOpen;
}

export function isControlsLocked(): boolean {
  return useEditorStore.getState().isDialogOpen || useBookViewerStore.getState().book !== null;
}
```

```ts
// src/lib/book/viewerActions.ts
import { useBookViewerStore, type OpenBook } from '@/store/bookViewerStore';
import { useEditorStore } from '@/store/editorStore';

export interface PointerEnv {
  pointerLocked(): boolean;
  exitPointerLock(): void;
  requestPointerLock(): void;
  leaveFirstPerson(): void;
}

export const domPointerEnv: PointerEnv = {
  pointerLocked: () => !!document.pointerLockElement,
  exitPointerLock: () => document.exitPointerLock(),
  requestPointerLock: () => {
    const canvas = document.querySelector('canvas');
    // Chrome returns a promise that rejects without a user gesture; ignore that case.
    const result = canvas?.requestPointerLock() as unknown as Promise<void> | undefined;
    result?.catch?.(() => undefined);
  },
  leaveFirstPerson: () => {
    if (useEditorStore.getState().plannerViewMode === 'firstPerson') useEditorStore.getState().setPlannerViewMode('perspective');
  },
};

/**
 * Store first, pointer second: releasing the pointer lock fires PlannerCameraSystem's unlock
 * handler, which leaves first person unless the controls are locked.
 */
export function openBook(book: OpenBook, env: PointerEnv = domPointerEnv): void {
  const locked = env.pointerLocked();
  useBookViewerStore.getState().setOpen(book, locked);
  if (locked) env.exitPointerLock();
}

export function closeBook(reason: 'button' | 'escape', env: PointerEnv = domPointerEnv): void {
  const { book, resumeFirstPerson } = useBookViewerStore.getState();
  if (!book) return;
  useBookViewerStore.getState().clear();
  if (!resumeFirstPerson) return;
  if (reason === 'button') env.requestPointerLock();
  else if (!book.publicView) env.leaveFirstPerson();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/book/viewerActions.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/bookViewerStore.ts src/lib/controlsLock.ts src/lib/book/viewerActions.ts src/lib/book/viewerActions.test.ts
git commit -m "feat(books): viewer store and pointer-lock order for opening books"
```

---

### Task 8: Upload and asset browser tiles

**Files:**
- Create: `src/components/book/BookPreviewTile.tsx`
- Modify: `src/lib/uploadFiles.ts`, `src/hooks/use-video-processing.ts`, `src/components/AssetSidebar.tsx:31-50, 150-172, 330-360`, `src/components/AssetLibrary.tsx` (tile around line 964, drag start)
- Test: `src/lib/uploadFiles.test.ts` (extend)

**Interfaces:**
- Consumes: Task 6 `BookDragInfo`.
- Produces: `BOOK_EXTENSIONS = ['.pdf']`; `isSupportedUploadFile` accepts PDFs; `VideoJobPhase` also covers `'cover' | 'tiers'`; `<BookPreviewTile filename thumbnailPath pageCount compact? />`; `bookDragInfo(asset): BookDragInfo | undefined` in `src/lib/book/api.ts` (created here, extended in Task 9).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/uploadFiles.test.ts`:

```ts
describe('book uploads', () => {
  it('accepts PDFs whatever MIME type the browser sends', () => {
    expect(isSupportedUploadFile(file('katalog.pdf', 'application/pdf'))).toBe(true);
    expect(isSupportedUploadFile(file('Katalog.PDF', ''))).toBe(true);
  });
  it('lists PDFs in the file picker', () => {
    expect(UPLOAD_ACCEPT.split(',')).toContain('.pdf');
  });
});
```

and add `UPLOAD_ACCEPT` to the import from `./uploadFiles`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/uploadFiles.test.ts`
Expected: FAIL on the two new tests.

- [ ] **Step 3: Accept PDFs**

`src/lib/uploadFiles.ts`:

```ts
/** PDFs become books on a pedestal (server renders the cover). */
export const BOOK_EXTENSIONS = ['.pdf'];

/** `accept` attribute for file inputs. */
export const UPLOAD_ACCEPT = ['image/*', 'video/*', ...VIDEO_EXTENSIONS, ...MODEL_EXTENSIONS, ...SPLAT_EXTENSIONS, ...BOOK_EXTENSIONS].join(',');

export const SUPPORTED_FORMATS_HINT =
  'Bilder, Videos (.mp4, .mov, .webm, .mkv, …), 3D-Modelle (.glb, .fbx, .obj, .usdz, .stl, …), Gaussian Splats (.ply, .sog, .spz, .splat, .ksplat) und PDF-Bücher (.pdf)';
```

and in `isSupportedUploadFile` return `VIDEO_EXTENSIONS.includes(ext) || MODEL_EXTENSIONS.includes(ext) || SPLAT_EXTENSIONS.includes(ext) || BOOK_EXTENSIONS.includes(ext);`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/uploadFiles.test.ts`
Expected: PASS.

- [ ] **Step 5: Processing phases**

`src/hooks/use-video-processing.ts` (the hook polls any asset; books report their own phases):

```ts
export type VideoJobPhase = 'queued' | 'analyzing' | 'remuxing' | 'transcoding' | 'thumbnail' | 'proxies' | 'cover' | 'tiers';

export const VIDEO_PHASE_LABELS: Record<VideoJobPhase, string> = {
    queued: 'Warteschlange',
    analyzing: 'Analyse',
    remuxing: 'Übernahme',
    transcoding: 'Umwandlung',
    thumbnail: 'Vorschaubild',
    proxies: 'Kleinere Versionen',
    cover: 'Cover wird erzeugt',
    tiers: 'Vorschaubilder',
};
```

- [ ] **Step 6: Tile + drag payload**

```tsx
// src/components/book/BookPreviewTile.tsx
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookPreviewTileProps {
  filename: string;
  thumbnailPath?: string | null;
  pageCount?: number;
  compact?: boolean;
}

/** Asset tile of a PDF book: the cover thumbnail with a page-count badge. */
export function BookPreviewTile({ filename, thumbnailPath, pageCount, compact }: BookPreviewTileProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-zinc-800">
      {thumbnailPath
        ? <img src={thumbnailPath} alt={filename} className="h-full w-full object-contain" draggable={false} loading="lazy" decoding="async" />
        : <BookOpen className={cn('text-zinc-500', compact ? 'h-6 w-6' : 'h-10 w-10')} />}
      <div className="pointer-events-none absolute left-1 top-1 flex items-center gap-1 rounded bg-black/60 px-1 py-0.5 text-[9px] leading-none text-white">
        <BookOpen className="h-2.5 w-2.5" />
        {pageCount ? `${pageCount} S.` : 'PDF'}
      </div>
    </div>
  );
}
```

Create `src/lib/book/api.ts` with (Task 9 adds the fetch helpers to the same file):

```ts
import type { BookDragInfo } from '@/store/editorStore';

/** Minimal shape of an asset row as the asset browser lists it. */
export interface BookAssetRow {
  id: number;
  type?: string;
  thumbnailPath?: string | null;
  metadata?: { pageCount?: number } | null;
  artwork?: { title?: string; artist?: string | null; year?: string | null; depth?: number | null; publicReadable?: boolean } | null;
}

export function bookDragInfo(asset: BookAssetRow): BookDragInfo | undefined {
  if (asset.type !== 'book') return undefined;
  return {
    assetId: asset.id,
    pageCount: asset.metadata?.pageCount ?? 0,
    depth: asset.artwork?.depth ?? null,
    publicReadable: asset.artwork?.publicReadable ?? false,
    title: asset.artwork?.title ?? '',
    artist: asset.artwork?.artist ?? null,
    year: asset.artwork?.year ?? null,
    thumbnailPath: asset.thumbnailPath ?? null,
  };
}
```

`src/components/AssetSidebar.tsx`:
1. Extend the local `Asset` interface: `metadata?: { proxiesPending?: boolean; pageCount?: number } | null;` and `artwork` with `artist?: string | null; year?: string | null; depth?: number | null; publicReadable?: boolean;`.
2. In `handleDragStart`'s `setDragging(true, {...})` add `book: bookDragInfo(asset),` (import from `@/lib/book/api`).
3. In the tile chain, before `asset.type === 'splat' ? (`, add:

```tsx
                                    ) : asset.type === 'book' ? (
                                        <BookPreviewTile filename={asset.filename} thumbnailPath={asset.thumbnailPath} pageCount={asset.metadata?.pageCount} compact />
```

`src/components/AssetLibrary.tsx`: same `BookPreviewTile` branch before the `asset.type === 'splat'` tile (line ~964, non-compact), the same `book: bookDragInfo(asset)` in its drag start if it calls `setDragging` (search `setDragging(true` in the file), and extend its asset type (line ~83) with the same optional fields.

- [ ] **Step 7: Lint, types, tests**

Run: `npm run lint && npx tsc -b --noEmit && npm run test`
Expected: no errors; all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/uploadFiles.ts src/lib/uploadFiles.test.ts src/hooks/use-video-processing.ts src/components/book/BookPreviewTile.tsx src/lib/book/api.ts src/components/AssetSidebar.tsx src/components/AssetLibrary.tsx
git commit -m "feat(books): upload PDFs and show them in the asset browser"
```

---

### Task 9: „Buch-Einstellungen" dialog

**Files:**
- Create: `src/components/book/BookSettingsDialog.tsx`
- Modify: `src/lib/book/api.ts`, `src/components/AssetLibrary.tsx` (open the dialog for books), `src/components/AssetSidebar.tsx` (context action)
- Test: `src/lib/book/api.test.ts`

**Interfaces:**
- Consumes: Task 4 endpoints; Task 6 `autoThicknessCm`.
- Produces:
  - `bookPdfUrl(assetId: number): string` → `/api/books/${assetId}/pdf`
  - `parseThickness(raw: string): number | null | 'invalid'` (German decimal comma allowed; '' → null = automatic)
  - `saveBookSettings(artworkId: number, patch: { title?: string; artist?: string; year?: string; depth?: number | null; publicReadable?: boolean }, token: string): Promise<void>`
  - `uploadBookCover(assetId: number, file: File, token: string): Promise<void>`, `resetBookCover(assetId: number, token: string): Promise<void>` — all throw `Error` with a German message on failure.
  - `<BookSettingsDialog asset={BookSettingsAsset} open onOpenChange onSaved />` where `interface BookSettingsAsset { id: number; filename: string; thumbnailPath?: string | null; metadata?: { pageCount?: number; pageWidthMm?: number; pageHeightMm?: number; coverSource?: 'pdf' | 'override' } | null; artwork?: { id: number; title?: string; artist?: string | null; year?: string | null; depth?: number | null; publicReadable?: boolean } | null }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/book/api.test.ts
import { describe, expect, it } from 'vitest';
import { bookDragInfo, bookPdfUrl, parseThickness } from './api';

describe('book api helpers', () => {
  it('builds the PDF route', () => {
    expect(bookPdfUrl(42)).toBe('/api/books/42/pdf');
  });
  it('parses the thickness field (cm, comma or dot, empty = automatic)', () => {
    expect(parseThickness('1,4')).toBe(1.4);
    expect(parseThickness('2.5')).toBe(2.5);
    expect(parseThickness('')).toBeNull();
    expect(parseThickness('0.1')).toBe('invalid');
    expect(parseThickness('abc')).toBe('invalid');
  });
  it('builds drag info only for books', () => {
    expect(bookDragInfo({ id: 1, type: 'image' })).toBeUndefined();
    expect(bookDragInfo({ id: 2, type: 'book', metadata: { pageCount: 12 }, artwork: { title: 'K', depth: 2 } }))
      .toMatchObject({ assetId: 2, pageCount: 12, depth: 2, publicReadable: false, title: 'K' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/book/api.test.ts`
Expected: FAIL — `bookPdfUrl`/`parseThickness` missing.

- [ ] **Step 3: API helpers**

Append to `src/lib/book/api.ts`:

```ts
export const bookPdfUrl = (assetId: number) => `/api/books/${assetId}/pdf`;

/** Thickness field in cm: '' = automatic (null), otherwise 0.3–8. */
export function parseThickness(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) && value >= 0.3 && value <= 8 ? Math.round(value * 10) / 10 : 'invalid';
}

async function expectOk(res: Response, message: string) {
  if (!res.ok) throw new Error(message);
}

export async function saveBookSettings(
  artworkId: number,
  patch: { title?: string; artist?: string; year?: string; depth?: number | null; publicReadable?: boolean },
  token: string,
): Promise<void> {
  const res = await fetch(`/api/artworks/${artworkId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  await expectOk(res, 'Einstellungen konnten nicht gespeichert werden');
}

export async function uploadBookCover(assetId: number, file: File, token: string): Promise<void> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/api/assets/${assetId}/cover`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  await expectOk(res, 'Cover konnte nicht hochgeladen werden');
}

export async function resetBookCover(assetId: number, token: string): Promise<void> {
  const res = await fetch(`/api/assets/${assetId}/cover`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  await expectOk(res, 'Cover konnte nicht zurückgesetzt werden');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/book/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Dialog**

```tsx
// src/components/book/BookSettingsDialog.tsx
import { useRef, useState } from 'react';
import { gooeyToast } from 'goey-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/authStore';
import { useEditorStore } from '@/store/editorStore';
import { autoThicknessCm } from '@/lib/book/geometry';
import { parseThickness, resetBookCover, saveBookSettings, uploadBookCover } from '@/lib/book/api';

export interface BookSettingsAsset {
  id: number;
  filename: string;
  thumbnailPath?: string | null;
  metadata?: { pageCount?: number; pageWidthMm?: number; pageHeightMm?: number; coverSource?: 'pdf' | 'override' } | null;
  artwork?: { id: number; title?: string; artist?: string | null; year?: string | null; depth?: number | null; publicReadable?: boolean } | null;
}

interface BookSettingsDialogProps {
  asset: BookSettingsAsset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reload the asset list after a change. */
  onSaved: () => void;
}

const fmt = (v: number) => v.toFixed(1).replace('.', ',');

export function BookSettingsDialog({ asset, open, onOpenChange, onSaved }: BookSettingsDialogProps) {
  const token = useAuthStore((s) => s.token);
  const artwork = asset.artwork;
  const pageCount = asset.metadata?.pageCount ?? 0;
  const auto = autoThicknessCm(pageCount);
  const [title, setTitle] = useState(artwork?.title ?? asset.filename);
  const [artist, setArtist] = useState(artwork?.artist ?? '');
  const [year, setYear] = useState(artwork?.year ?? '');
  const [depth, setDepth] = useState(artwork?.depth != null ? fmt(artwork.depth) : '');
  const [publicReadable, setPublicReadable] = useState(artwork?.publicReadable ?? false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const thickness = parseThickness(depth);
  const sliderValue = typeof thickness === 'number' ? thickness : auto;

  const afterChange = () => {
    onSaved();
    // Placed copies of this book pick up the new cover / thickness / label.
    useEditorStore.getState().triggerInstancesRefresh();
  };

  const save = async () => {
    if (!token || !artwork) return;
    if (thickness === 'invalid') {
      gooeyToast.error('Ungültige Dicke', { description: 'Bitte einen Wert zwischen 0,3 und 8 cm eingeben.' });
      return;
    }
    setBusy(true);
    try {
      await saveBookSettings(artwork.id, { title: title.trim() || asset.filename, artist, year, depth: thickness, publicReadable }, token);
      afterChange();
      gooeyToast.success('Gespeichert', { description: 'Buch-Einstellungen aktualisiert.' });
      onOpenChange(false);
    } catch (err) {
      gooeyToast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const coverAction = async (action: () => Promise<void>, done: string) => {
    if (!token) return;
    setBusy(true);
    try {
      await action();
      afterChange();
      gooeyToast.success(done);
    } catch (err) {
      gooeyToast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const { pageWidthMm, pageHeightMm, coverSource } = asset.metadata ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Buch-Einstellungen</DialogTitle>
          <DialogDescription>
            {pageCount} Seiten{pageWidthMm && pageHeightMm ? ` · ${Math.round(pageWidthMm)} × ${Math.round(pageHeightMm)} mm` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[96px_1fr] gap-4">
          <div className="space-y-2">
            {asset.thumbnailPath && <img src={asset.thumbnailPath} alt="Cover" className="w-full rounded border border-zinc-700" />}
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void coverAction(() => uploadBookCover(asset.id, file, token!), 'Cover ersetzt');
              }} />
            <Button variant="secondary" size="sm" className="w-full text-xs" disabled={busy} onClick={() => fileInput.current?.click()}>
              Ersatz-Cover hochladen
            </Button>
            {coverSource === 'override' && (
              <Button variant="ghost" size="sm" className="w-full text-xs" disabled={busy}
                onClick={() => void coverAction(() => resetBookCover(asset.id, token!), 'Cover aus PDF wiederhergestellt')}>
                Cover aus PDF verwenden
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="book-title">Titel</Label>
              <Input id="book-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-[1fr_88px] gap-2">
              <div className="space-y-1">
                <Label htmlFor="book-artist">Künstler:in</Label>
                <Input id="book-artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="book-year">Jahr</Label>
                <Input id="book-year" value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="book-depth">Dicke anpassen (cm)</Label>
              <input id="book-depth-range" type="range" min={0.3} max={8} step={0.1} value={sliderValue}
                onChange={(e) => setDepth(fmt(Number(e.target.value)))} className="w-full accent-blue-500" aria-label="Dicke anpassen" />
              <div className="flex items-center gap-2">
                <Input id="book-depth" value={depth} placeholder={fmt(auto)} onChange={(e) => setDepth(e.target.value)} className="h-8 w-24" />
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setDepth('')} disabled={depth === ''}>
                  Automatisch ({fmt(auto)} cm)
                </Button>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={publicReadable} onChange={(e) => setPublicReadable(e.target.checked)} className="mt-1" />
              <span>
                Im öffentlichen Viewer lesbar
                <span className="block text-xs text-zinc-500">Wer das Buch öffnen kann, kann das PDF auch herunterladen.</span>
              </span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</Button>
          <Button onClick={() => void save()} disabled={busy || !artwork}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Open it**

`src/components/AssetLibrary.tsx`: where a click/edit on an asset opens `MetadataDialog` (`setSelectedAsset(asset)`), route books to the new dialog instead:

```tsx
const [bookSettingsAsset, setBookSettingsAsset] = useState<BookSettingsAsset | null>(null);
// in the handler that calls setSelectedAsset(asset):
if (asset.type === 'book') { setBookSettingsAsset(asset as BookSettingsAsset); return; }
```

and render next to the `MetadataDialog` block:

```tsx
{bookSettingsAsset && (
  <BookSettingsDialog
    asset={bookSettingsAsset}
    open
    onOpenChange={(o) => { if (!o) setBookSettingsAsset(null); }}
    onSaved={() => fetchAssets(selectedFolder)}
  />
)}
```

`src/components/AssetSidebar.tsx`: on a book tile, a double-click opens the same dialog (`onDoubleClick={() => asset.type === 'book' && asset.status === 'ready' && setBookSettingsAsset(asset)}` on the tile `div`), with the same state + render block and `onSaved={refreshAssetsSilently}`. The `title` attribute of book tiles becomes „Doppelklick: Buch-Einstellungen".

- [ ] **Step 7: Lint, types, tests**

Run: `npm run lint && npx tsc -b --noEmit && npm run test`
Expected: clean; PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/book/api.ts src/lib/book/api.test.ts src/components/book/BookSettingsDialog.tsx src/components/AssetLibrary.tsx src/components/AssetSidebar.tsx
git commit -m "feat(books): Buch-Einstellungen dialog (cover, thickness, metadata, public switch)"
```

---

### Task 10: 3D book on its pedestal

**Files:**
- Create: `src/lib/boxHitProxy.ts`, `src/lib/book/labelPlate.ts`, `src/components/book/BookInstance.tsx`, `src/components/book/BookMesh.tsx`, `src/components/book/LabelPlate.tsx`
- Modify: `src/lib/splats.ts:80-106`, `src/components/SplatInstance.tsx`, `src/components/SelectionOutline.tsx:7,63`, `src/components/PlacedArtworks.tsx:48-52`, `src/components/physics/PhysicsWorld.tsx`
- Test: `src/lib/boxHitProxy.test.ts`, `src/lib/book/labelPlate.test.ts`

**Interfaces:**
- Consumes: Task 6 `bookSizeOf`, `pedestalSize`, `bookHitBox`, `PEDESTAL_HEIGHT`; `useArtworkTexture(id, source, objectRef)`; `displayArtworkTitle`.
- Produces:
  - `class BoxHitProxy extends THREE.Object3D { readonly box: THREE.Box3 }` (was `SplatHitProxy`; same behaviour).
  - `labelPlateLines(input: { title?: string | null; artist?: string | null; year?: string | null }): { title: string; byline: string }`
  - `drawLabelPlate(canvas: HTMLCanvasElement, lines: { title: string; byline: string }): void`
  - `<BookInstance ref instance selected isEditor />` (forwardRef to the instance group; `userData.bookHitProxy = true` on its proxy).
  - `LABEL_PLATE_SIZE = { width: 0.24, height: 0.08 }` (m).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/boxHitProxy.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BoxHitProxy } from './boxHitProxy';

const cast = (proxy: THREE.Object3D, origin: [number, number, number], dir: [number, number, number]) => {
  const raycaster = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...dir).normalize());
  return raycaster.intersectObject(proxy, false);
};

describe('BoxHitProxy', () => {
  it('answers rays with its box, in world space', () => {
    const proxy = new BoxHitProxy();
    proxy.box.set(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0.05, 0.1));
    proxy.position.set(0, 1.2, 0);
    proxy.updateMatrixWorld();
    const hits = cast(proxy, [0, 1.62, 1], [0, -0.42, -1]);
    expect(hits).toHaveLength(1);
    expect(hits[0].point.y).toBeCloseTo(1.25, 2);
  });
  it('ignores rays that start inside the box and empty boxes', () => {
    const proxy = new BoxHitProxy();
    expect(cast(proxy, [0, 0, 5], [0, 0, -1])).toHaveLength(0);
    proxy.box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    proxy.updateMatrixWorld();
    expect(cast(proxy, [0, 0, 0], [0, 0, -1])).toHaveLength(0);
  });
});
```

```ts
// src/lib/book/labelPlate.test.ts
import { describe, expect, it } from 'vitest';
import { labelPlateLines } from './labelPlate';

describe('labelPlateLines', () => {
  it('shows the title and „artist, year"', () => {
    expect(labelPlateLines({ title: 'Katalog.pdf', artist: 'Ada Muster', year: '2024' })).toEqual({ title: 'Katalog', byline: 'Ada Muster, 2024' });
  });
  it('drops the server placeholder artist and empty parts', () => {
    expect(labelPlateLines({ title: 'K', artist: 'Unknown', year: '' })).toEqual({ title: 'K', byline: '' });
    expect(labelPlateLines({ title: '', artist: null, year: '1999' })).toEqual({ title: 'Ohne Titel', byline: '1999' });
  });
  it('shortens long lines with an ellipsis', () => {
    const { title } = labelPlateLines({ title: 'x'.repeat(80) });
    expect(title).toHaveLength(42);
    expect(title.endsWith('…')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/boxHitProxy.test.ts src/lib/book/labelPlate.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Move the hit proxy**

Create `src/lib/boxHitProxy.ts` with the class body cut from `src/lib/splats.ts:80-106`, renamed:

```ts
import * as THREE from 'three';

const _inverse = new THREE.Matrix4();
const _ray = new THREE.Ray();
const _point = new THREE.Vector3();

/**
 * Invisible Object3D that answers raycasts with a box (in its local space). Splats and books use
 * it: clicks and the first-person raycast test this box instead of the real geometry (millions of
 * splats; a book only a few millimetres thick). Rays starting inside the box don't hit — a
 * room-sized capture would otherwise swallow every click made from within it.
 */
export class BoxHitProxy extends THREE.Object3D {
    readonly box = new THREE.Box3();

    constructor() {
        super();
        this.name = 'BoxHitProxy';
    }

    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
        if (this.box.isEmpty()) return;
        _inverse.copy(this.matrixWorld).invert();
        _ray.copy(raycaster.ray).applyMatrix4(_inverse);
        if (this.box.containsPoint(_ray.origin)) return;
        if (!_ray.intersectBox(this.box, _point)) return;
        _point.applyMatrix4(this.matrixWorld);
        const distance = raycaster.ray.origin.distanceTo(_point);
        if (distance < raycaster.near || distance > raycaster.far) return;
        intersects.push({ distance, point: _point.clone(), object: this });
    }
}
```

In `src/lib/splats.ts` delete the class and its now-unused `_inverse/_ray/_point` temporaries (only if nothing else in the file uses them — check with a search), and replace every `SplatHitProxy` in `SplatInstance.tsx` and `SelectionOutline.tsx` with `BoxHitProxy` imported from `@/lib/boxHitProxy` (`../lib/boxHitProxy` in `SplatInstance.tsx`).

- [ ] **Step 4: Label plate text**

```ts
// src/lib/book/labelPlate.ts
import { displayArtworkTitle } from '@/lib/artworkTitle';

/** Werkschild on the pedestal: title on top, „artist, year" below. */

const MAX = 42;
const clip = (s: string) => (s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s);
// Artworks created on placement get the artist 'Unknown' (server/src/routes/instances.ts).
const PLACEHOLDER_ARTISTS = new Set(['unknown', '']);

export function labelPlateLines(input: { title?: string | null; artist?: string | null; year?: string | null }) {
  const title = clip(displayArtworkTitle(input.title ?? '').trim() || 'Ohne Titel');
  const artist = input.artist?.trim() ?? '';
  const parts = [PLACEHOLDER_ARTISTS.has(artist.toLowerCase()) ? '' : artist, input.year?.trim() ?? ''].filter(Boolean);
  return { title, byline: clip(parts.join(', ')) };
}

export const LABEL_PLATE_SIZE = { width: 0.24, height: 0.08 };
const PX_PER_M = 2000;

export function drawLabelPlate(canvas: HTMLCanvasElement, lines: { title: string; byline: string }): void {
  canvas.width = LABEL_PLATE_SIZE.width * PX_PER_M;
  canvas.height = LABEL_PLATE_SIZE.height * PX_PER_M;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#f4f4f2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1c1c1c';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 34px "Albert Sans", system-ui, sans-serif';
  ctx.fillText(lines.title, 24, 62, canvas.width - 48);
  if (lines.byline) {
    ctx.font = '400 26px "Albert Sans", system-ui, sans-serif';
    ctx.fillStyle = '#4a4a4a';
    ctx.fillText(lines.byline, 24, 110, canvas.width - 48);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/boxHitProxy.test.ts src/lib/book/labelPlate.test.ts`
Expected: PASS.

- [ ] **Step 6: Components**

```tsx
// src/components/book/LabelPlate.tsx
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { drawLabelPlate, labelPlateLines, LABEL_PLATE_SIZE } from '@/lib/book/labelPlate';
import type { PedestalSize } from '@/lib/book/geometry';

interface LabelPlateProps {
  title?: string | null;
  artist?: string | null;
  year?: string | null;
  pedestal: PedestalSize;
}

const TILT = -(15 * Math.PI) / 180;
const noRaycast = () => {};

/** Werkschild: a thin plate on the pedestal's front (+Z), near the top, tilted back 15°. */
export function LabelPlate({ title, artist, year, pedestal }: LabelPlateProps) {
  const { title: line1, byline } = labelPlateLines({ title, artist, year });
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    drawLabelPlate(canvas, { title: line1, byline });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [line1, byline]);
  useEffect(() => () => texture.dispose(), [texture]);

  // Redraw once the web font is available (first paint may use the fallback font).
  useEffect(() => {
    let cancelled = false;
    document.fonts?.load('600 34px "Albert Sans"').then(() => {
      if (cancelled) return;
      drawLabelPlate(texture.image as HTMLCanvasElement, { title: line1, byline });
      texture.needsUpdate = true;
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [texture, line1, byline]);

  return (
    <mesh
      position={[0, pedestal.height - 0.09, pedestal.depth / 2 + 0.006]}
      rotation={[TILT, 0, 0]}
      raycast={noRaycast}
    >
      <boxGeometry args={[LABEL_PLATE_SIZE.width, LABEL_PLATE_SIZE.height, 0.004]} />
      <meshStandardMaterial attach="material-0" color="#e8e8e6" />
      <meshStandardMaterial attach="material-1" color="#e8e8e6" />
      <meshStandardMaterial attach="material-2" color="#e8e8e6" />
      <meshStandardMaterial attach="material-3" color="#e8e8e6" />
      <meshStandardMaterial attach="material-4" map={texture} roughness={0.8} />
      <meshStandardMaterial attach="material-5" color="#e8e8e6" />
    </mesh>
  );
}
```

```tsx
// src/components/book/BookMesh.tsx
import { useRef } from 'react';
import * as THREE from 'three';
import { useArtworkTexture } from '@/hooks/use-artwork-texture';
import type { BookSize } from '@/lib/book/geometry';

interface BookMeshProps {
  instanceId: number;
  size: BookSize;
  coverPath: string;
  thumbnailPath: string | null;
  pixelWidth: number;
  pixelHeight: number;
  selected: boolean;
}

const PAPER = '#efe9dc';
const BOARD = '#3a3a3a';
const noRaycast = () => {};

/**
 * Closed book lying flat: box with the cover on top (+Y). BoxGeometry face order is
 * +X, −X, +Y, −Y, +Z, −Z → page edges, spine (−X), cover, back board, page edges, page edges.
 * The cover's top edge points to −Z, so someone in front of the pedestal (+Z) reads it upright.
 */
export function BookMesh({ instanceId, size, coverPath, thumbnailPath, pixelWidth, pixelHeight, selected }: BookMeshProps) {
  const objectRef = useRef<THREE.Mesh>(null);
  const coverRef = useArtworkTexture(
    instanceId,
    { path: coverPath, thumbnailPath, pixelWidth: pixelWidth || 1, pixelHeight: pixelHeight || 1, sizeM: Math.max(size.width, size.length), forceMax: selected },
    objectRef,
  );
  return (
    <mesh ref={objectRef} position={[0, size.thickness / 2, 0]} scale={[size.width, size.thickness, size.length]} raycast={noRaycast}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial attach="material-0" color={PAPER} roughness={0.9} />
      <meshStandardMaterial attach="material-1" color={BOARD} roughness={0.7} />
      <meshStandardMaterial attach="material-2" ref={coverRef} color="#9a9a9a" roughness={0.6} />
      <meshStandardMaterial attach="material-3" color={BOARD} roughness={0.7} />
      <meshStandardMaterial attach="material-4" color={PAPER} roughness={0.9} />
      <meshStandardMaterial attach="material-5" color={PAPER} roughness={0.9} />
    </mesh>
  );
}
```

The cover material starts grey (`#9a9a9a`) and turns white once the texture manager binds a map: in the manager's `bindMaterial` path the colour must be white for the texture to show unmodified. Check `artworkTextureManager.bindMaterial` — if it does not set `material.color` to white, set `color="#ffffff"` here instead and accept a white (not grey) placeholder until the map arrives.

The +Y face's UVs in three's `BoxGeometry` run with V along −Z → +Z; verify the orientation with the headless render in Task 14 (cover title must read upright from +Z). If it is mirrored or upside down, set `texture.rotation = Math.PI` / `repeat.x = -1` on the bound map via a small `onBeforeRender`-free fix: flip the cover UVs once on a dedicated geometry (`useMemo(() => { const g = new THREE.BoxGeometry(1,1,1); /* rotate the 4 UVs of face +Y (indices 8–11) */ return g; }, [])`).

```tsx
// src/components/book/BookInstance.tsx
import { forwardRef, useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, type ArtworkInstanceData } from '@/store/editorStore';
import { useBookViewerStore } from '@/store/bookViewerStore';
import { BoxHitProxy } from '@/lib/boxHitProxy';
import { bookHitBox, bookSizeOf, pedestalSize, PEDESTAL_HEIGHT } from '@/lib/book/geometry';
import { consumeMarqueeClick } from '@/lib/selectionBridge';
import { BookMesh } from './BookMesh';
import { LabelPlate } from './LabelPlate';

interface BookInstanceProps {
  instance: ArtworkInstanceData;
  selected: boolean;
  isEditor?: boolean;
}

const PEDESTAL_COLOR = '#f2f2f0';

/** One instance = pedestal + book + label plate; only this outer group is ever transformed. */
export const BookInstance = forwardRef<THREE.Group, BookInstanceProps>(({ instance, selected, isEditor = true }, ref) => {
  const pickInstance = useEditorStore((s) => s.pickInstance);
  const setHoveredBook = useBookViewerStore((s) => s.setHoveredBook);
  const size = bookSizeOf(instance);
  const pedestal = pedestalSize(size);
  const hitProxy = useMemo(() => {
    const proxy = new BoxHitProxy();
    proxy.userData.bookHitProxy = true;
    return proxy;
  }, []);
  useEffect(() => {
    const hit = bookHitBox({ width: size.width, length: size.length, thickness: size.thickness });
    hitProxy.box.min.set(...hit.min);
    hitProxy.box.max.set(...hit.max);
  }, [hitProxy, size.width, size.length, size.thickness]);

  const asset = instance.artwork.asset;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isEditor) return;
    e.stopPropagation();
    if (consumeMarqueeClick()) return;
    pickInstance(instance.id, e.nativeEvent.shiftKey);
  };

  return (
    <group
      ref={ref}
      position={[instance.position_x, instance.position_y, instance.position_z]}
      rotation={[0, instance.rotation_y, 0]}
      onClick={handleClick}
    >
      <mesh position={[0, pedestal.height / 2, 0]}>
        <boxGeometry args={[pedestal.width, pedestal.height, pedestal.depth]} />
        <meshStandardMaterial color={PEDESTAL_COLOR} roughness={0.85} />
      </mesh>
      <LabelPlate title={instance.artwork.title} artist={instance.artwork.artist} year={instance.artwork.year} pedestal={pedestal} />
      <group position={[0, PEDESTAL_HEIGHT, 0]}>
        <BookMesh
          instanceId={instance.id}
          size={size}
          coverPath={asset.path}
          thumbnailPath={asset.thumbnailPath ?? null}
          pixelWidth={asset.width}
          pixelHeight={asset.height}
          selected={selected}
        />
        <primitive
          object={hitProxy}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHoveredBook(instance.id); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setHoveredBook(null); document.body.style.cursor = ''; }}
        />
      </group>
    </group>
  );
});
BookInstance.displayName = 'BookInstance';
```

Also clear hover on unmount: add `useEffect(() => () => { if (useBookViewerStore.getState().hoveredBookId === instance.id) { useBookViewerStore.getState().setHoveredBook(null); document.body.style.cursor = ''; } }, [instance.id]);`.

- [ ] **Step 7: Dispatch and collider**

`src/components/PlacedArtworks.tsx`: import `BookInstance` from `./book/BookInstance` and add `assetType === 'book' ? BookInstance :` before the `'splat'` line.

`src/components/physics/PhysicsWorld.tsx`: import `bookSizeOf`, `pedestalSize` from `@/lib/book/geometry` (relative `../../lib/book/geometry`), then

```tsx
const bookInstances = useMemo(
    () => instances.filter((i) => i.artwork?.asset?.type === 'book'),
    [instances],
);
```

and render after the model colliders:

```tsx
{bookInstances.map((instance) => {
    const pedestal = pedestalSize(bookSizeOf(instance));
    return (
        <RigidBody key={`book-${instance.id}`} type="fixed" colliders={false}
            position={[instance.position_x, instance.position_y, instance.position_z]}
            rotation={[0, instance.rotation_y, 0]}>
            <CuboidCollider args={[pedestal.width / 2, pedestal.height / 2, pedestal.depth / 2]} position={[0, pedestal.height / 2, 0]} />
        </RigidBody>
    );
})}
```

- [ ] **Step 8: Lint, types, tests, build**

Run: `npm run lint && npm run test && npm run build`
Expected: clean; PASS; build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/lib/boxHitProxy.ts src/lib/boxHitProxy.test.ts src/lib/splats.ts src/lib/book/labelPlate.ts src/lib/book/labelPlate.test.ts src/components/book/BookInstance.tsx src/components/book/BookMesh.tsx src/components/book/LabelPlate.tsx src/components/SplatInstance.tsx src/components/SelectionOutline.tsx src/components/PlacedArtworks.tsx src/components/physics/PhysicsWorld.tsx
git commit -m "feat(books): render books on pedestals with label plate and hit box"
```

---

### Task 11: Editor integration (placement, gizmo, panel, selection, hover)

**Files:**
- Create: `src/components/book/BookGhost.tsx`, `src/components/book/BookPropertiesActions.tsx`
- Modify: `src/components/ArtworkPlacement.tsx:309-313`, `src/pages/EditorPage.tsx` (drop medium/label/issue text, placed artwork fields, `S` key, toolbar scale button, double-click), `src/components/InstanceTransformControls.tsx`, `src/lib/selectionOperations.ts:59-70,113-125`, `src/components/PropertiesPanel.tsx`, `src/components/SelectionOutline.tsx`
- Test: `src/lib/selectionOperations.test.ts` (extend)

**Interfaces:**
- Consumes: Task 6 `isFixedSizeMedium`, `BookDragInfo`, geometry; Task 7 `openBook`, `useBookViewerStore`; Task 9 `BookSettingsDialog`.
- Produces: `openBookForInstance(inst: ArtworkInstanceData, publicView: boolean): void` in `src/lib/book/viewerActions.ts` (builds `OpenBook` from the instance and calls `openBook`).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/selectionOperations.test.ts`:

```ts
describe('books in a selection', () => {
  const book = (id: number) => pic(id, 3, 0, 21, 30, { medium: 'book', artwork: { width: 21, height: 30, asset: { path: '', width: 1, height: 1, dpi: 72, type: 'book' } } });

  it('are never scaled', () => {
    const out = scaleSelection([pic(1, 0, 1.5), book(2)], [1, 2], 1.25);
    expect(byId(out, 2).scale_x).toBe(1);
    expect(byId(out, 1).scale_x).toBeCloseTo(1.25);
  });
  it('stay on the floor when heights are aligned', () => {
    const out = alignHeight([pic(1, 0, 1.5), book(2)], [1, 2], [], 'center', 1.6);
    expect(byId(out, 2).position_y).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/selectionOperations.test.ts`
Expected: FAIL — the book gets scaled and lifted.

- [ ] **Step 3: Selection operations**

In `src/lib/selectionOperations.ts` import `isFixedSizeMedium` from the store; in `scaleSelection` replace `if (inst.medium === 'monitor') continue;` with `if (isFixedSizeMedium(inst.medium)) continue;`; in `alignHeight` add `if (inst.medium === 'book') continue;` as the first line of the loop. Update the doc comment of `scaleSelection` to „monitors and books keep their size".

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/selectionOperations.test.ts`
Expected: PASS.

- [ ] **Step 5: Fixed size everywhere**

Replace `i.medium === 'monitor'` with `isFixedSizeMedium(i.medium)` in:
- `src/components/InstanceTransformControls.tsx` (`monitorInSelection` → rename to `fixedSizeInSelection`), and apply the fallback to single selections too:

```ts
    // Monitors and books keep their size — scale mode moves them instead.
    const effectiveMode = fixedSizeInSelection && transformMode === 'scale' ? 'translate' : transformMode;
    const groupMode = isGroup ? effectiveMode : transformMode;
```

 and pass `mode={effectiveMode}` to `TransformControls`. For a single selected book also hide the non-floor handles:

```ts
    const bookSelected = useEditorStore((state) =>
        state.selectedInstanceIds.length === 1 && state.localInstances.some(i => i.id === state.selectedInstanceId && i.medium === 'book'));
    // Books: move on the floor (X/Z), turn about Y only.
    const showX = (transformAxisLock === 'none' || transformAxisLock === 'x') && !(bookSelected && effectiveMode === 'rotate');
    const showY = (transformAxisLock === 'none' || transformAxisLock === 'y') && !(bookSelected && effectiveMode === 'translate');
    const showZ = !wallPlaneMove && (transformAxisLock === 'none' || transformAxisLock === 'z') && !(bookSelected && effectiveMode === 'rotate');
```

- `src/pages/EditorPage.tsx:204` (`isMonitorSelected` → `isFixedSizeSelected`) and `:578` (`case 's'`).

- [ ] **Step 6: Placement**

`src/components/book/BookGhost.tsx`:

```tsx
import { useMemo } from 'react';
import type * as THREE from 'three';
import { bookSize, pedestalSize, PEDESTAL_HEIGHT } from '@/lib/book/geometry';
import type { BookDragInfo } from '@/store/editorStore';

interface BookGhostProps {
  position: THREE.Vector3;
  valid: boolean;
  widthCm?: number;
  heightCm?: number;
  book?: BookDragInfo;
}

const noRaycast = () => {};

/** Drop preview: translucent pedestal + book, green/red like ModelGhostPreview. */
export function BookGhost({ position, valid, widthCm, heightCm, book }: BookGhostProps) {
  const size = useMemo(() => bookSize({ widthCm, heightCm, depthCm: book?.depth, pageCount: book?.pageCount }), [widthCm, heightCm, book?.depth, book?.pageCount]);
  const pedestal = pedestalSize(size);
  const color = valid ? '#22c55e' : '#ef4444';
  return (
    <group position={position}>
      <mesh position={[0, pedestal.height / 2, 0]} raycast={noRaycast}>
        <boxGeometry args={[pedestal.width, pedestal.height, pedestal.depth]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <mesh position={[0, PEDESTAL_HEIGHT + size.thickness / 2, 0]} raycast={noRaycast}>
        <boxGeometry args={[size.width, size.thickness, size.length]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}
```

`src/components/ArtworkPlacement.tsx` (floor branch, line ~312) — floor drops are placed without rotation (`rotation: [0, 0, 0]`), so the ghost needs none:

```tsx
    // 3D model ghost
    if (isFloorAssetType(draggedAsset.assetType)) {
        if (draggedAsset.assetType === 'book') {
            return <BookGhost position={ghostState.position} valid={ghostState.isValid}
                widthCm={draggedAsset.artworkWidth} heightCm={draggedAsset.artworkHeight} book={draggedAsset.book} />;
        }
        return <ModelGhostPreview position={ghostState.position} isValid={ghostState.isValid} />;
    }
```

`src/pages/EditorPage.tsx`:
- `placementIssueText`: add `if (assetType === 'book') return 'Bücher lassen sich nur auf dem Boden platzieren.';`.
- Drop handler: `const medium: MediumType = assetType === 'model3d' || assetType === 'splat' || assetType === 'book' ? assetType : 'frame';` and label `assetType === 'book' ? 'Buch' : …`.
- `placeInstance`: extend the new instance's `artwork` with the book fields so it renders correctly before the server round trip:

```ts
        ...(draggedAsset.book ? {
          title: draggedAsset.book.title,
          artist: draggedAsset.book.artist,
          year: draggedAsset.book.year,
          depth: draggedAsset.book.depth,
          publicReadable: draggedAsset.book.publicReadable,
        } : {}),
```

 and in its `asset`: `id: draggedAsset.book?.assetId, thumbnailPath: draggedAsset.book?.thumbnailPath ?? undefined, metadata: draggedAsset.book ? { pageCount: draggedAsset.book.pageCount } : undefined,`. Also set `rotation_x: 0, rotation_z: 0` for books (floor placement already yields upright rotation; keep the snapshot values otherwise).

- [ ] **Step 7: Open from the editor**

Add to `src/lib/book/viewerActions.ts`:

```ts
import type { ArtworkInstanceData } from '@/store/editorStore';
import { displayArtworkTitle } from '@/lib/artworkTitle';

export function openBookForInstance(inst: ArtworkInstanceData, publicView: boolean): void {
  const assetId = inst.artwork.asset.id ?? inst.assetId;
  if (!assetId) return;
  openBook({
    assetId,
    title: displayArtworkTitle(inst.artwork.title ?? '') || 'Buch',
    pageCount: inst.artwork.asset.metadata?.pageCount ?? 0,
    publicView,
  });
}
```

`src/pages/EditorPage.tsx` `handleCanvasDoubleClick`: right after `const inst = store.localInstances.find(i => i.id === instanceId);` add

```ts
    if (inst?.artwork.asset.type === 'book') {
      openBookForInstance(inst, false);
      return;
    }
```

`src/components/book/BookPropertiesActions.tsx`:

```tsx
import { useState } from 'react';
import { BookOpen, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editorStore';
import { openBookForInstance } from '@/lib/book/viewerActions';
import { BookSettingsDialog } from './BookSettingsDialog';

/** Properties panel of a selected book: open it, edit its settings. */
export function BookPropertiesActions({ instanceId }: { instanceId: number }) {
  const inst = useEditorStore((s) => s.localInstances.find((i) => i.id === instanceId));
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!inst) return null;
  const asset = inst.artwork.asset;
  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" className="w-full text-xs bg-zinc-800 text-zinc-100" onClick={() => openBookForInstance(inst, false)}>
        <BookOpen className="mr-2 h-4 w-4" /> Buch öffnen
      </Button>
      <Button variant="secondary" size="sm" className="w-full text-xs bg-zinc-800 text-zinc-100" disabled={!asset.id || !inst.artwork.id} onClick={() => setSettingsOpen(true)}>
        <Settings2 className="mr-2 h-4 w-4" /> Buch-Einstellungen
      </Button>
      {settingsOpen && asset.id && inst.artwork.id && (
        <BookSettingsDialog
          open
          onOpenChange={setSettingsOpen}
          onSaved={() => undefined}
          asset={{
            id: asset.id,
            filename: inst.artwork.title ?? '',
            thumbnailPath: asset.thumbnailPath,
            metadata: asset.metadata,
            artwork: { id: inst.artwork.id, title: inst.artwork.title, artist: inst.artwork.artist, year: inst.artwork.year, depth: inst.artwork.depth, publicReadable: inst.artwork.publicReadable },
          }}
        />
      )}
    </div>
  );
}
```

`src/components/PropertiesPanel.tsx` (`ArtworkPropertiesContent`): `const isBook = assetType === 'book';`; wrap the whole „Größe" block (`<div className="space-y-2">` starting with `{isModel ? 'Größe (m)' : 'Size (cm)'}`) in `{!isBook && (…)}`; treat the scale mode button as disabled when `isBook` (`const isScaleDisabled = mode === 'scale' && (sizeLocked || isBook);`); render `{isBook && selectedInstanceId !== null && <BookPropertiesActions instanceId={selectedInstanceId} />}` right before `<OpenArtworkWallButton …/>`, and skip `OpenArtworkWallButton` for books.

- [ ] **Step 8: Hover outline**

In `src/components/SelectionOutline.tsx`:
1. A second module-level path: `let hoverPathElement: SVGPathElement | null = null; const setHoverPath = (d: string) => { if (hoverPathElement && hoverPathElement.getAttribute('d') !== d) hoverPathElement.setAttribute('d', d); };`
2. In `SelectionOutlineSvg`, before the selection `<path>`: `<path ref={(el) => { hoverPathElement = el; }} fill="none" stroke={WE_COLORS.select} strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />`.
3. Extract the per-frame projection loop body into `function projectShape(shape: OutlineShape, group: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number }): string` (returns the `M…L…` segment or `''` when a corner is behind the camera) and use it for the selection path.
4. In `SelectionOutlineTracker`: `const hoveredBookId = useBookViewerStore((s) => s.hoveredBookId);`, keep a `hoverShape` ref `{ id: number; shape: OutlineShape | null } | null` reset when `hoveredBookId` changes, and in `useFrame` compute `setHoverPath(hovered && !selectedIds.includes(hovered) ? projectShape(...) : '')` using `outlineShape(instance, group)` of the hovered instance (look it up in `useEditorStore.getState().localInstances`). Clear with `setHoverPath('')` when `!active`.

- [ ] **Step 9: Lint, types, tests, build**

Run: `npm run lint && npm run test && npm run build`
Expected: clean; PASS; build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/components/book/BookGhost.tsx src/components/book/BookPropertiesActions.tsx src/components/ArtworkPlacement.tsx src/pages/EditorPage.tsx src/components/InstanceTransformControls.tsx src/lib/selectionOperations.ts src/lib/selectionOperations.test.ts src/components/PropertiesPanel.tsx src/components/SelectionOutline.tsx src/lib/book/viewerActions.ts
git commit -m "feat(books): place, move, select and open books in the editor"
```

---

### Task 12: Flip viewer overlay and controls lock

**Files:**
- Create: `src/lib/book/spread.ts`, `src/components/book/BookViewerHost.tsx`, `src/components/book/BookViewerOverlay.tsx`
- Modify: `package.json` (pdfjs-dist), `src/index.css`, `src/components/Player.tsx:133-152`, `src/components/physics/PhysicsWorld.tsx:113,142`, `src/components/PlannerCameraSystem.tsx:280-285,440,453`, `src/pages/EditorPage.tsx` (key handler guard, mount host), `src/pages/ViewerPage.tsx` (mount host, hide entry overlay while a book is open)
- Test: `src/lib/book/spread.test.ts`

**Interfaces:**
- Consumes: Task 7 store/actions/lock; Task 9 `bookPdfUrl`.
- Produces:
  - `interface Spread { left: number | null; right: number | null }` (1-based pages)
  - `buildSpreads(pageCount: number, single: boolean): Spread[]`
  - `spreadIndexOfPage(spreads: Spread[], page: number): number`
  - `spreadLabel(spread: Spread, pageCount: number): string`
  - `<BookViewerHost />` — mounts the lazy overlay while a book is open.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/book/spread.test.ts
import { describe, expect, it } from 'vitest';
import { buildSpreads, spreadIndexOfPage, spreadLabel } from './spread';

describe('buildSpreads', () => {
  it('starts with the cover alone on the right, then pairs', () => {
    expect(buildSpreads(5, false)).toEqual([
      { left: null, right: 1 }, { left: 2, right: 3 }, { left: 4, right: 5 },
    ]);
  });
  it('ends with a single left page for an even page count', () => {
    expect(buildSpreads(4, false)).toEqual([
      { left: null, right: 1 }, { left: 2, right: 3 }, { left: 4, right: null },
    ]);
  });
  it('shows one page per view on narrow screens', () => {
    expect(buildSpreads(3, true)).toEqual([{ left: null, right: 1 }, { left: null, right: 2 }, { left: null, right: 3 }]);
  });
  it('handles one-page PDFs and zero pages', () => {
    expect(buildSpreads(1, false)).toEqual([{ left: null, right: 1 }]);
    expect(buildSpreads(0, false)).toEqual([]);
  });
});

describe('spread helpers', () => {
  const spreads = buildSpreads(212, false);
  it('finds the spread of a page', () => {
    expect(spreadIndexOfPage(spreads, 1)).toBe(0);
    expect(spreadIndexOfPage(spreads, 13)).toBe(6);
    expect(spreadIndexOfPage(spreads, 999)).toBe(spreads.length - 1);
  });
  it('labels spreads', () => {
    expect(spreadLabel(spreads[6], 212)).toBe('12–13 / 212');
    expect(spreadLabel(spreads[0], 212)).toBe('1 / 212');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/book/spread.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement spreads**

```ts
// src/lib/book/spread.ts
/** Page layout of the flip viewer, like a real book: cover alone on the right, then 2–3, 4–5, … */

export interface Spread {
  left: number | null;
  right: number | null;
}

export function buildSpreads(pageCount: number, single: boolean): Spread[] {
  const spreads: Spread[] = [];
  if (pageCount < 1) return spreads;
  if (single) {
    for (let p = 1; p <= pageCount; p++) spreads.push({ left: null, right: p });
    return spreads;
  }
  spreads.push({ left: null, right: 1 });
  for (let p = 2; p <= pageCount; p += 2) spreads.push({ left: p, right: p + 1 <= pageCount ? p + 1 : null });
  return spreads;
}

export function spreadIndexOfPage(spreads: Spread[], page: number): number {
  const index = spreads.findIndex((s) => s.left === page || s.right === page);
  return index >= 0 ? index : Math.max(0, spreads.length - 1);
}

export function spreadLabel(spread: Spread, pageCount: number): string {
  const pages = [spread.left, spread.right].filter((p): p is number => p !== null);
  return `${pages.join('–')} / ${pageCount}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/book/spread.test.ts`
Expected: PASS.

- [ ] **Step 5: Install pdf.js**

Run: `npm install pdfjs-dist@^5`
Expected: added to `dependencies`. Then check `node_modules/pdfjs-dist/types/src/display/api.d.ts` for `RenderParameters`: if `canvasContext` is required, pass it in Step 6 (`canvasContext: canvas.getContext('2d')!`); if `canvas` is accepted alone, pass only `canvas`.

- [ ] **Step 6: Overlay**

Add to `src/index.css`:

```css
/* Book viewer: the page that turns in rotates about the spine. */
@keyframes bookTurnNext { from { transform: perspective(2400px) rotateY(-80deg); } to { transform: perspective(2400px) rotateY(0deg); } }
@keyframes bookTurnPrev { from { transform: perspective(2400px) rotateY(80deg); } to { transform: perspective(2400px) rotateY(0deg); } }
.book-turn-next { transform-origin: left center; animation: bookTurnNext 400ms ease-out; }
.book-turn-prev { transform-origin: right center; animation: bookTurnPrev 400ms ease-out; }
@media (prefers-reduced-motion: reduce) { .book-turn-next, .book-turn-prev { animation: none; } }
```

```tsx
// src/components/book/BookViewerHost.tsx
import { lazy, Suspense } from 'react';
import { useBookViewerStore } from '@/store/bookViewerStore';

// pdf.js lives only in this chunk; nothing PDF-related loads before a book is opened.
const BookViewerOverlay = lazy(() => import('./BookViewerOverlay'));

export function BookViewerHost() {
  const book = useBookViewerStore((s) => s.book);
  if (!book) return null;
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[1100] bg-black/85" />}>
      <BookViewerOverlay key={book.assetId} book={book} />
    </Suspense>
  );
}
```

```tsx
// src/components/book/BookViewerOverlay.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/store/authStore';
import type { OpenBook } from '@/store/bookViewerStore';
import { closeBook } from '@/lib/book/viewerActions';
import { bookPdfUrl } from '@/lib/book/api';
import { buildSpreads, spreadLabel, type Spread } from '@/lib/book/spread';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const SINGLE_BELOW_PX = 900;

function PageCanvas({ doc, page, maxHeight, maxWidth }: { doc: pdfjs.PDFDocumentProxy; page: number; maxHeight: number; maxWidth: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: pdfjs.RenderTask | null = null;
    doc.getPage(page).then((p) => {
      if (cancelled || !canvasRef.current) return;
      const base = p.getViewport({ scale: 1 });
      const fit = Math.min(maxHeight / base.height, maxWidth / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = p.getViewport({ scale: fit * dpr });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      task = p.render({ canvas, viewport });
      task.promise.catch(() => undefined);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, maxHeight, maxWidth]);
  return <canvas ref={canvasRef} className="block bg-white shadow-2xl" />;
}

export default function BookViewerOverlay({ book }: { book: OpenBook }) {
  const token = useAuthStore((s) => s.token);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState<'next' | 'prev' | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const task = pdfjs.getDocument({
      url: bookPdfUrl(book.assetId),
      httpHeaders: token && !book.publicView ? { Authorization: `Bearer ${token}` } : undefined,
      isEvalSupported: false,
      disableAutoFetch: true,
      disableStream: true,
      rangeChunkSize: 1 << 20,
    });
    task.promise.then(setDoc, () => setFailed(true));
    return () => { void task.destroy(); };
  }, [book.assetId, book.publicView, token]);

  const pageCount = doc?.numPages ?? book.pageCount;
  const single = viewport.w < SINGLE_BELOW_PX;
  const spreads = useMemo(() => buildSpreads(pageCount, single), [pageCount, single]);
  const current: Spread | undefined = spreads[Math.min(index, spreads.length - 1)];

  const go = useCallback((delta: 1 | -1) => {
    setIndex((i) => {
      const next = Math.max(0, Math.min(spreads.length - 1, i + delta));
      if (next !== i) setTurn(delta > 0 ? 'next' : 'prev');
      return next;
    });
  }, [spreads.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const pageMaxH = viewport.h - 140;
  const pageMaxW = single ? viewport.w - 120 : (viewport.w - 160) / 2;
  // Neighbouring spreads are rendered hidden so turning shows a finished page.
  const neighbours = [spreads[index - 1], spreads[index + 1]].filter(Boolean) as Spread[];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) closeBook('escape'); }}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-[1100] bg-black/85" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[1101] flex flex-col items-center justify-center outline-none"
          onEscapeKeyDown={(e) => { e.preventDefault(); closeBook('escape'); }}
        >
          <DialogTitle className="absolute left-6 top-5 text-sm font-medium text-white/80">{book.title}</DialogTitle>
          <button
            type="button"
            onClick={() => closeBook('button')}
            className="absolute right-5 top-4 flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" /> Schließen
          </button>

          {failed ? (
            <p className="text-sm text-white/80">Buch konnte nicht geladen werden</p>
          ) : !doc || !current ? (
            <Loader2 className="h-8 w-8 animate-spin text-white/70" />
          ) : (
            <>
              <div className="flex items-center gap-0" key={index}>
                {!single && (
                  <div className={turn === 'prev' ? 'book-turn-prev' : ''} style={{ minWidth: 1 }} onClick={() => go(-1)}>
                    {current.left !== null && <PageCanvas doc={doc} page={current.left} maxHeight={pageMaxH} maxWidth={pageMaxW} />}
                  </div>
                )}
                <div className={turn === 'next' ? 'book-turn-next' : ''} onClick={() => go(1)}>
                  {current.right !== null && <PageCanvas doc={doc} page={current.right} maxHeight={pageMaxH} maxWidth={pageMaxW} />}
                </div>
              </div>
              <div className="hidden" aria-hidden>
                {neighbours.flatMap((s) => [s.left, s.right]).filter((p): p is number => p !== null).map((p) => (
                  <PageCanvas key={p} doc={doc} page={p} maxHeight={pageMaxH} maxWidth={pageMaxW} />
                ))}
              </div>
              <div className="mt-4 flex items-center gap-4 text-sm text-white/80">
                <button type="button" onClick={() => go(-1)} disabled={index === 0} className="rounded p-2 hover:bg-white/10 disabled:opacity-30" aria-label="Zurückblättern">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="tabular-nums">{spreadLabel(current, pageCount)}</span>
                <button type="button" onClick={() => go(1)} disabled={index >= spreads.length - 1} className="rounded p-2 hover:bg-white/10 disabled:opacity-30" aria-label="Weiterblättern">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
```

(`src/components/ui/dialog.tsx` exports `Dialog`, `DialogPortal`, `DialogOverlay`, `DialogTitle`; its `DialogContent` is not used because it adds a centred card and its own close button.) If the shared `DialogOverlay` carries its own `z-50`/background classes, the `className` passed here must win — check the merged class list in the rendered DOM during Task 14.

- [ ] **Step 7: Wire the lock**

- `src/components/Player.tsx` `Player`: replace `const isDialogOpen = useEditorStore(...)` with `const locked = useControlsLocked();` and use `paused={locked}` / `{!locked && <PointerLockControls selector="#root" />}`.
- `src/components/physics/PhysicsWorld.tsx`: same for the editor `PlayerController paused={…}` (`const locked = useControlsLocked();`).
- `src/components/PlannerCameraSystem.tsx`:
  - `handlePointerUnlock`: `if (state.plannerViewMode === 'firstPerson' && !isControlsLocked()) {` (import from `@/lib/controlsLock`).
  - `const locked = useControlsLocked();` and `OrbitControls enabled={!isTransforming && wallPhase === 'idle' && !shiftHeld && !locked}`; mount first-person `PointerLockControls` only when `!locked`: `{viewMode === 'firstPerson' && !locked && <PointerLockControls … />}`.
- `src/pages/EditorPage.tsx` keyboard handler, first line after the input check: `if (useBookViewerStore.getState().book) return; // the book viewer handles its own keys`. Mount `<BookViewerHost />` next to `<SelectionOutlineSvg />`.
- `src/pages/ViewerPage.tsx`: mount `<BookViewerHost />` after `<ArtworkInfoOverlay />`; `const bookOpen = useBookViewerStore((s) => s.book !== null);` and render the entry overlay only when `showLoading && !bookOpen`.

- [ ] **Step 8: Lint, tests, build**

Run: `npm run lint && npm run test && npm run build`
Expected: clean; PASS; build succeeds and emits a separate chunk containing `pdf.worker` / pdfjs (check `dist/assets/` for a `BookViewerOverlay-*.js` chunk and that `index-*.js` does not contain `GlobalWorkerOptions`: `grep -l GlobalWorkerOptions dist/assets/*.js`).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/index.css src/lib/book/spread.ts src/lib/book/spread.test.ts src/components/book/BookViewerHost.tsx src/components/book/BookViewerOverlay.tsx src/components/Player.tsx src/components/physics/PhysicsWorld.tsx src/components/PlannerCameraSystem.tsx src/pages/EditorPage.tsx src/pages/ViewerPage.tsx
git commit -m "feat(books): flip-through viewer with controls lock"
```

---

### Task 13: Opening books in first person

**Files:**
- Modify: `src/components/FPVArtworkRaycaster.tsx`, `src/components/ArtworkInfoOverlay.tsx`, `src/components/PlacedArtworks.tsx:19-26`, `src/components/Scene.tsx:116`, `src/lib/book/viewerActions.ts`
- Test: `src/lib/book/viewerActions.test.ts` (extend)

**Interfaces:**
- Consumes: Task 6 `BOOK_OPEN_DISTANCE`; Task 7 store; Task 11 `openBookForInstance`.
- Produces: `bookInReach(hit: { object: THREE.Object3D; distance: number } | null, readable: boolean): boolean` in `viewerActions.ts`; `installFirstPersonBookClick(getInstance: (id: number) => ArtworkInstanceData | undefined, publicView: boolean): () => void` (registers a `mousedown` listener, returns the cleanup).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/book/viewerActions.test.ts`:

```ts
import * as THREE from 'three';
import { bookInReach } from './viewerActions';

describe('bookInReach', () => {
  const proxy = new THREE.Object3D();
  proxy.userData.bookHitProxy = true;
  it('is true for the book hit box within 2.5 m', () => {
    expect(bookInReach({ object: proxy, distance: 2.4 }, true)).toBe(true);
  });
  it('is false further away, for other objects, or when the book is not readable', () => {
    expect(bookInReach({ object: proxy, distance: 2.6 }, true)).toBe(false);
    expect(bookInReach({ object: new THREE.Object3D(), distance: 1 }, true)).toBe(false);
    expect(bookInReach({ object: proxy, distance: 1 }, false)).toBe(false);
    expect(bookInReach(null, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/book/viewerActions.test.ts`
Expected: FAIL — `bookInReach` missing.

- [ ] **Step 3: Implement**

Append to `src/lib/book/viewerActions.ts`:

```ts
import type * as THREE from 'three';
import { BOOK_OPEN_DISTANCE } from './geometry';

/** First person: the crosshair rests on a book's hit box, close enough to open it. */
export function bookInReach(hit: { object: THREE.Object3D; distance: number } | null, readable: boolean): boolean {
  return !!hit && readable && hit.object.userData.bookHitProxy === true && hit.distance <= BOOK_OPEN_DISTANCE;
}

/** Click while walking (pointer locked) opens the book under the crosshair. */
export function installFirstPersonBookClick(getInstance: (id: number) => ArtworkInstanceData | undefined, publicView: boolean): () => void {
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !document.pointerLockElement) return;
    const id = useBookViewerStore.getState().bookInReachId;
    const inst = id !== null ? getInstance(id) : undefined;
    if (!inst) return;
    e.preventDefault();
    openBookForInstance(inst, publicView);
  };
  document.addEventListener('mousedown', onMouseDown);
  return () => document.removeEventListener('mousedown', onMouseDown);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/book/viewerActions.test.ts`
Expected: PASS.

- [ ] **Step 5: Raycaster**

In `src/components/FPVArtworkRaycaster.tsx`:
- Keep the first hit, not only its group: `let firstHit: THREE.Intersection | null = null;` set in the loop next to `artworkGroup`.
- `clearHover` also calls `useBookViewerStore.getState().setBookInReach(null)`.
- After the occlusion check (not blocked):

```ts
        const info = artworkGroup.userData.artworkInfo as { assetType: string; publicReadable?: boolean };
        const readable = isEditor || info.publicReadable === true;
        useBookViewerStore.getState().setBookInReach(
            info.assetType === 'book' && bookInReach(firstHit, readable) ? id : null,
        );
```

- New optional prop `instances?: ArtworkInstanceData[]` (the viewer's data), kept in a ref, and the click:

```ts
    const instancesRef = useRef(instances);
    useEffect(() => { instancesRef.current = instances; }, [instances]);
    useEffect(() => installFirstPersonBookClick(
        (id) => (instancesRef.current ?? useEditorStore.getState().localInstances).find((i) => i.id === id),
        !isEditor,
    ), [isEditor]);
```

- `src/components/Scene.tsx:116`: `<FPVArtworkRaycaster isEditor={isEditor} instances={viewerInstances} />`.

In `src/components/PlacedArtworks.tsx` `buildArtworkInfo`, add `publicReadable: instance.artwork?.publicReadable === true,` so the viewer knows which books open.

- [ ] **Step 6: Hint**

In `src/components/ArtworkInfoOverlay.tsx`: `const bookInReach = useBookViewerStore((s) => s.bookInReachId !== null);` and under the crosshair render

```tsx
{bookInReach && (
  <div className="pointer-events-none fixed left-1/2 top-1/2 z-20 mt-6 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-xs text-white">
    Klicken zum Lesen
  </div>
)}
```

- [ ] **Step 7: Lint, tests, build**

Run: `npm run lint && npm run test && npm run build`
Expected: clean; PASS; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/book/viewerActions.ts src/lib/book/viewerActions.test.ts src/components/FPVArtworkRaycaster.tsx src/components/ArtworkInfoOverlay.tsx src/components/PlacedArtworks.tsx src/components/Scene.tsx
git commit -m "feat(books): open books from first person with the crosshair"
```

---

### Task 14: Docs, test-stack deploy and end-to-end check

**Files:**
- Modify: `CLAUDE.md` (new section „Bücher (PDF auf Sockel)" after „Maßstabsfigur"), `docs/superpowers/specs/2026-09-30-book-pedestal-design.md` (record the plan's refinements)

- [ ] **Step 1: CLAUDE.md**

Add after the „Maßstabsfigur" section:

```markdown
### Bücher (PDF auf Sockel)

- Asset type / medium `book` (`.pdf`, max 200 MB, `%PDF-` signature checked). The PDF lives in `<uploads>/.books/` (dot-directory, never served by `express.static`) and is only served by `GET /api/books/:assetId/pdf` (project access, or `Artwork.publicReadable` + an instance in a published version; else 404). Extensionless so Cloudflare keeps `Range`.
- `lib/bookJobs.ts` queue (like `videoJobs`): `pdfinfo` → `pdftoppm` page 1 (`execFile`, 30/60 s SIGKILL) → sharp cover `<stem>-cover-<n>.webp` + thumbs; `Asset.path` is the cover, the job creates the `Artwork` (page size in cm). Cover changes bump `metadata.coverVersion` → new file names (no cache busting needed). `poppler-utils` is in the Docker image.
- Settings: `PUT /artworks/:id` (`depth` cm or null = auto, `publicReadable`), `POST|DELETE /assets/:id/cover`. Dialog `BookSettingsDialog` (asset browser double-click, properties panel).
- 3D (`components/book/`): one instance = pedestal (1.20 m, book + 10 cm/side, min 40 × 40 cm) + closed book lying flat (cover +Y, top edge −Z, spine −X) + label plate on +Z. Sizes in `lib/book/geometry.ts`. Clicks hit a `BoxHitProxy` (book + 1 cm, ≥ 5 cm high). Books never scale (`isFixedSizeMedium`), gizmo X/Z + rotate Y, pedestal collider in first person.
- Viewer: `bookViewerStore` + `lib/book/viewerActions.ts` (store before `exitPointerLock`; close button re-locks, ESC leaves first person in the editor). Every control asks `useControlsLocked()` (`isDialogOpen || book`). `BookViewerOverlay` (lazy, pdfjs-dist, `isEvalSupported: false`) shows spreads (`lib/book/spread.ts`). Editor: double-click / „Buch öffnen"; first person: crosshair within 2.5 m + click („Klicken zum Lesen").
```

- [ ] **Step 2: Spec still matches**

Read the spec's „Plan refinements" section and check each point against the code; fix the spec if the implementation had to deviate further.

- [ ] **Step 3: Full local check**

Run: `npm run lint && npm run test && npm run build && cd server && npm run build && npx jest src/tests/pdfGeometry.test.ts src/tests/bookPdf.test.ts src/tests/bookAccess.test.ts src/tests/booksRoute.test.ts src/tests/artworkUpdate.test.ts src/tests/assetType.test.ts src/tests/instanceMedia.test.ts`
Expected: everything green. (`bookPdf.test.ts` needs no poppler — it uses fake tools.)

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-30-book-pedestal-design.md
git commit -m "docs: books on pedestals in CLAUDE.md"
```

- [ ] **Step 5: Deploy the branch to the test stack** (ask the user before running — it replaces the running test deployment)

```bash
ssh Prohosting-18GB-Server 'mv /root/CuraHub-test /root/CuraHub-test-prev && mkdir /root/CuraHub-test && cp /root/CuraHub-test-prev/docker-compose.test.yml /root/CuraHub-test/'
git archive HEAD | ssh Prohosting-18GB-Server 'tar -x -C /root/CuraHub-test'
ssh Prohosting-18GB-Server "echo $(git rev-parse --short HEAD) > /root/CuraHub-test/DEPLOYED_COMMIT"
ssh Prohosting-18GB-Server 'cd /root/CuraHub-test && docker compose -p curahub-test -f docker-compose.test.yml --env-file /root/CuraHub-test-secrets/test.env up -d --build'
```

Expected: container starts, `prepare-db` applies `20260930120000_book_artwork_fields`; `docker exec curahub-test-app-1 pdfinfo -v` prints a poppler version.

- [ ] **Step 6: Verify on the test stack** (tunnel: `ssh -N -L 3002:127.0.0.1:3002 Prohosting-18GB-Server`, then http://localhost:3002, project „test")

Checklist — each item must be observed, not assumed:
1. Upload a normal PDF, a landscape/rotated PDF, a password-protected PDF, a `.pdf` that is really a JPEG. Badge phases appear; the first two become ready with correct page count/format; the protected one shows „Fehlgeschlagen" with „PDF ist passwortgeschützt"; the fake one is rejected with „Datei ist kein gültiges PDF".
2. `curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/uploads/.books/<pdfFile>` → `404`; `…/api/books/<id>/pdf` without token → `404`; with the curator token → `200` and `Accept-Ranges: bytes`.
3. Buch-Einstellungen: replacement cover, reset, thickness slider + „Automatisch", title/artist/year — placed books update (cover, thickness, label plate).
4. Place a book: ghost = pedestal + book; gizmo only X/Z move and Y rotate; S does nothing; multi-select scale leaves it alone.
5. Orbit view: hover outline + pointer cursor; double-click and „Buch öffnen" open the viewer; arrows/clicks turn pages; ESC and „Schließen" close; orbit controls frozen while open.
6. First person (V): „Klicken zum Lesen" only within 2.5 m; click opens without leaving first person; „Schließen" → walking again at once; ESC → orbit view. Player cannot walk through the pedestal.
7. Public viewer of a published version: switch off → no hint, no opening, PDF route 404; switch on → opens; ESC → entry overlay, click → walking.
8. Headless render over CDP (`--headless=new --enable-unsafe-webgpu`, against the tunnel) with `?renderer=webgpu` and `?renderer=webgl`: cover reads upright from the label side (fix the UV note in Task 10 if not).

- [ ] **Step 7: Report**

Summarise what passed, what failed (with output), and anything left open to the user before any merge/PR.
