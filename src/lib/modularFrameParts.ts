import * as THREE from 'three';

// Shared by ModularFrame (single frame, e.g. the drag ghost) and FrameInstancer (all placed
// frames in two instanced draw calls, RND-01), so both stay geometrically identical.

export const FRAME_MODEL = '/models/Halbe_Classic_Alu8.glb';
const CORNER_MESH_NAME = 'Halbe_Classic_Alu8_Corner';
const EDGE_MESH_NAME = 'Halbe_Classic_Alu8_Edge';

// Extracted via Blender MCP from Halbe_Classic_Alu8_Corner bounding box.
// The corner's origin sits at the inner picture vertex; the mesh extends
// 0.009 m inward (-X / -Y) along the picture edges.
const CORNER_ARM_LENGTH = 0.009;
// Small safety gap (per side, per axis) to prevent edge↔corner overlap and
// the resulting z-fighting artifacts where the two meshes meet.
const EDGE_SEAM_GAP = 0.0005;

export interface FrameParts {
    cornerGeometry: THREE.BufferGeometry;
    cornerMaterial: THREE.Material;
    edgeGeometry: THREE.BufferGeometry;
    edgeMaterial: THREE.Material;
}

export interface FramePartTransform {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
}

/** Finds the corner and edge meshes in the loaded frame GLB (read-only, no cloning). */
export function extractFrameParts(scene: THREE.Object3D): FrameParts {
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
    return {
        cornerGeometry: c.geometry,
        cornerMaterial: c.material as THREE.Material,
        edgeGeometry: e.geometry,
        edgeMaterial: e.material as THREE.Material,
    };
}

/** Local transforms of the 4 corners and 4 edges for an inner picture size in meters. */
export function getFramePartTransforms(width: number, height: number): { corners: FramePartTransform[]; edges: FramePartTransform[] } {
    const xEdgeScale = Math.max(0, width - 2 * (CORNER_ARM_LENGTH + EDGE_SEAM_GAP));
    const yEdgeScale = Math.max(0, height - 2 * (CORNER_ARM_LENGTH + EDGE_SEAM_GAP));
    const hw = width / 2;
    const hh = height / 2;
    return {
        corners: [
            { position: [hw, hh, 0], rotation: [Math.PI / 2, Math.PI, 0], scale: [1, 1, 1] },
            { position: [-hw, hh, 0], rotation: [Math.PI / 2, -Math.PI / 2, 0], scale: [1, 1, 1] },
            { position: [-hw, -hh, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 1] },
            { position: [hw, -hh, 0], rotation: [Math.PI / 2, Math.PI / 2, 0], scale: [1, 1, 1] },
        ],
        // Local X is the edge's length axis.
        edges: [
            { position: [0, hh, 0], rotation: [Math.PI / 2, Math.PI, 0], scale: [xEdgeScale, 1, 1] },
            { position: [0, -hh, 0], rotation: [Math.PI / 2, 0, 0], scale: [xEdgeScale, 1, 1] },
            { position: [-hw, 0, 0], rotation: [Math.PI / 2, -Math.PI / 2, 0], scale: [yEdgeScale, 1, 1] },
            { position: [hw, 0, 0], rotation: [0, Math.PI / 2, Math.PI / 2], scale: [yEdgeScale, 1, 1] },
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
