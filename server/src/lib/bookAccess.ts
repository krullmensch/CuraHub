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
