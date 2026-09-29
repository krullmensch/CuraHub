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
