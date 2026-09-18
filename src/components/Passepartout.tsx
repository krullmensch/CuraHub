import { useEffect, useMemo } from 'react';
import { GeometryWriter } from '../lib/frameProfileGeometry';
import { getPassepartoutMaterial, PASSEPARTOUT_TILE } from '../lib/frameMaterials';
import { PASSEPARTOUT_THICKNESS, PASSEPARTOUT_TUCK, type PassepartoutLayout } from '../lib/frameStyles';

interface PassepartoutProps {
    /** Picture size in metres — the window at the back of the board. */
    pictureWidth: number;
    pictureHeight: number;
    layout: PassepartoutLayout;
}

const S = Math.SQRT1_2;
/** How far the frame's shadow reaches onto the board, metres. */
const SHADOW_WIDTH = 0.011;
/**
 * Brightness right at the frame, per side. The scene has no shadow maps, so the soft shadow the
 * frame's lip throws onto the board is baked into its vertex colours — strongest along the top,
 * where the ceiling light comes from, faint along the bottom.
 */
const SHADOW = { top: 0.5, bottom: 0.88, left: 0.72, right: 0.72 };

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Side = keyof typeof SHADOW;

/**
 * Bevel-cut board around a picture, in the picture's coordinates (centre at the origin, wall at
 * z = 0). The window at the back of the board is exactly the picture; the 45° bevel opens it by
 * the board's thickness towards the front, so the white core shows as a thin edge. The outer
 * edge reaches under the frame's lip.
 */
export const Passepartout = ({ pictureWidth, pictureHeight, layout }: PassepartoutProps) => {
    const geometry = useMemo(() => {
        const T = PASSEPARTOUT_THICKNESS;
        const zf = layout.frontZ;
        const zb = zf - T;
        const bx = Math.abs(pictureWidth) / 2, by = Math.abs(pictureHeight) / 2;
        const window: Rect = { x0: -bx - T, y0: -by - T, x1: bx + T, y1: by + T };
        const opening: Rect = { x0: -bx - layout.side, y0: -by - layout.bottom, x1: bx + layout.side, y1: by + layout.top };
        const tucked: Rect = {
            x0: opening.x0 - PASSEPARTOUT_TUCK, y0: opening.y0 - PASSEPARTOUT_TUCK,
            x1: opening.x1 + PASSEPARTOUT_TUCK, y1: opening.y1 + PASSEPARTOUT_TUCK,
        };
        // Where the shadow has faded out — never past the window's bevel.
        const fade = (outer: number, inner: number, dir: number) => {
            const reach = Math.max(0, Math.min(SHADOW_WIDTH, Math.abs(inner - outer) - 0.0005));
            return outer + dir * reach;
        };
        const lit: Rect = {
            x0: fade(opening.x0, window.x0, 1), y0: fade(opening.y0, window.y0, 1),
            x1: fade(opening.x1, window.x1, -1), y1: fade(opening.y1, window.y1, -1),
        };

        const out = new GeometryWriter(true);
        const uv = (x: number, y: number) => [x / PASSEPARTOUT_TILE, y / PASSEPARTOUT_TILE];
        const grey = (v: number) => [v, v, v];
        const up = [0, 0, 1];

        // One ring of the front face between two rectangles, as four mitred trapezoids.
        const ring = (a: Rect, b: Rect, shadeA: Record<Side, number>, shadeB: Record<Side, number>) => {
            const sides: [Side, number[][]][] = [
                ['bottom', [[a.x0, a.y0], [a.x1, a.y0], [b.x1, b.y0], [b.x0, b.y0]]],
                ['top', [[a.x0, a.y1], [a.x1, a.y1], [b.x1, b.y1], [b.x0, b.y1]]],
                ['left', [[a.x0, a.y0], [a.x0, a.y1], [b.x0, b.y1], [b.x0, b.y0]]],
                ['right', [[a.x1, a.y0], [a.x1, a.y1], [b.x1, b.y1], [b.x1, b.y0]]],
            ];
            for (const [side, pts] of sides) {
                const ca = grey(shadeA[side]), cb = grey(shadeB[side]);
                out.quad(pts.map(([x, y]) => [x, y, zf]), [up, up, up, up], pts.map(([x, y]) => uv(x, y)), [ca, ca, cb, cb]);
            }
        };
        const full = { top: 1, bottom: 1, left: 1, right: 1 };
        ring(tucked, opening, SHADOW, SHADOW);
        ring(opening, lit, SHADOW, full);
        ring(lit, window, full, full);

        // The four bevels, facing into the window and towards the viewer.
        const white = grey(1);
        const bevel = (p: number[][], n: number[]) =>
            out.quad(p, [n, n, n, n], p.map(([x, y]) => uv(x, y)), [white, white, white, white]);
        bevel([[window.x0, window.y0, zf], [window.x1, window.y0, zf], [bx, -by, zb], [-bx, -by, zb]], [0, S, S]);
        bevel([[window.x0, window.y1, zf], [window.x1, window.y1, zf], [bx, by, zb], [-bx, by, zb]], [0, -S, S]);
        bevel([[window.x0, window.y0, zf], [window.x0, window.y1, zf], [-bx, by, zb], [-bx, -by, zb]], [S, 0, S]);
        bevel([[window.x1, window.y0, zf], [window.x1, window.y1, zf], [bx, by, zb], [bx, -by, zb]], [-S, 0, S]);
        return out.build();
    }, [pictureWidth, pictureHeight, layout.side, layout.top, layout.bottom, layout.frontZ]);

    useEffect(() => () => geometry.dispose(), [geometry]);

    return <mesh geometry={geometry} material={getPassepartoutMaterial()} />;
};
