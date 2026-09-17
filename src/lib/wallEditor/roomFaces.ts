import * as THREE from 'three';
import type { WallFrame } from './geometry';

/**
 * Wall faces of the room model (the Satellit's own walls), derived from its geometry so the 2D
 * wall editor can open them like modular walls. The room's walls are a single mesh, so every
 * large vertical plane that faces into the room becomes one face.
 */

export interface RoomOpening {
    /** Rectangle in face coordinates (u from the left edge, v above the floor). */
    x: number;
    y: number;
    w: number;
    h: number;
    kind: 'window' | 'door';
}

export interface RoomFace {
    /** Stable id derived from the plane (same model → same id). */
    id: string;
    label: string;
    /** Horizontal unit normal pointing into the room (x, z). */
    normal: [number, number];
    /** World x/z of the face's left edge (as seen from inside the room). */
    origin: [number, number];
    width: number;
    /** Top of the face above the floor. */
    height: number;
    /** Face triangles in face coordinates: [u0, v0, u1, v1, u2, v2, …]. */
    triangles: number[];
    /** Boundary edges in face coordinates: [u1, v1, u2, v2, …]. */
    outline: number[];
    openings: RoomOpening[];
}

type Vec3 = [number, number, number];
type Tri = [Vec3, Vec3, Vec3];

const MIN_WIDTH = 1.0;
const MIN_HEIGHT = 1.5;
const MIN_AREA = 1.5;
const RASTER = 0.025;
/** Faces start this high above the floor in the model (skirting shadow gap) — ignored for openings. */
const FLOOR_BAND = 0.1;

const vkey = (v: Vec3) => `${Math.round(v[0] * 1000)},${Math.round(v[1] * 1000)},${Math.round(v[2] * 1000)}`;

function triangleNormal(t: Tri): Vec3 | null {
    const ax = t[1][0] - t[0][0], ay = t[1][1] - t[0][1], az = t[1][2] - t[0][2];
    const bx = t[2][0] - t[0][0], by = t[2][1] - t[0][1], bz = t[2][2] - t[0][2];
    const n: Vec3 = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) return null;
    return [n[0] / len, n[1] / len, n[2] / len];
}

const triangleArea = (t: Tri) => {
    const ax = t[1][0] - t[0][0], ay = t[1][1] - t[0][1], az = t[1][2] - t[0][2];
    const bx = t[2][0] - t[0][0], by = t[2][1] - t[0][1], bz = t[2][2] - t[0][2];
    return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
};

function pointInTriangle2D(px: number, py: number, a: number[], b: number[], c: number[]): boolean {
    const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
    const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
    const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
    const neg = d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12;
    const pos = d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12;
    return !(neg && pos);
}

/** Triangles of a geometry in world space. */
export function geometryTriangles(geometry: THREE.BufferGeometry, matrixWorld?: THREE.Matrix4): Tri[] {
    const pos = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index ? index.count : pos.count;
    const v = new THREE.Vector3();
    const read = (i: number): Vec3 => {
        v.fromBufferAttribute(pos, index ? index.getX(i) : i);
        if (matrixWorld) v.applyMatrix4(matrixWorld);
        return [v.x, v.y, v.z];
    };
    const tris: Tri[] = [];
    for (let i = 0; i + 2 < count; i += 3) tris.push([read(i), read(i + 1), read(i + 2)]);
    return tris;
}

/** Finds window/door openings: uncovered areas inside the face rectangle. */
function findOpenings(tris2d: number[][][], width: number, height: number, outline: number[]): RoomOpening[] {
    const cols = Math.ceil(width / RASTER);
    const rows = Math.ceil(height / RASTER);
    const covered = new Uint8Array(cols * rows);
    for (const t of tris2d) {
        const minU = Math.min(t[0][0], t[1][0], t[2][0]), maxU = Math.max(t[0][0], t[1][0], t[2][0]);
        const minV = Math.min(t[0][1], t[1][1], t[2][1]), maxV = Math.max(t[0][1], t[1][1], t[2][1]);
        const c0 = Math.max(0, Math.floor(minU / RASTER)), c1 = Math.min(cols - 1, Math.floor(maxU / RASTER));
        const r0 = Math.max(0, Math.floor(minV / RASTER)), r1 = Math.min(rows - 1, Math.floor(maxV / RASTER));
        for (let r = r0; r <= r1; r++) {
            const py = (r + 0.5) * RASTER;
            for (let c = c0; c <= c1; c++) {
                if (covered[r * cols + c]) continue;
                if (pointInTriangle2D((c + 0.5) * RASTER, py, t[0], t[1], t[2])) covered[r * cols + c] = 1;
            }
        }
    }
    const bandRows = Math.ceil(FLOOR_BAND / RASTER);
    // Treat the skirting band as uncovered only where the area above it is uncovered (door openings).
    for (let c = 0; c < cols; c++) {
        const aboveOpen = !covered[bandRows * cols + c];
        for (let r = 0; r < bandRows; r++) covered[r * cols + c] = aboveOpen ? 0 : 1;
    }

    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < outline.length; i += 4) {
        if (Math.abs(outline[i] - outline[i + 2]) < 1e-4) xs.push(outline[i]);
        if (Math.abs(outline[i + 1] - outline[i + 3]) < 1e-4) ys.push(outline[i + 1]);
    }
    const snap = (value: number, candidates: number[]) => {
        let best = value;
        for (const c of candidates) if (Math.abs(c - value) < RASTER * 1.5 && Math.abs(c - value) < Math.abs(best - value) + 1e-9) best = c;
        return best;
    };

    const seen = new Uint8Array(cols * rows);
    const openings: RoomOpening[] = [];
    for (let start = 0; start < covered.length; start++) {
        if (covered[start] || seen[start]) continue;
        const stack = [start];
        seen[start] = 1;
        let minC = cols, maxC = -1, minR = rows, maxR = -1;
        let touchesSide = false;
        while (stack.length) {
            const i = stack.pop()!;
            const r = Math.floor(i / cols);
            const c = i % cols;
            minC = Math.min(minC, c); maxC = Math.max(maxC, c);
            minR = Math.min(minR, r); maxR = Math.max(maxR, r);
            if (c === 0 || c === cols - 1 || r === rows - 1) touchesSide = true;
            const neighbours = [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1];
            for (const n of neighbours) {
                if (n >= 0 && !covered[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
            }
        }
        const w = (maxC - minC + 1) * RASTER;
        const h = (maxR - minR + 1) * RASTER;
        if (touchesSide || w < 0.3 || h < 0.3) continue;
        const x0 = snap(minC * RASTER, xs);
        const x1 = snap((maxC + 1) * RASTER, xs);
        const y0 = minR === 0 ? 0 : snap(minR * RASTER, ys);
        const y1 = snap((maxR + 1) * RASTER, ys);
        openings.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: y0 < 0.3 ? 'door' : 'window' });
    }
    return openings.sort((a, b) => a.x - b.x);
}

/**
 * Extracts the inner wall faces of a room.
 * @param wallTris  triangles of the room's wall mesh (world space)
 * @param floorTris triangles of the floor mesh (world space) — decides which side is "inside"
 */
export function extractRoomFaces(wallTris: Tri[], floorTris: Tri[]): RoomFace[] {
    const floorTops = floorTris.filter((t) => (triangleNormal(t)?.[1] ?? 0) > 0.9 || (triangleNormal(t)?.[1] ?? 0) < -0.9);
    const insideRoom = (x: number, z: number) => floorTops.some((t) => pointInTriangle2D(x, z, [t[0][0], t[0][2]], [t[1][0], t[1][2]], [t[2][0], t[2][2]]));

    // 1. Vertical triangles grouped by plane
    const planes = new Map<string, { n: Vec3; tris: Tri[] }>();
    for (const t of wallTris) {
        const n = triangleNormal(t);
        if (!n || Math.abs(n[1]) > 0.1) continue;
        const len = Math.hypot(n[0], n[2]);
        const nx = n[0] / len, nz = n[2] / len;
        const offset = nx * t[0][0] + nz * t[0][2];
        const key = `${Math.round(nx * 50)},${Math.round(nz * 50)},${Math.round(offset * 100)}`;
        let plane = planes.get(key);
        if (!plane) { plane = { n: [nx, 0, nz], tris: [] }; planes.set(key, plane); }
        plane.tris.push(t);
    }

    const faces: (RoomFace & { area: number; key: string })[] = [];
    for (const [key, plane] of planes) {
        // 2. Connected components (shared vertices)
        const parent = plane.tris.map((_, i) => i);
        const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
        const owner = new Map<string, number>();
        plane.tris.forEach((t, i) => {
            for (const v of t) {
                const k = vkey(v);
                const o = owner.get(k);
                if (o === undefined) owner.set(k, i);
                else parent[find(i)] = find(o);
            }
        });
        const components = new Map<number, Tri[]>();
        plane.tris.forEach((t, i) => {
            const root = find(i);
            if (!components.has(root)) components.set(root, []);
            components.get(root)!.push(t);
        });

        let componentIndex = 0;
        for (const tris of [...components.values()].sort((a, b) => b.length - a.length)) {
            const idx = componentIndex++;
            const [nx, , nz] = plane.n;
            const rx = nz, rz = -nx; // right = up × normal
            const us = tris.flat().map((v) => rx * v[0] + rz * v[2]);
            const ys = tris.flat().map((v) => v[1]);
            const minU = Math.min(...us), maxU = Math.max(...us);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            const area = tris.reduce((sum, t) => sum + triangleArea(t), 0);
            const width = maxU - minU;
            if (width < MIN_WIDTH || maxY - minY < MIN_HEIGHT || area < MIN_AREA) continue;

            const offset = tris.flat().reduce((sum, v) => sum + nx * v[0] + nz * v[2], 0) / (tris.length * 3);
            const midU = (minU + maxU) / 2;
            // A point 30 cm in front of the face's middle must be inside the room.
            const px = nx * offset + rx * midU + nx * 0.3;
            const pz = nz * offset + rz * midU + nz * 0.3;
            if (!insideRoom(px, pz)) continue;

            const toFace = (v: Vec3): number[] => [rx * v[0] + rz * v[2] - minU, v[1]];
            const tris2d = tris.map((t) => t.map(toFace));
            const edgeUse = new Map<string, { a: number[]; b: number[]; n: number }>();
            for (const t of tris) {
                for (let e = 0; e < 3; e++) {
                    const a = t[e], b = t[(e + 1) % 3];
                    const ka = vkey(a), kb = vkey(b);
                    const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
                    const entry = edgeUse.get(k);
                    if (entry) entry.n++;
                    else edgeUse.set(k, { a: toFace(a), b: toFace(b), n: 1 });
                }
            }
            const outline: number[] = [];
            for (const { a, b, n } of edgeUse.values()) if (n === 1) outline.push(a[0], a[1], b[0], b[1]);

            faces.push({
                id: `room:${key}:${idx}`,
                key,
                label: '',
                normal: [nx, nz],
                origin: [nx * offset + rx * minU, nz * offset + rz * minU],
                width,
                height: maxY,
                triangles: tris2d.flat(2),
                outline,
                openings: findOpenings(tris2d, width, maxY, outline),
                area,
            });
        }
    }

    // 3. Names: relative to the window wall if there is exactly one, otherwise numbered.
    const windowFaces = faces.filter((f) => f.openings.some((o) => o.kind === 'window'));
    const ref = windowFaces.length === 1 ? windowFaces[0] : null;
    const ordered = [...faces].sort((a, b) => {
        const angle = (f: RoomFace) => Math.atan2(f.normal[1], f.normal[0]);
        return angle(a) - angle(b) || a.origin[0] - b.origin[0];
    });
    ordered.forEach((f, i) => {
        const doors = f.openings.filter((o) => o.kind === 'door').length;
        const suffix = doors ? ' (Tür)' : '';
        if (!ref) {
            f.label = `Raumwand ${i + 1}${suffix}`;
            return;
        }
        if (f === ref) { f.label = 'Fensterwand'; return; }
        // Facing directions relative to the window wall (viewer looks at the window wall).
        const dot = f.normal[0] * ref.normal[0] + f.normal[1] * ref.normal[1];
        // Viewer's right while facing the window wall = up × (−refNormal) … the wall on the right faces left.
        const cross = ref.normal[0] * f.normal[1] - ref.normal[1] * f.normal[0];
        if (dot < -0.9) f.label = `Rückwand${suffix}`;
        else if (Math.abs(dot) < 0.1) f.label = `${cross > 0 ? 'Seitenwand rechts' : 'Seitenwand links'}${suffix}`;
        else f.label = `Raumwand ${i + 1}${suffix}`;
    });
    // Window wall first, then clockwise around the room (right wall, back wall, left wall).
    if (ref) {
        const turn = (f: RoomFace) => {
            const angle = Math.atan2(f.normal[1], f.normal[0]) - Math.atan2(ref.normal[1], ref.normal[0]);
            return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        };
        ordered.sort((a, b) => turn(a) - turn(b) || a.origin[0] - b.origin[0]);
    }
    const seen = new Map<string, number>();
    for (const f of ordered) {
        const n = (seen.get(f.label) ?? 0) + 1;
        seen.set(f.label, n);
        if (n > 1) f.label = `${f.label} ${n}`;
    }

    return ordered.map((f) => ({
        id: f.id, label: f.label, normal: f.normal, origin: f.origin, width: f.width, height: f.height,
        triangles: f.triangles, outline: f.outline, openings: f.openings,
    }));
}

/** Wall-editor frame of a room face. */
export function roomFaceFrame(face: RoomFace): WallFrame {
    const [nx, nz] = face.normal;
    return {
        origin: new THREE.Vector3(face.origin[0], 0, face.origin[1]),
        right: new THREE.Vector3(nz, 0, -nx),
        normal: new THREE.Vector3(nx, 0, nz),
        width: face.width,
        height: face.height,
        bottom: 0,
    };
}
