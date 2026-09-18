import * as THREE from 'three';
import { FRAME_PROFILES, type FrameProfileId, type FrameProfileSpec } from './frameStyles';

// Frame geometry, generated from the profile cross-sections in frameStyles.
//
// A frame is drawn as 4 corner pieces and 4 straight edges, all from two geometries per profile,
// so FrameInstancer can draw every frame of a style with two instanced meshes (RND-01):
//
//   corner: the W × W square outside one corner of the opening, split along the 45° mitre into
//           the ends of the two mouldings that meet there — fixed size, never scaled.
//   edge:   the moulding along one side of the opening, 1 m long; its instance stretches it to
//           the opening's width or height. Only the length is scaled, never the cross-section.
//
// Both are built for the bottom-left corner / bottom side of the opening (frame below y = 0 and
// left of x = 0, the wall at z = 0, the front at z = depth); the instance matrices rotate them
// into place. Corners and edges meet exactly at the opening's corners and share no faces, so
// there is nothing to z-fight.
//
// UVs: U runs along the moulding in metres (the edge's 1 m stands for whatever length it is
// stretched to — the wood grain is long streaks, so that stretch doesn't show), V is the
// distance around the cross-section in metres, starting on the hidden back face. A texture
// painted with the grain along U therefore wraps around the profile like a real veneer and
// turns the corner at the mitre.

const MM = 0.001;
/** Line segments per quarter circle of a rounded edge. */
const ARC_SEGMENTS = 6;
/** How far (mm) the inner reveal continues behind the picture surface. */
const LIP_OVERLAP = 2;

interface OutlinePoint {
    c: number;
    z: number;
    /** Index of the rounded corner this point lies on, -1 on straight runs. */
    fillet: number;
    /** Outward normal of the rounding at this point (only for fillet points). */
    nc: number;
    nz: number;
}

interface Corner {
    c: number;
    z: number;
    radius: number;
}

/**
 * Closed cross-section of a profile, counter-clockwise in (c, z), starting on the back face.
 *
 *        inner front edge ┌──────────────────┐ outer front edge
 *                  reveal │                  │
 *                         └────────────┐     │ outer side
 *                                      │body │
 *                                      └─────┘ back (against the wall)
 *
 * The visible faces are the front, the outer side and the inner reveal down to the picture;
 * the underside of the front plate and the inside of the body hide behind picture and glass.
 */
function profileCorners(profile: FrameProfileSpec): Corner[] {
    const W = profile.width * MM;
    const D = profile.depth * MM;
    // The reveal reaches a little past the picture surface, so no sliver of the hollow profile
    // shows between the picture's edge and the lip at a grazing angle.
    const R = (profile.reveal + LIP_OVERLAP) * MM;
    const B = Math.min(profile.body, profile.width) * MM;
    return [
        { c: W - B, z: 0, radius: 0 },
        { c: W, z: 0, radius: profile.backRadius * MM },
        { c: W, z: D, radius: profile.outerRadius * MM },
        { c: 0, z: D, radius: profile.innerRadius * MM },
        { c: 0, z: D - R, radius: 0 },
        { c: W - B, z: D - R, radius: 0 },
    ];
}

/** Replaces every rounded 90° corner by an arc of short segments. */
function buildOutline(corners: Corner[]): OutlinePoint[] {
    const points: OutlinePoint[] = [];
    const n = corners.length;
    corners.forEach((corner, i) => {
        const prev = corners[(i + n - 1) % n];
        const next = corners[(i + 1) % n];
        if (corner.radius <= 0) {
            points.push({ c: corner.c, z: corner.z, fillet: -1, nc: 0, nz: 0 });
            return;
        }
        const inLen = Math.hypot(corner.c - prev.c, corner.z - prev.z);
        const outLen = Math.hypot(next.c - corner.c, next.z - corner.z);
        const r = Math.min(corner.radius, inLen / 2, outLen / 2);
        const d1c = (corner.c - prev.c) / inLen, d1z = (corner.z - prev.z) / inLen;
        const d2c = (next.c - corner.c) / outLen, d2z = (next.z - corner.z) / outLen;
        // Right angle: the centre sits r back along the incoming and r along the outgoing side.
        const cc = corner.c - d1c * r + d2c * r;
        const cz = corner.z - d1z * r + d2z * r;
        const a0 = Math.atan2(corner.z - d1z * r - cz, corner.c - d1c * r - cc);
        const a1 = Math.atan2(corner.z + d2z * r - cz, corner.c + d2c * r - cc);
        let sweep = a1 - a0;
        if (sweep > Math.PI) sweep -= 2 * Math.PI;
        if (sweep < -Math.PI) sweep += 2 * Math.PI;
        for (let k = 0; k <= ARC_SEGMENTS; k++) {
            const a = a0 + (sweep * k) / ARC_SEGMENTS;
            points.push({ c: cc + Math.cos(a) * r, z: cz + Math.sin(a) * r, fillet: i, nc: Math.cos(a), nz: Math.sin(a) });
        }
    });
    return points;
}

interface Segment {
    a: OutlinePoint;
    b: OutlinePoint;
    /** Normals at a and b, (c, z). */
    na: [number, number];
    nb: [number, number];
    /** Distance around the profile at a and b (texture V). */
    va: number;
    vb: number;
}

function outlineSegments(outline: OutlinePoint[]): Segment[] {
    const segments: Segment[] = [];
    let v = 0;
    for (let i = 0; i < outline.length; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        const len = Math.hypot(b.c - a.c, b.z - a.z);
        if (len < 1e-9) continue;
        // Counter-clockwise outline: the outside is to the right of the direction of travel.
        const flat: [number, number] = [(b.z - a.z) / len, -(b.c - a.c) / len];
        const onArc = a.fillet >= 0 && a.fillet === b.fillet;
        segments.push({
            a, b,
            na: onArc ? [a.nc, a.nz] : flat,
            nb: onArc ? [b.nc, b.nz] : flat,
            va: v,
            vb: v + len,
        });
        v += len;
    }
    return segments;
}

/** Collects quads into a non-indexed geometry (shared with the passepartout board). */
export class GeometryWriter {
    readonly positions: number[] = [];
    readonly normals: number[] = [];
    readonly uvs: number[] = [];
    readonly colors: number[] = [];
    private readonly withColors: boolean;

    /** `withColors`: every quad passes per-vertex colours (e.g. baked shading). */
    constructor(withColors = false) {
        this.withColors = withColors;
    }

    /** Quad p0-p1-p2-p3 as two triangles, wound so they face along the given normals. */
    quad(p: number[][], n: number[][], uv: number[][], color?: number[][]): void {
        // Cross product of the diagonals: the loop's orientation even when two corners coincide
        // (the corner pieces' trapezoids collapse to triangles at the opening's corner).
        const e1 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
        const e2 = [p[3][0] - p[1][0], p[3][1] - p[1][1], p[3][2] - p[1][2]];
        const face = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const avg = [0, 1, 2].map((k) => n[0][k] + n[1][k] + n[2][k] + n[3][k]);
        const order = face[0] * avg[0] + face[1] * avg[1] + face[2] * avg[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const i of order) {
            this.positions.push(p[i][0], p[i][1], p[i][2]);
            this.normals.push(n[i][0], n[i][1], n[i][2]);
            this.uvs.push(uv[i][0], uv[i][1]);
            if (this.withColors) {
                const c = color?.[i] ?? [1, 1, 1];
                this.colors.push(c[0], c[1], c[2]);
            }
        }
    }

    build(): THREE.BufferGeometry {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
        if (this.withColors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }
}

/** The bottom moulding, x ∈ [0, 1] m, frame below y = 0. */
function buildEdge(segments: Segment[]): THREE.BufferGeometry {
    const out = new GeometryWriter();
    for (const { a, b, na, nb, va, vb } of segments) {
        out.quad(
            [[0, -a.c, a.z], [1, -a.c, a.z], [1, -b.c, b.z], [0, -b.c, b.z]],
            [[0, -na[0], na[1]], [0, -na[0], na[1]], [0, -nb[0], nb[1]], [0, -nb[0], nb[1]]],
            [[0, va], [1, va], [1, vb], [0, vb]],
        );
    }
    return out.build();
}

/**
 * The bottom-left corner square, x and y ∈ [-W, 0]: the end of the bottom moulding below the
 * mitre (y < x) and the end of the left moulding above it.
 */
function buildCorner(segments: Segment[]): THREE.BufferGeometry {
    const out = new GeometryWriter();
    for (const { a, b, na, nb, va, vb } of segments) {
        // Bottom moulding: runs along +x, its profile spans y = -c; cut where x = -c.
        out.quad(
            [[-a.c, -a.c, a.z], [0, -a.c, a.z], [0, -b.c, b.z], [-b.c, -b.c, b.z]],
            [[0, -na[0], na[1]], [0, -na[0], na[1]], [0, -nb[0], nb[1]], [0, -nb[0], nb[1]]],
            [[-a.c, va], [0, va], [0, vb], [-b.c, vb]],
        );
        // Left moulding: runs along +y, its profile spans x = -c; cut where y = -c.
        out.quad(
            [[-a.c, -a.c, a.z], [-a.c, 0, a.z], [-b.c, 0, b.z], [-b.c, -b.c, b.z]],
            [[-na[0], 0, na[1]], [-na[0], 0, na[1]], [-nb[0], 0, nb[1]], [-nb[0], 0, nb[1]]],
            [[-a.c, va], [0, va], [0, vb], [-b.c, vb]],
        );
    }
    return out.build();
}

export interface FrameParts {
    cornerGeometry: THREE.BufferGeometry;
    edgeGeometry: THREE.BufferGeometry;
}

const partsCache = new Map<FrameProfileId, FrameParts>();

/** Corner and edge geometry of a profile, built once and shared by every frame using it. */
export function getFrameParts(profileId: FrameProfileId): FrameParts {
    let parts = partsCache.get(profileId);
    if (!parts) {
        const segments = outlineSegments(buildOutline(profileCorners(FRAME_PROFILES[profileId])));
        parts = { cornerGeometry: buildCorner(segments), edgeGeometry: buildEdge(segments) };
        partsCache.set(profileId, parts);
    }
    return parts;
}

export interface FramePartTransform {
    position: [number, number, number];
    /** Rotation about z (the frame lies in the xy plane). */
    angle: number;
    /** Stretch along the moulding (edges), 1 for corners. */
    length: number;
}

/**
 * Local transforms of the 4 corners and 4 edges around an opening of `width` × `height` metres,
 * centred on the origin. Independent of the profile: corners carry their own size, edges only
 * stretch in length.
 */
export function getFramePartTransforms(width: number, height: number): { corners: FramePartTransform[]; edges: FramePartTransform[] } {
    const hw = width / 2;
    const hh = height / 2;
    const q = Math.PI / 2;
    return {
        corners: [
            { position: [-hw, -hh, 0], angle: 0, length: 1 },
            { position: [hw, -hh, 0], angle: q, length: 1 },
            { position: [hw, hh, 0], angle: 2 * q, length: 1 },
            { position: [-hw, hh, 0], angle: 3 * q, length: 1 },
        ],
        edges: [
            { position: [-hw, -hh, 0], angle: 0, length: width },
            { position: [hw, -hh, 0], angle: q, length: height },
            { position: [hw, hh, 0], angle: 2 * q, length: width },
            { position: [-hw, hh, 0], angle: 3 * q, length: height },
        ],
    };
}

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _axis = new THREE.Vector3(0, 0, 1);

export function composePartMatrix(part: FramePartTransform, target: THREE.Matrix4): THREE.Matrix4 {
    _position.fromArray(part.position);
    _quaternion.setFromAxisAngle(_axis, part.angle);
    _scale.set(Math.max(part.length, 1e-6), 1, 1);
    return target.compose(_position, _quaternion, _scale);
}
