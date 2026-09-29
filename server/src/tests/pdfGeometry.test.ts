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
