import * as THREE from 'three';
import {
    BASE_CORNER_ARM,
    BASE_FACE_WIDTH,
    BASE_PROFILE_DEPTH,
    BASE_PROFILE_PERIMETER,
    frameStyle,
    type FrameStyleId,
} from './frameStyles';

// Shared by ModularFrame (single frame, e.g. the drag ghost) and FrameInstancer (all placed
// frames in two instanced draw calls per style, RND-01), so both stay geometrically identical.

export const FRAME_MODEL = '/models/Halbe_Classic_Alu8.glb';
const CORNER_MESH_NAME = 'Halbe_Classic_Alu8_Corner';
const EDGE_MESH_NAME = 'Halbe_Classic_Alu8_Edge';

/**
 * Gap (per side, per axis) left between an edge and the corner it butts against.
 *
 * FRAME-01: this used to be paired with a 9 mm corner arm, but the corner reaches 11 mm along
 * each picture edge (see BASE_CORNER_ARM). Every edge therefore ran 1.5 mm *into* both of its
 * corners, and because the two pieces share the exact same cross-section that overlap was four
 * pairs of perfectly coplanar faces — the z-fighting that flickered around every corner. With
 * the correct arm length the pieces only touch, and 0.2 mm keeps their end caps from becoming
 * coincident without opening a seam anyone can see (0.2 mm is well under a pixel at any
 * distance the frame is actually looked at).
 */
const EDGE_SEAM_GAP = 0.0002;

export interface FrameParts {
    cornerGeometry: THREE.BufferGeometry;
    /** The anodised aluminium material that ships with the GLB. */
    baseMaterial: THREE.Material;
    edgeGeometry: THREE.BufferGeometry;
}

export interface FramePartTransform {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
}

/**
 * Replaces the GLB's box unwrap with a profile unwrap: U runs along the profile (in meters of
 * local space) and V wraps exactly once around its cross-section, normalised to 0..1.
 *
 * The walk around the cross-section is inner flank → front face → outer flank → back face, so
 * a wood grain painted across V continues around the profile instead of jumping at every
 * edge. U carries almost no grain detail, which is what lets an edge be stretched to the
 * artwork's width without the grain stretching with it.
 *
 * The corner is an L of two arms; each vertex is assigned to the arm it belongs to (the mitre
 * runs along z = -x through the junction) so both arms get the same cross-section mapping.
 */
function applyProfileUVs(source: THREE.BufferGeometry, isCorner: boolean): THREE.BufferGeometry {
    const geometry = source.clone();
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const uv = new Float32Array(position.count * 2);
    const D = BASE_PROFILE_DEPTH;
    const F = BASE_FACE_WIDTH;

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);

        // Arm B runs along +X, arm A along -Z; the edge mesh is always "arm B".
        const armB = !isCorner || (x > 0 ? true : z < 0 ? false : z < -x);
        const along = armB ? x : z;                 // position along the profile
        const cross = armB ? z : -x;                // 0 at the picture, F at the outside
        const alongNormal = armB ? nx : nz;
        const crossNormal = armB ? nz : -nx;

        const an = Math.abs(ny), aa = Math.abs(alongNormal), ac = Math.abs(crossNormal);
        let u: number, v: number;
        if (an >= aa && an >= ac) {
            u = along;
            v = ny > 0 ? D + cross : 2 * D + F + (F - cross);
        } else if (ac >= aa) {
            u = along;
            v = crossNormal < 0 ? y : D + F + (D - y);
        } else {
            // Mitre / end cap: seen only inside a joint, so any consistent mapping will do.
            u = cross;
            v = y;
        }
        uv[i * 2] = u;
        uv[i * 2 + 1] = v / BASE_PROFILE_PERIMETER;
    }

    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geometry;
}

// One re-unwrapped copy per loaded GLB scene, shared by every style and every frame.
const partsCache = new WeakMap<THREE.Object3D, FrameParts>();

/** Finds the corner and edge meshes in the loaded frame GLB and re-unwraps them for wood. */
export function extractFrameParts(scene: THREE.Object3D): FrameParts {
    const cached = partsCache.get(scene);
    if (cached) return cached;

    let corner: THREE.Mesh | null = null;
    let edge: THREE.Mesh | null = null;
    scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.name === CORNER_MESH_NAME) corner = mesh;
        else if (mesh.name === EDGE_MESH_NAME) edge = mesh;
    });
    if (!corner || !edge) {
        throw new Error(`ModularFrame: expected meshes "${CORNER_MESH_NAME}" and "${EDGE_MESH_NAME}" in ${FRAME_MODEL}`);
    }
    const c = corner as THREE.Mesh;
    const e = edge as THREE.Mesh;

    if (import.meta.env.DEV) {
        c.geometry.computeBoundingBox();
        const arm = c.geometry.boundingBox?.max.x ?? BASE_CORNER_ARM;
        if (Math.abs(arm - BASE_CORNER_ARM) > 1e-6) {
            console.warn(
                `[ModularFrame] corner arm is ${arm} m but BASE_CORNER_ARM is ${BASE_CORNER_ARM} m — ` +
                'edges and corners will overlap or leave a gap. Update BASE_CORNER_ARM in frameStyles.ts.',
            );
        }
    }

    const parts: FrameParts = {
        cornerGeometry: applyProfileUVs(c.geometry, true),
        edgeGeometry: applyProfileUVs(e.geometry, false),
        baseMaterial: c.material as THREE.Material,
    };
    partsCache.set(scene, parts);
    return parts;
}

/**
 * Local transforms of the 4 corners and 4 edges for an inner picture size in meters.
 *
 * The style scales the profile's cross-section only: `faceScale` widens the visible band
 * around the picture (and with it the corner arms), `depthScale` sets how far the frame stands
 * off the wall. The picture opening itself is always exactly width × height.
 */
export function getFramePartTransforms(
    width: number,
    height: number,
    styleId: FrameStyleId,
): { corners: FramePartTransform[]; edges: FramePartTransform[] } {
    const { faceScale: s, depthScale: d } = frameStyle(styleId);
    const armLength = BASE_CORNER_ARM * s;
    const xEdgeScale = Math.max(0, width - 2 * (armLength + EDGE_SEAM_GAP));
    const yEdgeScale = Math.max(0, height - 2 * (armLength + EDGE_SEAM_GAP));
    const hw = width / 2;
    const hh = height / 2;
    // Local Y is the profile depth, local X and Z span the frame plane.
    const cornerScale: [number, number, number] = [s, d, s];
    return {
        corners: [
            { position: [hw, hh, 0], rotation: [Math.PI / 2, Math.PI, 0], scale: cornerScale },
            { position: [-hw, hh, 0], rotation: [Math.PI / 2, -Math.PI / 2, 0], scale: cornerScale },
            { position: [-hw, -hh, 0], rotation: [Math.PI / 2, 0, 0], scale: cornerScale },
            { position: [hw, -hh, 0], rotation: [Math.PI / 2, Math.PI / 2, 0], scale: cornerScale },
        ],
        // Local X is the edge's length axis, local Y its depth, local Z its face width.
        edges: [
            { position: [0, hh, 0], rotation: [Math.PI / 2, Math.PI, 0], scale: [xEdgeScale, d, s] },
            { position: [0, -hh, 0], rotation: [Math.PI / 2, 0, 0], scale: [xEdgeScale, d, s] },
            { position: [-hw, 0, 0], rotation: [Math.PI / 2, -Math.PI / 2, 0], scale: [yEdgeScale, d, s] },
            { position: [hw, 0, 0], rotation: [0, Math.PI / 2, Math.PI / 2], scale: [yEdgeScale, d, s] },
        ],
    };
}

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();

export function composePartMatrix(part: FramePartTransform, target: THREE.Matrix4): THREE.Matrix4 {
    _position.fromArray(part.position);
    _quaternion.setFromEuler(_euler.set(part.rotation[0], part.rotation[1], part.rotation[2]));
    _scale.fromArray(part.scale);
    return target.compose(_position, _quaternion, _scale);
}
