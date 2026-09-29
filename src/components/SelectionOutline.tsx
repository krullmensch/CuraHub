import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { instanceRefMap, useEditorStore, WALL_PLACEMENT_OFFSET, type ArtworkInstanceData } from '@/store/editorStore';
import { artworkFrameLayout } from '@/lib/wallEditor/footprint';
import { SplatHitProxy } from '@/lib/splats';
import { WE_COLORS } from './wall-editor/theme';

/**
 * Outline of the selected artwork: its corners (in the artwork group's local space) are projected
 * every frame and written into one SVG path over the canvas. SVG instead of 3D lines gives a real
 * pixel width and works the same on WebGPU and WebGL (drei's Line uses a ShaderMaterial).
 */

let pathElement: SVGPathElement | null = null;

const setPath = (d: string) => {
    if (pathElement && pathElement.getAttribute('d') !== d) pathElement.setAttribute('d', d);
};

export const SelectionOutlineSvg = () => (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
        <path
            ref={(el) => { pathElement = el; }}
            fill="none"
            stroke={WE_COLORS.select}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
        />
    </svg>
);

interface OutlineShape {
    points: THREE.Vector3[];
    edges: [number, number][];
}

const RECT_EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]];
// Corner i: x = bit 0, y = bit 1, z = bit 2.
const BOX_EDGES: [number, number][] = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
];

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
        if (o instanceof SplatHitProxy) {
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

function outlineShape(inst: ArtworkInstanceData, group: THREE.Object3D): OutlineShape | null {
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

export const SelectionOutlineTracker = () => {
    const instance = useEditorStore((s) =>
        s.selectedInstanceId === null ? null : s.localInstances.find((i) => i.id === s.selectedInstanceId) ?? null);
    const active = useEditorStore((s) => s.plannerViewMode !== 'firstPerson' && !s.wallEditor);
    const shape = useRef<OutlineShape | null>(null);
    const screen = useRef<{ x: number; y: number }[]>([]);

    useEffect(() => {
        shape.current = null;
        if (!active || !instance) setPath('');
    }, [instance, active]);
    useEffect(() => () => setPath(''), []);

    useFrame(({ camera, size }) => {
        if (!active || !instance) return;
        const group = instanceRefMap.get(instance.id);
        if (!group) {
            setPath('');
            return;
        }
        // Models and splats load asynchronously: retry until they have bounds.
        if (!shape.current) shape.current = outlineShape(instance, group);
        const current = shape.current;
        if (!current) {
            setPath('');
            return;
        }
        group.updateWorldMatrix(true, false);
        const perspective = camera instanceof THREE.PerspectiveCamera;
        screen.current.length = 0;
        for (const p of current.points) {
            _world.copy(p).applyMatrix4(group.matrixWorld);
            // A corner behind the camera would project to the wrong side of the screen.
            if (perspective && _view.copy(_world).applyMatrix4(camera.matrixWorldInverse).z > -camera.near) {
                setPath('');
                return;
            }
            _world.project(camera);
            screen.current.push({ x: ((_world.x + 1) / 2) * size.width, y: ((1 - _world.y) / 2) * size.height });
        }
        const pts = screen.current;
        setPath(current.edges
            .map(([a, b]) => `M${pts[a].x.toFixed(1)} ${pts[a].y.toFixed(1)}L${pts[b].x.toFixed(1)} ${pts[b].y.toFixed(1)}`)
            .join(''));
    });

    return null;
};
