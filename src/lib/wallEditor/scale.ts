import type { Offset, Rect } from './layout';

/** Scale gestures of the 2D wall editor — pure math in wall units (metres, y up). */

export interface Point {
    x: number;
    y: number;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export const OPPOSITE_CORNER: Record<Corner, Corner> = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' };

/** No picture edge gets smaller than this (metres). */
export const MIN_PICTURE_EDGE = 0.01;
/** ⇧ while scaling: a tenth of the change. */
export const FINE_SCALE = 0.1;
/** Step of the −5 % / +5 % buttons. */
export const SCALE_STEP = 0.05;

/** Corner of a rectangle in wall coordinates (north = top = larger y). */
export function cornerPoint(r: Rect, corner: Corner): Point {
    return {
        x: corner === 'nw' || corner === 'sw' ? r.x : r.x + r.w,
        y: corner === 'nw' || corner === 'ne' ? r.y + r.h : r.y,
    };
}

/** Modal scale (S, like Blender): pointer distance from the pivot relative to the distance at the start. */
export function modalScaleFactor(pivot: Point, start: Point, current: Point): number {
    const d0 = Math.hypot(start.x - pivot.x, start.y - pivot.y);
    if (d0 < 1e-9) return 1;
    return Math.hypot(current.x - pivot.x, current.y - pivot.y) / d0;
}

/** Offset that puts `corner` of `after` back where it was on `before`. */
export function cornerShift(before: Rect, after: Rect, corner: Corner): Offset {
    const a = cornerPoint(before, corner);
    const b = cornerPoint(after, corner);
    return { dx: a.x - b.x, dy: a.y - b.y };
}

/** Corner handle: the pointer projected onto the line from the pivot through the grab point. */
export function handleScaleFactor(pivot: Point, start: Point, current: Point): number {
    const dx = start.x - pivot.x;
    const dy = start.y - pivot.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return 1;
    return ((current.x - pivot.x) * dx + (current.y - pivot.y) * dy) / len2;
}

/** ⇧: only a tenth of the change. */
export function fineFactor(factor: number): number {
    return 1 + (factor - 1) * FINE_SCALE;
}

/** Snaps a factor so the picture width becomes whole centimetres (at least 1 cm). */
export function snapFactorToCm(factor: number, pictureWidth: number): number {
    if (pictureWidth <= 0) return factor;
    const cm = Math.max(1, Math.round(pictureWidth * factor * 100));
    return cm / 100 / pictureWidth;
}

/** Keeps every picture edge at MIN_PICTURE_EDGE or more (`pictures`: current sizes in metres). */
export function clampScaleFactor(factor: number, pictures: { w: number; h: number }[]): number {
    let min = 1e-3;
    for (const p of pictures) {
        const edge = Math.min(p.w, p.h);
        if (edge > 0) min = Math.max(min, MIN_PICTURE_EDGE / edge);
    }
    return Math.max(factor, min);
}
