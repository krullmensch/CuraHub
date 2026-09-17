/**
 * Pure layout helpers of the 2D wall editor (align, distribute, spacing, snapping, measuring).
 * Everything works in wall units: metres, x to the right from the wall's left edge, y up from the floor.
 */

export interface Rect {
    /** Left edge. */
    x: number;
    /** Bottom edge. */
    y: number;
    w: number;
    h: number;
}

export interface LayoutItem {
    id: number;
    rect: Rect;
}

export interface Offset {
    dx: number;
    dy: number;
}

export type Axis = 'x' | 'y';
export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

const EPS = 1e-6;

export const right = (r: Rect) => r.x + r.w;
export const top = (r: Rect) => r.y + r.h;
export const centerX = (r: Rect) => r.x + r.w / 2;
export const centerY = (r: Rect) => r.y + r.h / 2;
export const translate = (r: Rect, dx: number, dy: number): Rect => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });

export function unionRect(rects: Rect[]): Rect | null {
    if (rects.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rects) {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, right(r));
        maxY = Math.max(maxY, top(r));
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
    return a.x < right(b) && right(a) > b.x && a.y < top(b) && top(a) > b.y;
}

export function containsPoint(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= right(r) && y >= r.y && y <= top(r);
}

/** Overlap length of two intervals (negative = gap). */
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
export const overlapsX = (a: Rect, b: Rect) => overlap(a.x, right(a), b.x, right(b)) > EPS;
export const overlapsY = (a: Rect, b: Rect) => overlap(a.y, top(a), b.y, top(b)) > EPS;

// ─── Align ──────────────────────────────────────────────────────────────────

/** Offsets that align every item's edge/centre to the same edge/centre of `target`. */
export function alignOffsets(items: LayoutItem[], mode: AlignMode, target: Rect): Map<number, Offset> {
    const result = new Map<number, Offset>();
    for (const { id, rect } of items) {
        let dx = 0;
        let dy = 0;
        switch (mode) {
            case 'left': dx = target.x - rect.x; break;
            case 'hcenter': dx = centerX(target) - centerX(rect); break;
            case 'right': dx = right(target) - right(rect); break;
            case 'bottom': dy = target.y - rect.y; break;
            case 'vcenter': dy = centerY(target) - centerY(rect); break;
            case 'top': dy = top(target) - top(rect); break;
        }
        result.set(id, { dx, dy });
    }
    return result;
}

// ─── Distribute / spacing ─────────────────────────────────────────────────────

/**
 * Items in reading order along an axis: left → right for x, top → bottom for y
 * (the order curators read a column in).
 */
export function orderAlong(items: LayoutItem[], axis: Axis): LayoutItem[] {
    return [...items].sort((a, b) => axis === 'x'
        ? (a.rect.x - b.rect.x) || (centerX(a.rect) - centerX(b.rect))
        : (top(b.rect) - top(a.rect)) || (centerY(b.rect) - centerY(a.rect)));
}

/** Gaps between neighbours in reading order (negative when they overlap). */
export function gapsAlong(items: LayoutItem[], axis: Axis): number[] {
    const ordered = orderAlong(items, axis);
    const gaps: number[] = [];
    for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1].rect;
        const next = ordered[i].rect;
        gaps.push(axis === 'x' ? next.x - right(prev) : prev.y - top(next));
    }
    return gaps;
}

/** The common gap if all neighbours are equally spaced (±0.5 mm), otherwise 'mixed'. */
export function uniformGap(items: LayoutItem[], axis: Axis): number | 'mixed' | null {
    if (items.length < 2) return null;
    const gaps = gapsAlong(items, axis);
    const first = gaps[0];
    return gaps.every((g) => Math.abs(g - first) < 0.0005) ? first : 'mixed';
}

/**
 * Sets the gap between neighbours. The first item in reading order (left-most / top-most)
 * stays where it is.
 */
export function spacingOffsets(items: LayoutItem[], axis: Axis, gap: number): Map<number, Offset> {
    const ordered = orderAlong(items, axis);
    const result = new Map<number, Offset>();
    if (ordered.length === 0) return result;
    result.set(ordered[0].id, { dx: 0, dy: 0 });
    let cursor = axis === 'x' ? right(ordered[0].rect) : ordered[0].rect.y;
    for (let i = 1; i < ordered.length; i++) {
        const { id, rect } = ordered[i];
        if (axis === 'x') {
            const x = cursor + gap;
            result.set(id, { dx: x - rect.x, dy: 0 });
            cursor = x + rect.w;
        } else {
            const topEdge = cursor - gap;
            result.set(id, { dx: 0, dy: topEdge - top(rect) });
            cursor = topEdge - rect.h;
        }
    }
    return result;
}

/** Keeps the outermost items and spaces the ones in between evenly. */
export function distributeOffsets(items: LayoutItem[], axis: Axis): Map<number, Offset> {
    const ordered = orderAlong(items, axis);
    if (ordered.length < 3) return new Map(ordered.map((i) => [i.id, { dx: 0, dy: 0 }]));
    const first = ordered[0].rect;
    const last = ordered[ordered.length - 1].rect;
    const sizes = ordered.reduce((sum, i) => sum + (axis === 'x' ? i.rect.w : i.rect.h), 0);
    const span = axis === 'x' ? right(last) - first.x : top(first) - last.y;
    const gap = (span - sizes) / (ordered.length - 1);
    return spacingOffsets(ordered, axis, gap);
}

/** Moves the whole group so its bounding box is centred on `target` along `axis`. */
export function centerGroupOffsets(items: LayoutItem[], axis: Axis, target: Rect): Map<number, Offset> {
    const bounds = unionRect(items.map((i) => i.rect));
    const result = new Map<number, Offset>();
    if (!bounds) return result;
    const dx = axis === 'x' ? centerX(target) - centerX(bounds) : 0;
    const dy = axis === 'y' ? centerY(target) - centerY(bounds) : 0;
    for (const { id } of items) result.set(id, { dx, dy });
    return result;
}

/** Offsets that put every item's centre at height `y` (e.g. the museum hanging height). */
export function centerHeightOffsets(items: LayoutItem[], y: number): Map<number, Offset> {
    return new Map(items.map(({ id, rect }) => [id, { dx: 0, dy: y - centerY(rect) }]));
}

/** Keeps `rect` inside `bounds` (when it fits) by clamping the offset. */
export function clampOffsetToBounds(rect: Rect, dx: number, dy: number, bounds: Rect): Offset {
    let nx = rect.x + dx;
    let ny = rect.y + dy;
    if (rect.w <= bounds.w) nx = Math.min(Math.max(nx, bounds.x), right(bounds) - rect.w);
    if (rect.h <= bounds.h) ny = Math.min(Math.max(ny, bounds.y), top(bounds) - rect.h);
    else ny = Math.max(ny, bounds.y); // never below the floor
    return { dx: nx - rect.x, dy: ny - rect.y };
}

// ─── Snapping ────────────────────────────────────────────────────────────────

export interface SnapLine {
    axis: Axis;
    /** x for axis 'x' (vertical line), y for axis 'y' (horizontal line). */
    value: number;
    from: number;
    to: number;
}

export interface SpacingMark {
    axis: Axis;
    /** Start and end of the gap along `axis`. */
    start: number;
    end: number;
    /** Position of the marker across the axis. */
    at: number;
}

export interface SnapResult extends Offset {
    lines: SnapLine[];
    spacings: SpacingMark[];
}

export interface SnapContext {
    /** Artworks that don't move. */
    statics: Rect[];
    /** The wall face (0, 0, width, height). */
    wall: Rect;
    /** Extra horizontal lines (hanging height, ruler guides). */
    guidesY: number[];
    /** Extra vertical lines (ruler guides). */
    guidesX: number[];
}

interface Candidate {
    delta: number;
    lines: SnapLine[];
    spacings: SpacingMark[];
}

const better = (current: Candidate | null, delta: number, threshold: number) =>
    Math.abs(delta) <= threshold && (!current || Math.abs(delta) < Math.abs(current.delta) - EPS);

/** Existing gaps between neighbouring static rects along an axis (for equal-spacing snaps). */
function existingGaps(statics: Rect[], axis: Axis): { gap: number; a: Rect; b: Rect }[] {
    const gaps: { gap: number; a: Rect; b: Rect }[] = [];
    for (const a of statics) {
        let best: { gap: number; b: Rect } | null = null;
        for (const b of statics) {
            if (a === b) continue;
            if (axis === 'x') {
                if (!overlapsY(a, b)) continue;
                const gap = b.x - right(a);
                if (gap > EPS && (!best || gap < best.gap)) best = { gap, b };
            } else {
                if (!overlapsX(a, b)) continue;
                const gap = b.y - top(a);
                if (gap > EPS && (!best || gap < best.gap)) best = { gap, b };
            }
        }
        if (best) gaps.push({ gap: best.gap, a, b: best.b });
    }
    return gaps;
}

function snapAxis(moving: Rect, ctx: SnapContext, axis: Axis, threshold: number): Candidate | null {
    let best: Candidate | null = null;
    const edges = axis === 'x'
        ? [moving.x, centerX(moving), right(moving)]
        : [moving.y, centerY(moving), top(moving)];
    const span = (r: Rect): [number, number] => axis === 'x' ? [r.y, top(r)] : [r.x, right(r)];
    const [m0, m1] = span(moving);

    const consider = (value: number, extent: [number, number] | null) => {
        for (const edge of edges) {
            const delta = value - edge;
            if (!better(best, delta, threshold)) continue;
            const from = extent ? Math.min(extent[0], m0) : m0;
            const to = extent ? Math.max(extent[1], m1) : m1;
            best = { delta, lines: [{ axis, value, from, to }], spacings: [] };
        }
    };

    // Edges and centres of other artworks
    for (const r of ctx.statics) {
        const values = axis === 'x' ? [r.x, centerX(r), right(r)] : [r.y, centerY(r), top(r)];
        for (const value of values) consider(value, span(r));
    }
    // Wall edges and centre line; floor/top for y
    const wallValues = axis === 'x'
        ? [ctx.wall.x, centerX(ctx.wall), right(ctx.wall)]
        : [ctx.wall.y, centerY(ctx.wall), top(ctx.wall)];
    for (const value of wallValues) consider(value, span(ctx.wall));
    for (const value of axis === 'x' ? ctx.guidesX : ctx.guidesY) consider(value, span(ctx.wall));

    // Equal spacing: between two neighbours, or continuing an existing gap
    const size = axis === 'x' ? moving.w : moving.h;
    const start = axis === 'x' ? moving.x : moving.y;
    const across = (a: Rect) => (axis === 'x' ? overlapsY(a, moving) : overlapsX(a, moving));
    const lo = (r: Rect) => (axis === 'x' ? r.x : r.y);
    const hi = (r: Rect) => (axis === 'x' ? right(r) : top(r));
    const acrossMid = (rects: Rect[]) => {
        const lows = rects.map((r) => span(r)[0]);
        const highs = rects.map((r) => span(r)[1]);
        return (Math.max(...lows) + Math.min(...highs)) / 2;
    };
    const neighbours = ctx.statics.filter(across);
    for (const a of neighbours) {
        for (const b of neighbours) {
            if (a === b || hi(a) > lo(b)) continue;
            const free = lo(b) - hi(a) - size;
            if (free < 0) continue;
            const target = hi(a) + free / 2;
            const delta = target - start;
            if (!better(best, delta, threshold)) continue;
            const at = acrossMid([a, b, moving]);
            best = {
                delta, lines: [],
                spacings: [
                    { axis, start: hi(a), end: target, at },
                    { axis, start: target + size, end: lo(b), at },
                ],
            };
        }
    }
    for (const { gap, a, b } of existingGaps(ctx.statics, axis)) {
        const at0 = acrossMid([a, b]);
        for (const n of neighbours) {
            // Continue after n
            const after = hi(n) + gap;
            let delta = after - start;
            if (better(best, delta, threshold)) {
                best = {
                    delta, lines: [],
                    spacings: [
                        { axis, start: hi(a), end: lo(b), at: at0 },
                        { axis, start: hi(n), end: after, at: acrossMid([n, moving]) },
                    ],
                };
            }
            // Continue before n
            const before = lo(n) - gap - size;
            delta = before - start;
            if (better(best, delta, threshold)) {
                best = {
                    delta, lines: [],
                    spacings: [
                        { axis, start: hi(a), end: lo(b), at: at0 },
                        { axis, start: before + size, end: lo(n), at: acrossMid([n, moving]) },
                    ],
                };
            }
        }
    }
    return best;
}

/** Snaps a moving rect (already offset by the raw drag) to nearby edges, centres and gaps. */
export function snapRect(moving: Rect, ctx: SnapContext, threshold: number): SnapResult {
    const sx = snapAxis(moving, ctx, 'x', threshold);
    const sy = snapAxis(moving, ctx, 'y', threshold);
    const dx = sx?.delta ?? 0;
    const dy = sy?.delta ?? 0;
    // Lines were computed before the other axis snapped — shift their extents accordingly.
    const lines = [
        ...(sx?.lines ?? []).map((l) => ({ ...l, from: l.from + dy, to: l.to + dy })),
        ...(sy?.lines ?? []).map((l) => ({ ...l, from: l.from + dx, to: l.to + dx })),
    ];
    const spacings = [
        ...(sx?.spacings ?? []),
        ...(sy?.spacings ?? []),
    ];
    return { dx, dy, lines, spacings };
}

/** Snap a single point (measure tool) to artwork edges/centres, wall edges and the floor. */
export function snapPoint(x: number, y: number, rects: Rect[], wall: Rect, threshold: number): { x: number; y: number; snappedX: boolean; snappedY: boolean } {
    let bestX: number | null = null;
    let bestY: number | null = null;
    const xs = [wall.x, centerX(wall), right(wall), ...rects.flatMap((r) => [r.x, centerX(r), right(r)])];
    const ys = [wall.y, top(wall), ...rects.flatMap((r) => [r.y, centerY(r), top(r)])];
    for (const v of xs) if (Math.abs(v - x) <= threshold && (bestX === null || Math.abs(v - x) < Math.abs(bestX - x))) bestX = v;
    for (const v of ys) if (Math.abs(v - y) <= threshold && (bestY === null || Math.abs(v - y) < Math.abs(bestY - y))) bestY = v;
    return { x: bestX ?? x, y: bestY ?? y, snappedX: bestX !== null, snappedY: bestY !== null };
}

// ─── Measuring ───────────────────────────────────────────────────────────────

export interface Measurement {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    /** Distance in metres. */
    value: number;
    /** Dashed helper lines that connect the measurement to the rects it refers to. */
    helpers?: { x1: number; y1: number; x2: number; y2: number }[];
    /** Marks a distance to the floor. */
    kind?: 'gap' | 'floor' | 'wall';
}

/**
 * Distances from `rect` to its nearest neighbour (or the wall edge / floor) in all four directions.
 * `at` places the horizontal lines at that fraction of the rect's height (and the vertical ones
 * at that fraction of its width) — 0.5 = through the centre.
 */
export function neighbourDistances(rect: Rect, others: Rect[], wall: Rect, at: { x?: number; y?: number } = {}): Measurement[] {
    const cy = rect.y + rect.h * (at.y ?? 0.5);
    const cx = rect.x + rect.w * (at.x ?? 0.5);
    let left: Rect | null = null, rightN: Rect | null = null, below: Rect | null = null, above: Rect | null = null;
    for (const o of others) {
        if (overlapsY(o, rect)) {
            if (right(o) <= rect.x + EPS && (!left || right(o) > right(left))) left = o;
            if (o.x >= right(rect) - EPS && (!rightN || o.x < rightN.x)) rightN = o;
        }
        if (overlapsX(o, rect)) {
            if (top(o) <= rect.y + EPS && (!below || top(o) > top(below))) below = o;
            if (o.y >= top(rect) - EPS && (!above || o.y < above.y)) above = o;
        }
    }
    const result: Measurement[] = [];
    const lx = left ? right(left) : wall.x;
    if (rect.x - lx > EPS) result.push({ x1: lx, y1: cy, x2: rect.x, y2: cy, value: rect.x - lx, kind: left ? 'gap' : 'wall' });
    const rx = rightN ? rightN.x : right(wall);
    if (rx - right(rect) > EPS) result.push({ x1: right(rect), y1: cy, x2: rx, y2: cy, value: rx - right(rect), kind: rightN ? 'gap' : 'wall' });
    const by = below ? top(below) : wall.y;
    if (rect.y - by > EPS) result.push({ x1: cx, y1: by, x2: cx, y2: rect.y, value: rect.y - by, kind: below ? 'gap' : 'floor' });
    const ty = above ? above.y : top(wall);
    if (ty - top(rect) > EPS) result.push({ x1: cx, y1: top(rect), x2: cx, y2: ty, value: ty - top(rect), kind: above ? 'gap' : 'wall' });
    return result;
}

/** Floor distances of an artwork's bottom edge, centre and top edge. */
export function floorDistances(rect: Rect, floorY = 0): { bottom: number; center: number; top: number } {
    return { bottom: rect.y - floorY, center: centerY(rect) - floorY, top: top(rect) - floorY };
}

/** Figma-style distances between a selection `a` and another rect `b` (Alt + hover). */
export function distancesBetween(a: Rect, b: Rect): Measurement[] {
    const result: Measurement[] = [];
    const ovX = overlap(a.x, right(a), b.x, right(b));
    const ovY = overlap(a.y, top(a), b.y, top(b));

    // Horizontal distance
    if (ovX <= EPS) {
        const bIsRight = b.x >= right(a) - EPS;
        const x1 = bIsRight ? right(a) : right(b);
        const x2 = bIsRight ? b.x : a.x;
        const y = ovY > EPS ? Math.max(a.y, b.y) + ovY / 2 : centerY(a);
        const edgeX = bIsRight ? b.x : right(b);
        const helpers = ovY > EPS ? undefined : [{ x1: edgeX, y1: y, x2: edgeX, y2: y > top(b) ? top(b) : b.y }];
        result.push({ x1, y1: y, x2, y2: y, value: x2 - x1, kind: 'gap', helpers });
    } else {
        const y = ovY > EPS ? Math.max(a.y, b.y) + ovY / 2 : centerY(a);
        if (Math.abs(a.x - b.x) > EPS) result.push({ x1: Math.min(a.x, b.x), y1: y, x2: Math.max(a.x, b.x), y2: y, value: Math.abs(a.x - b.x), kind: 'gap' });
        if (Math.abs(right(a) - right(b)) > EPS) result.push({ x1: Math.min(right(a), right(b)), y1: y, x2: Math.max(right(a), right(b)), y2: y, value: Math.abs(right(a) - right(b)), kind: 'gap' });
    }

    // Vertical distance
    if (ovY <= EPS) {
        const bIsAbove = b.y >= top(a) - EPS;
        const y1 = bIsAbove ? top(a) : top(b);
        const y2 = bIsAbove ? b.y : a.y;
        const x = ovX > EPS ? Math.max(a.x, b.x) + ovX / 2 : centerX(a);
        const edgeY = bIsAbove ? b.y : top(b);
        const helpers = ovX > EPS ? undefined : [{ x1: x, y1: edgeY, x2: x > right(b) ? right(b) : b.x, y2: edgeY }];
        result.push({ x1: x, y1, x2: x, y2, value: y2 - y1, kind: 'gap', helpers });
    } else {
        const x = ovX > EPS ? Math.max(a.x, b.x) + ovX / 2 : centerX(a);
        if (Math.abs(a.y - b.y) > EPS) result.push({ x1: x, y1: Math.min(a.y, b.y), x2: x, y2: Math.max(a.y, b.y), value: Math.abs(a.y - b.y), kind: 'gap' });
        if (Math.abs(top(a) - top(b)) > EPS) result.push({ x1: x, y1: Math.min(top(a), top(b)), x2: x, y2: Math.max(top(a), top(b)), value: Math.abs(top(a) - top(b)), kind: 'gap' });
    }
    return result;
}

/** Gaps between horizontally adjacent rects (same row) — for the "show gaps" overlay. */
export function rowGaps(rects: Rect[]): Measurement[] {
    const result: Measurement[] = [];
    for (const a of rects) {
        let nearest: Rect | null = null;
        for (const b of rects) {
            if (a === b || !overlapsY(a, b) || b.x < right(a) - EPS) continue;
            if (!nearest || b.x < nearest.x) nearest = b;
        }
        if (nearest && nearest.x - right(a) > EPS) {
            const lo = Math.max(a.y, nearest.y);
            const hi = Math.min(top(a), top(nearest));
            const y = (lo + hi) / 2;
            result.push({ x1: right(a), y1: y, x2: nearest.x, y2: y, value: nearest.x - right(a), kind: 'gap' });
        }
    }
    return result;
}
