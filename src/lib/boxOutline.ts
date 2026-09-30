/**
 * Which edges of a box outline are worth drawing. The selection outline is an SVG overlay without a
 * depth test, so a solid box (book, model, splat) would show its far edges through itself. Only
 * edges that border at least one face turned towards the camera are kept.
 *
 * Corner i: x = bit 0, y = bit 1, z = bit 2 (set = max). Pure numbers, no Three.js, no allocation
 * apart from the output array (pass `out` to reuse one).
 */

export interface BoxCorner {
    x: number;
    y: number;
    z: number;
}

/** Perspective camera: its world position. Orthographic camera: its world view direction. */
export type BoxOutlineView =
    | { position: BoxCorner; direction?: undefined }
    | { direction: BoxCorner; position?: undefined };

export type BoxEdge = [number, number];

export const BOX_EDGES: BoxEdge[] = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
];

// Per edge: the axis it runs along and the two faces (axis * 2 + bit) it borders.
const EDGE_FACES: readonly [number, number][] = BOX_EDGES.map(([a, b]) => {
    const axis = Math.log2(a ^ b);
    const faces: number[] = [];
    for (let other = 0; other < 3; other++) {
        if (other !== axis) faces.push(other * 2 + ((a >> other) & 1));
    }
    return [faces[0], faces[1]];
});

const front = [false, false, false, false, false, false];

/** One component (x/y/z) of the box's edge vector along `axis`, from corner 0 (min) to its max end. */
const edgeX = (c: ArrayLike<BoxCorner>, k: 'x' | 'y' | 'z', axis: number) => c[1 << axis][k] - c[0][k];

export function visibleBoxEdges(
    corners: ArrayLike<BoxCorner>,
    view: BoxOutlineView,
    out: BoxEdge[] = [],
): BoxEdge[] {
    let any = false;
    for (let axis = 0; axis < 3; axis++) {
        // The other two axes; cross(u, v) is the face normal up to sign (fixed below).
        const u = (axis + 1) % 3;
        const v = (axis + 2) % 3;
        const ux = edgeX(corners, 'x', u), uy = edgeX(corners, 'y', u), uz = edgeX(corners, 'z', u);
        const vx = edgeX(corners, 'x', v), vy = edgeX(corners, 'y', v), vz = edgeX(corners, 'z', v);
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        // Handedness: make the normal point towards the max face (a mirrored box flips the cross product).
        const ax = edgeX(corners, 'x', axis), ay = edgeX(corners, 'y', axis), az = edgeX(corners, 'z', axis);
        if (nx * ax + ny * ay + nz * az < 0) { nx = -nx; ny = -ny; nz = -nz; }
        for (let bit = 0; bit < 2; bit++) {
            const sign = bit ? 1 : -1;
            let toEye: number;
            if (view.position) {
                const p = corners[bit << axis];
                toEye = nx * (view.position.x - p.x) + ny * (view.position.y - p.y) + nz * (view.position.z - p.z);
            } else {
                toEye = -(nx * view.direction.x + ny * view.direction.y + nz * view.direction.z);
            }
            const isFront = sign * toEye > 0;
            front[axis * 2 + bit] = isFront;
            if (isFront) any = true;
        }
    }
    out.length = 0;
    for (let i = 0; i < BOX_EDGES.length; i++) {
        // Camera inside the box (no face towards it): keep the whole outline.
        if (!any || front[EDGE_FACES[i][0]] || front[EDGE_FACES[i][1]]) out.push(BOX_EDGES[i]);
    }
    return out;
}
