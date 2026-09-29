import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
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
                labels.push({ key: `${face.key}:${i}`, kind: l.kind, text: l.text, align: l.align, position: [p.x, p.y, p.z] });
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
    return (
        <sprite
            position={label.position}
            scale={[tex.width * k, tex.height * k, 1]}
            center={label.align === 'start' ? CENTER_START : CENTER_MID}
            raycast={noRaycast}
            renderOrder={11}
        >
            <spriteMaterial map={tex.texture} sizeAttenuation={false} depthWrite={false} transparent toneMapped={false} />
        </sprite>
    );
};
