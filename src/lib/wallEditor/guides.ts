import { z } from 'zod';
import type { Rect } from './layout';

/**
 * Ruler guides and hanging height of the 2D wall editor, stored per exhibition version
 * (server/src/lib/wallGuides.ts mirrors the limits). Guide values are relative to the face:
 * 'h' = horizontal line, metres above the face's floor (wallRect.y);
 * 'v' = vertical line, metres from the face's left edge (wallRect.x).
 */

export type GuideAxis = 'h' | 'v';

export interface StoredGuide {
    axis: GuideAxis;
    value: number;
}

/** Guides per wall face, keyed by targetKey(): `wall:<id>:<side>` or a room face id. */
export type WallGuides = Record<string, StoredGuide[]>;

export interface WallLayout {
    hangingHeight: number;
    guides: WallGuides;
}

export const DEFAULT_HANGING_HEIGHT = 1.45;
export const MIN_HANGING_HEIGHT = 0.01;
export const MAX_HANGING_HEIGHT = 9.99;
export const MAX_GUIDES_PER_FACE = 200;

const hangingHeightSchema = z.number().min(MIN_HANGING_HEIGHT).max(MAX_HANGING_HEIGHT);
const wallGuidesSchema = z.record(
    z.string(),
    z.array(z.object({ axis: z.enum(['h', 'v']), value: z.number().min(-100).max(100) })).max(MAX_GUIDES_PER_FACE),
);

/** Validates a wall-layout response field by field; broken fields fall back to the defaults. */
export function parseWallLayout(json: unknown): WallLayout {
    const data = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>;
    const height = hangingHeightSchema.safeParse(data.hangingHeight);
    const guides = wallGuidesSchema.safeParse(data.guides ?? {});
    if (!height.success || !guides.success) console.warn('[WallLayout] Ignoring invalid wall layout data:', json);
    return {
        hangingHeight: height.success ? height.data : DEFAULT_HANGING_HEIGHT,
        guides: guides.success ? guides.data : {},
    };
}

/** Position of a guide in wall coordinates: v for horizontal lines, u for vertical ones. */
export function guideToWall(g: StoredGuide, wall: Rect): number {
    return g.axis === 'h' ? wall.y + g.value : wall.x + g.value;
}

/** Guide value for a position in wall coordinates. */
export function wallToGuideValue(axis: GuideAxis, wallValue: number, wall: Rect): number {
    return axis === 'h' ? wallValue - wall.y : wallValue - wall.x;
}

/** Keeps a value on the face: 0 … height for horizontal lines, 0 … width for vertical ones. */
export function clampGuideValue(axis: GuideAxis, value: number, wall: Rect): number {
    const max = axis === 'h' ? wall.h : wall.w;
    return Math.min(max, Math.max(0, value));
}

/** Menu order: horizontal lines top to bottom, then vertical lines left to right. */
export function sortGuides<T extends StoredGuide>(guides: T[]): T[] {
    return [...guides].sort((a, b) => {
        if (a.axis !== b.axis) return a.axis === 'h' ? -1 : 1;
        return a.axis === 'h' ? b.value - a.value : a.value - b.value;
    });
}

/** Turns a guide by 90°: same value, clamped to the face along the new direction. */
export function flipGuide<T extends StoredGuide>(g: T, wall: Rect): T {
    const axis: GuideAxis = g.axis === 'h' ? 'v' : 'h';
    return { ...g, axis, value: clampGuideValue(axis, g.value, wall) };
}

const SAME_GUIDE_M = 0.0005;

export function hasGuideAt(guides: StoredGuide[], axis: GuideAxis, value: number): boolean {
    return guides.some((g) => g.axis === axis && Math.abs(g.value - value) <= SAME_GUIDE_M);
}

/** Value for a guide added from the menu: the middle of the visible area, whole cm, on the face. */
export function newGuideValue(axis: GuideAxis, viewCenter: { u: number; v: number }, wall: Rect): number {
    const raw = wallToGuideValue(axis, axis === 'h' ? viewCenter.v : viewCenter.u, wall);
    return Math.round(clampGuideValue(axis, raw, wall) * 100) / 100;
}

/** Stored form: no ids, faces without guides left out. */
export function serializeGuides(byFace: Record<string, readonly StoredGuide[]>): WallGuides {
    const out: WallGuides = {};
    for (const [key, guides] of Object.entries(byFace)) {
        if (guides.length > 0) out[key] = guides.map((g) => ({ axis: g.axis, value: g.value }));
    }
    return out;
}

const wallPrefix = (wallId: number) => `wall:${wallId}:`;

/** Moves the entries of a wall to its new id (a temporary wall got its database id). */
export function renameWallKeys<T>(byFace: Record<string, T>, from: number, to: number): Record<string, T> {
    const prefix = wallPrefix(from);
    if (!Object.keys(byFace).some((key) => key.startsWith(prefix))) return byFace;
    return Object.fromEntries(Object.entries(byFace).map(([key, value]) => [
        key.startsWith(prefix) ? wallPrefix(to) + key.slice(prefix.length) : key,
        value,
    ]));
}

/** Removes the entries of all faces of a deleted wall. */
export function dropWallKeys<T>(byFace: Record<string, T>, wallId: number): Record<string, T> {
    const prefix = wallPrefix(wallId);
    if (!Object.keys(byFace).some((key) => key.startsWith(prefix))) return byFace;
    return Object.fromEntries(Object.entries(byFace).filter(([key]) => !key.startsWith(prefix)));
}
