import type { ArtworkInstanceData, ModularWallData } from '@/store/editorStore';
import { resolveFace, targetForInstance, targetKey, type WallEditorTarget } from './faces';
import { collectWallFace, type WallFace } from './wallArtworks';
import { centerX, centerY, rowGaps, type Rect } from './layout';
import { formatCm } from './format';
import type { MeasureToggles } from './measureToggles';
import type { RoomFace } from './roomFaces';

/**
 * Wall measures (hanging line, heights above the floor, gaps) in wall coordinates, for any face —
 * not only the one open in the 2D wall editor. Renderers map (u, v) to screen or world themselves.
 */

export type AnnotationKind = 'hanging' | 'floor' | 'gap';

export interface AnnotationSegment {
    kind: AnnotationKind;
    u1: number;
    v1: number;
    u2: number;
    v2: number;
}

export interface AnnotationLabel {
    kind: AnnotationKind;
    u: number;
    v: number;
    text: string;
    /** 'start' = the label begins at (u, v), 'center' = it is centred on it. */
    align: 'center' | 'start';
}

export interface FaceAnnotations {
    segments: AnnotationSegment[];
    labels: AnnotationLabel[];
}

/** Vertical line from an artwork's bottom edge to the floor, labelled with its centre height. */
export interface FloorLeader {
    id: number;
    u: number;
    /** Bottom edge of the artwork. */
    top: number;
    /** The floor (face bottom). */
    bottom: number;
    /** Centre height above the floor. */
    value: number;
    /** Where the label sits: half way down the line. */
    labelV: number;
}

export const HANGING_DASH = 0.06;
export const HANGING_GAP = 0.04;
/** Length of the end caps across a dimension line. */
export const END_CAP = 0.04;

const MIN_LEADER = 0.005;

/** Every face (modular wall side or room wall) that carries at least one artwork. */
export function collectMeasuredFaces(instances: ArtworkInstanceData[], walls: ModularWallData[], roomFaces: RoomFace[]): WallFace[] {
    const groups = new Map<string, { target: WallEditorTarget; instances: ArtworkInstanceData[] }>();
    for (const inst of instances) {
        const target = targetForInstance(inst, walls, roomFaces);
        if (!target) continue;
        const key = targetKey(target);
        const group = groups.get(key);
        if (group) group.instances.push(inst);
        else groups.set(key, { target, instances: [inst] });
    }
    const faces: WallFace[] = [];
    for (const { target, instances: onFace } of groups.values()) {
        const resolved = resolveFace(target, walls, roomFaces);
        if (!resolved) continue;
        const face = collectWallFace(resolved, onFace);
        if (face.items.length > 0) faces.push(face);
    }
    return faces;
}

export function floorLeaders(items: { id: number; rect: Rect }[], floorY: number): FloorLeader[] {
    const leaders: FloorLeader[] = [];
    for (const { id, rect } of items) {
        if (rect.y - floorY <= MIN_LEADER) continue;
        leaders.push({
            id,
            u: centerX(rect),
            top: rect.y,
            bottom: floorY,
            value: centerY(rect) - floorY,
            labelV: (rect.y + floorY) / 2,
        });
    }
    return leaders;
}

const hCaps = (kind: AnnotationKind, u: number, v: number): AnnotationSegment =>
    ({ kind, u1: u - END_CAP / 2, v1: v, u2: u + END_CAP / 2, v2: v });
const vCaps = (kind: AnnotationKind, u: number, v: number): AnnotationSegment =>
    ({ kind, u1: u, v1: v - END_CAP / 2, u2: u, v2: v + END_CAP / 2 });

export function faceAnnotations(
    face: { wallRect: Rect; items: { id: number; rect: Rect }[] },
    toggles: MeasureToggles,
    hangingHeight: number,
): FaceAnnotations {
    const segments: AnnotationSegment[] = [];
    const labels: AnnotationLabel[] = [];
    const { wallRect } = face;

    // A hanging height above the face would float over the wall — skip it there.
    if (toggles.showHangingLine && hangingHeight <= wallRect.h) {
        const v = wallRect.y + hangingHeight;
        const step = HANGING_DASH + HANGING_GAP;
        // Indexed, not accumulated, so float drift cannot add or drop a dash.
        const count = Math.ceil(wallRect.w / step);
        for (let i = 0; i < count; i++) {
            const u = i * step;
            segments.push({ kind: 'hanging', u1: u, v1: v, u2: Math.min(u + HANGING_DASH, wallRect.w), v2: v });
        }
        labels.push({ kind: 'hanging', u: 0.05, v: v + 0.05, text: `Hängehöhe ${formatCm(hangingHeight)}`, align: 'start' });
    }

    if (toggles.showFloorDistances) {
        for (const l of floorLeaders(face.items, wallRect.y)) {
            segments.push({ kind: 'floor', u1: l.u, v1: l.top, u2: l.u, v2: l.bottom });
            segments.push(hCaps('floor', l.u, l.top), hCaps('floor', l.u, l.bottom));
            labels.push({ kind: 'floor', u: l.u, v: l.labelV, text: `Mitte ${formatCm(l.value)}`, align: 'center' });
        }
    }

    if (toggles.showGaps) {
        for (const m of rowGaps(face.items.map((i) => i.rect))) {
            segments.push({ kind: 'gap', u1: m.x1, v1: m.y1, u2: m.x2, v2: m.y2 });
            segments.push(vCaps('gap', m.x1, m.y1), vCaps('gap', m.x2, m.y2));
            labels.push({ kind: 'gap', u: (m.x1 + m.x2) / 2, v: (m.y1 + m.y2) / 2, text: formatCm(m.value), align: 'center' });
        }
    }

    return { segments, labels };
}
