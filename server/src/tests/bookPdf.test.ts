import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import {
    BookProcessingError, classifyPopplerError, coverFileNames, isAllowedCoverFormat, processBookPdf, readBookMetadata,
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

describe('cover source guards', () => {
    it('allows only jpeg, png and webp', () => {
        expect(['jpeg', 'png', 'webp'].every(isAllowedCoverFormat)).toBe(true);
        expect(['gif', 'svg', 'tiff', 'heif', undefined].some((f) => isAllowedCoverFormat(f))).toBe(false);
    });

    it('writeCoverSet rejects an image above the pixel limit', async () => {
        // 10001 x 10001 = 100.02 MP (> 100 MP), solid colour so the PNG stays tiny.
        const big = path.join(uploadDir, 'big.png');
        await sharp({ create: { width: 10001, height: 10001, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toFile(big);
        await expect(writeCoverSet(big, uploadDir, 'x', 1)).rejects.toThrow();
    }, 60000);
});
