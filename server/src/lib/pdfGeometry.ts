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
