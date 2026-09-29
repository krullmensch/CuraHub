import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import { collectMeasuredFaces, faceAnnotations, type AnnotationKind } from '@/lib/wallEditor/annotations';
import { wallToWorld, type WallFrame } from '@/lib/wallEditor/geometry';
import { getLabelTexture, onLabelTexturesChanged, type LabelStyle } from '@/lib/measureLabelTextures';
import { WE_COLORS } from './wall-editor/theme';

/**
 * The wall measures of the 2D wall editor (hanging line, heights above the floor, gaps) on every
 * wall with artworks, in the 3D orbit view. Lines lie on the wall; labels are sprites of constant
 * screen size. Both are depth-tested, so a wall in front hides them.
 */

const LINE_WIDTH = 0.005;
/** In front of the wall surface, behind the artworks (they sit further out). */
const LINE_D = 0.003;
const LABEL_D = 0.02;
/**
 * Labels slide along the ray towards the camera: same spot and size on screen, but a camera-facing
 * sprite no longer cuts into its own wall at oblique angles. Seen at a grazing angle the wall comes
 * closer across the label's width by width / tan(angle), so the lift grows with it — capped, so a
 * wall standing in front of the face still hides the label.
 */
const LABEL_MIN_LIFT = 0.05;
const LABEL_MAX_LIFT = 1.5;
const LABEL_MAX_LIFT_SHARE = 0.45;
const KINDS: AnnotationKind[] = ['hanging', 'floor', 'gap'];

const LINE_COLORS: Record<AnnotationKind, string> = {
    hanging: WE_COLORS.hanging,
    floor: '#18181b',
    gap: WE_COLORS.spacing,
};

const LABEL_STYLES: Record<AnnotationKind, LabelStyle> = {
    hanging: { background: WE_COLORS.hanging, color: '#1c1917' },
    floor: { background: 'rgba(24,24,27,0.85)', color: '#ffffff' },
    gap: { background: WE_COLORS.spacing, color: '#ffffff' },
};

const noRaycast = () => {};
const _p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

function pushQuad(out: number[], frame: WallFrame, u1: number, v1: number, u2: number, v2: number): void {
    const du = u2 - u1;
    const dv = v2 - v1;
    const len = Math.hypot(du, dv);
    if (len < 1e-6) return;
    const nu = (-dv / len) * (LINE_WIDTH / 2);
    const nv = (du / len) * (LINE_WIDTH / 2);
    wallToWorld(frame, u1 + nu, v1 + nv, LINE_D, _p[0]);
    wallToWorld(frame, u1 - nu, v1 - nv, LINE_D, _p[1]);
    wallToWorld(frame, u2 - nu, v2 - nv, LINE_D, _p[2]);
    wallToWorld(frame, u2 + nu, v2 + nv, LINE_D, _p[3]);
    for (const i of [0, 1, 2, 0, 2, 3]) out.push(_p[i].x, _p[i].y, _p[i].z);
}

interface PlacedLabel {
    key: string;
    kind: AnnotationKind;
    text: string;
    align: 'center' | 'start';
    position: [number, number, number];
    /** Outward normal (x, z) of the face the label belongs to. */
    normal: [number, number];
}

export const WallMeasurements3D = () => {
    const viewMode = useEditorStore((s) => s.plannerViewMode);
    const instances = useEditorStore((s) => s.localInstances);
    const walls = useEditorStore((s) => s.localWalls);
    const phase = useWallEditorView((s) => s.phase);
    const roomFaces = useWallEditorView((s) => s.roomFaces);
    const showHangingLine = useWallEditorView((s) => s.showHangingLine);
    const showFloorDistances = useWallEditorView((s) => s.showFloorDistances);
    const showGaps = useWallEditorView((s) => s.showGaps);
    const hangingHeight = useWallEditorView((s) => s.hangingHeight);

    const visible = viewMode === 'perspective' && phase === 'idle' && (showHangingLine || showFloorDistances || showGaps);

    const built = useMemo(() => {
        if (!visible) return null;
        const toggles = { showHangingLine, showFloorDistances, showGaps };
        const positions: Record<AnnotationKind, number[]> = { hanging: [], floor: [], gap: [] };
        const labels: PlacedLabel[] = [];
        for (const face of collectMeasuredFaces(instances, walls, roomFaces)) {
            const { segments, labels: faceLabels } = faceAnnotations(face, toggles, hangingHeight);
            for (const s of segments) pushQuad(positions[s.kind], face.frame, s.u1, s.v1, s.u2, s.v2);
            faceLabels.forEach((l, i) => {
                const p = wallToWorld(face.frame, l.u, l.v, LABEL_D);
                labels.push({
                    key: `${face.key}:${i}`, kind: l.kind, text: l.text, align: l.align,
                    position: [p.x, p.y, p.z], normal: [face.frame.normal.x, face.frame.normal.z],
                });
            });
        }
        const geometries = {} as Record<AnnotationKind, THREE.BufferGeometry | null>;
        for (const kind of KINDS) {
            if (positions[kind].length === 0) {
                geometries[kind] = null;
                continue;
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions[kind], 3));
            geometry.computeBoundingSphere();
            geometries[kind] = geometry;
        }
        return { geometries, labels };
    }, [visible, instances, walls, roomFaces, showHangingLine, showFloorDistances, showGaps, hangingHeight]);

    useEffect(() => () => {
        if (built) for (const kind of KINDS) built.geometries[kind]?.dispose();
    }, [built]);

    // Label textures are replaced once the font has loaded.
    const [textureVersion, setTextureVersion] = useState(0);
    useEffect(() => onLabelTexturesChanged(() => setTextureVersion((v) => v + 1)), []);

    if (!built) return null;
    return (
        <group>
            {KINDS.map((kind) => {
                const geometry = built.geometries[kind];
                return geometry ? (
                    <mesh key={kind} geometry={geometry} raycast={noRaycast} renderOrder={10}>
                        <meshBasicMaterial
                            color={LINE_COLORS[kind]}
                            transparent
                            opacity={0.9}
                            depthWrite={false}
                            toneMapped={false}
                            side={THREE.DoubleSide}
                            polygonOffset
                            polygonOffsetFactor={-2}
                            polygonOffsetUnits={-2}
                        />
                    </mesh>
                ) : null;
            })}
            {built.labels.map((l) => (
                <MeasureLabel key={l.key} label={l} textureVersion={textureVersion} />
            ))}
        </group>
    );
};

const CENTER_MID: [number, number] = [0.5, 0.5];
const CENTER_START: [number, number] = [0, 0.5];
const _toCamera = new THREE.Vector3();

const MeasureLabel = ({ label, textureVersion }: { label: PlacedLabel; textureVersion: number }) => {
    const camera = useThree((s) => s.camera);
    const viewportHeight = useThree((s) => s.size.height);
    const tex = useMemo(
        () => getLabelTexture(label.text, LABEL_STYLES[label.kind]),
        // textureVersion: the cache swaps textures after the font loads
        [label.text, label.kind, textureVersion], // eslint-disable-line react-hooks/exhaustive-deps
    );
    // With sizeAttenuation off, a sprite of scale s covers s · cot(fov/2) · H/2 pixels.
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
    const k = (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, viewportHeight);
    const sprite = useRef<THREE.Sprite>(null);
    useFrame(({ camera: cam }) => {
        const s = sprite.current;
        if (!s) return;
        const [x, y, z] = label.position;
        _toCamera.set(cam.position.x - x, cam.position.y - y, cam.position.z - z);
        // Seen from behind its face, a label belongs to the other side of the wall.
        s.visible = _toCamera.x * label.normal[0] + _toCamera.z * label.normal[1] > 0;
        if (!s.visible) return;
        const distance = Math.max(_toCamera.length(), 1e-6);
        const out = _toCamera.x * label.normal[0] + _toCamera.z * label.normal[1];
        const along = Math.sqrt(Math.max(distance * distance - out * out, 0));
        // World width of the label at this distance (the whole pill for start-anchored ones).
        const extent = s.scale.x * distance * (label.align === 'start' ? 1 : 0.5);
        // 1.5: the pill's corners reach further into the wall than its centre line.
        const needed = LABEL_MIN_LIFT + 1.5 * extent * (along / Math.max(out, 1e-3));
        const lift = Math.min(needed, LABEL_MAX_LIFT, distance * LABEL_MAX_LIFT_SHARE);
        _toCamera.multiplyScalar(lift / distance);
        s.position.set(x + _toCamera.x, y + _toCamera.y, z + _toCamera.z);
    });
    return (
        <sprite
            ref={sprite}
            scale={[tex.width * k, tex.height * k, 1]}
            center={label.align === 'start' ? CENTER_START : CENTER_MID}
            raycast={noRaycast}
            renderOrder={11}
        >
            <spriteMaterial map={tex.texture} sizeAttenuation={false} depthWrite={false} transparent toneMapped={false} />
        </sprite>
    );
};
