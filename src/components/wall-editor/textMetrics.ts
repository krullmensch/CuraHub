import { PILL_FONT_SIZE, WE_FONT } from './theme';

let measureCtx: CanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();

/** Rendered width of a pill label (canvas text metrics, cached). */
export function textWidth(text: string, fontSize = PILL_FONT_SIZE, weight = 600): number {
    const key = `${weight}|${fontSize}|${text}`;
    const cached = widthCache.get(key);
    if (cached !== undefined) return cached;
    if (measureCtx === undefined) {
        measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    }
    let width = text.length * fontSize * 0.58;
    if (measureCtx) {
        measureCtx.font = `${weight} ${fontSize}px ${WE_FONT}`;
        width = measureCtx.measureText(text).width;
    }
    if (widthCache.size > 2000) widthCache.clear();
    widthCache.set(key, width);
    return width;
}
