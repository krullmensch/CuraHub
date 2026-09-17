/** Length formatting for the wall editor: metres in, German centimetre strings out. */

const cmFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 0, useGrouping: false });

/** 1.525 → "152,5 cm" */
export function formatCm(metres: number, withUnit = true): string {
    const cm = Math.round(metres * 1000) / 10;
    const text = cmFormat.format(Object.is(cm, -0) ? 0 : cm);
    return withUnit ? `${text} cm` : text;
}

/** Number for text inputs, German decimal comma: 1.525 → "152,5". */
export function cmInputValue(metres: number): string {
    const cm = Math.round(metres * 1000) / 10;
    return String(Object.is(cm, -0) ? 0 : cm).replace('.', ',');
}

/** "152,5" / "152.5" / "152,5 cm" → 1.525 (metres); null if not a number. */
export function parseCm(raw: string): number | null {
    const cleaned = raw.replace(/cm/i, '').trim().replace(',', '.');
    if (cleaned === '') return null;
    const value = Number(cleaned);
    return Number.isFinite(value) ? value / 100 : null;
}

/** Rounds metres to whole millimetres (keeps stored positions tidy). */
export const roundMm = (metres: number) => Math.round(metres * 1000) / 1000;
