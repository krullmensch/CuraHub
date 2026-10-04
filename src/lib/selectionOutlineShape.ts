import * as THREE from 'three';
import { WALL_PLACEMENT_OFFSET, type ArtworkInstanceData } from '@/store/editorStore';
import { artworkFrameLayout } from '@/lib/wallEditor/footprint';
import { BoxHitProxy } from '@/lib/boxHitProxy';
import { BOX_EDGES, visibleBoxEdges, type BoxEdge } from '@/lib/boxOutline';

/**
 * Outline shapes of objects in their group's local space, projected to SVG path data
 * (SelectionOutline for the own selection, RemoteSelections for other people's).
 */

export interface OutlineShape {
    points: THREE.Vector3[];
    edges: [number, number][];
}

const RECT_EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]];

const EPS = 1e-4;
const safe = (s: number) => (Math.abs(s) > EPS ? s : 1);

const _inverse = new THREE.Matrix4();
const _relative = new THREE.Matrix4();
const _meshBox = new THREE.Box3();

/** Bounds of the group's meshes in the group's local space (null until something has loaded). */
function localBounds(group: THREE.Object3D): THREE.Box3 | null {
    group.updateWorldMatrix(true, true);
    _inverse.copy(group.matrixWorld).invert();
    let flagged = false;
    group.traverse((o) => { if (o.userData.selectionBounds) flagged = true; });
    const box = new THREE.Box3();
    group.traverse((o) => {
        if (o instanceof BoxHitProxy) {
            if (!o.box.isEmpty()) {
                _relative.multiplyMatrices(_inverse, o.matrixWorld);
                box.union(_meshBox.copy(o.box).applyMatrix4(_relative));
            }
            return;
        }
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        if (flagged ? !o.userData.selectionBounds : o.userData.wallEditorIgnore) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox;
        if (!bb || bb.isEmpty()) return;
        _relative.multiplyMatrices(_inverse, mesh.matrixWorld);
        box.union(_meshBox.copy(bb).applyMatrix4(_relative));
    });
    return box.isEmpty() ? null : box;
}

export function outlineShape(inst: ArtworkInstanceData, group: THREE.Object3D): OutlineShape | null {
    const type = inst.artwork.asset.type ?? 'image';
    if (type === 'image') {
        // The frame is instanced elsewhere, so it is computed from the layout. The layout is in
        // unscaled metres; the group carries the instance scale.
        const layout = artworkFrameLayout(inst);
        const sx = safe(inst.scale_x);
        const sy = safe(inst.scale_y);
        const z = (-WALL_PLACEMENT_OFFSET + layout.depth) / safe(inst.scale_z);
        return {
            points: [
                new THREE.Vector3(layout.left / sx, layout.bottom / sy, z),
                new THREE.Vector3(layout.right / sx, layout.bottom / sy, z),
                new THREE.Vector3(layout.right / sx, layout.top / sy, z),
                new THREE.Vector3(layout.left / sx, layout.top / sy, z),
            ],
            edges: RECT_EDGES,
        };
    }
    const box = localBounds(group);
    if (!box) return null;
    if (type === 'video') {
        const z = box.max.z;
        return {
            points: [
                new THREE.Vector3(box.min.x, box.min.y, z),
                new THREE.Vector3(box.max.x, box.min.y, z),
                new THREE.Vector3(box.max.x, box.max.y, z),
                new THREE.Vector3(box.min.x, box.max.y, z),
            ],
            edges: RECT_EDGES,
        };
    }
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
        points.push(new THREE.Vector3(
            i & 1 ? box.max.x : box.min.x,
            i & 2 ? box.max.y : box.min.y,
            i & 4 ? box.max.z : box.min.z,
        ));
    }
    return { points, edges: BOX_EDGES };
}

const _world = new THREE.Vector3();
const _view = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _corners: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3());
const _visibleEdges: BoxEdge[] = [];

/** Projects the shape's edges to an SVG path segment ('' while a corner is behind the camera). */
export function projectShape(
    shape: OutlineShape, group: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number },
): string {
    const perspective = camera instanceof THREE.PerspectiveCamera;
    group.updateWorldMatrix(true, false);
    const isBox = shape.edges === BOX_EDGES;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < shape.points.length; i++) {
        _world.copy(shape.points[i]).applyMatrix4(group.matrixWorld);
        if (isBox) _corners[i].copy(_world);
        // A corner behind the camera would project to the wrong side of the screen.
        if (perspective && _view.copy(_world).applyMatrix4(camera.matrixWorldInverse).z > -camera.near) return '';
        _world.project(camera);
        pts.push({ x: ((_world.x + 1) / 2) * size.width, y: ((1 - _world.y) / 2) * size.height });
    }
    let edges = shape.edges;
    if (isBox) {
        // Solid boxes: no edges that only border faces turned away from the camera.
        edges = perspective
            ? visibleBoxEdges(_corners, { position: _eye.setFromMatrixPosition(camera.matrixWorld) }, _visibleEdges)
            : visibleBoxEdges(_corners, { direction: camera.getWorldDirection(_eye) }, _visibleEdges);
    }
    let d = '';
    for (const [a, b] of edges) {
        d += `M${pts[a].x.toFixed(1)} ${pts[a].y.toFixed(1)}L${pts[b].x.toFixed(1)} ${pts[b].y.toFixed(1)}`;
    }
    return d;
}


/** Box outline of any group (modular walls, scale figures), from its meshes. */
export function boxShape(group: THREE.Object3D): OutlineShape | null {
    const box = localBounds(group);
    if (!box) return null;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
        points.push(new THREE.Vector3(
            i & 1 ? box.max.x : box.min.x,
            i & 2 ? box.max.y : box.min.y,
            i & 4 ? box.max.z : box.min.z,
        ));
    }
    return { points, edges: BOX_EDGES };
}
