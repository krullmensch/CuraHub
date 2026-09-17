import * as THREE from 'three';
import { instanceRefMap, type ArtworkInstanceData } from '@/store/editorStore';
import { worldToWall, worldToWallMatrix, type WallFrame } from './geometry';
import type { Rect } from './layout';

/** Halbe Classic Alu8: the profile reaches 9 mm beyond the picture on every side (measured from the GLB). */
export const FRAME_OUTER_MARGIN = 0.009;

/** 65" monitor (Monitor65.glb) — only used until the model has loaded. */
const MONITOR_FALLBACK_SIZE = { w: 1.463, h: 0.837 };

/**
 * Extent of an artwork relative to its anchor point (the stored position), in wall units
 * (metres, u to the right, v up). Adding the anchor's (u, v) gives its rectangle on the wall.
 */
export interface Footprint {
    left: number;
    right: number;
    bottom: number;
    top: number;
    /** false while the real size is not known yet (e.g. the monitor model is still loading). */
    exact: boolean;
}

const EPS = 1e-4;
const safeScale = (s: number) => (Math.abs(s) > EPS ? Math.abs(s) : 1);

/** Physical picture size (without frame) at scale 1, in metres. */
export function baseArtworkSize(inst: ArtworkInstanceData): { w: number; h: number } {
    const asset = inst.artwork.asset;
    const hasPhysical = inst.artwork.width != null && inst.artwork.height != null;
    if (hasPhysical) return { w: inst.artwork.width! / 100, h: inst.artwork.height! / 100 };
    const dpi = asset.dpi || 72;
    return { w: (asset.width / dpi) * 0.0254, h: (asset.height / dpi) * 0.0254 };
}

const symmetric = (w: number, h: number, exact: boolean): Footprint => ({
    left: -w / 2, right: w / 2, bottom: -h / 2, top: h / 2, exact,
});

const _matrix = new THREE.Matrix4();
const _wallMatrix = new THREE.Matrix4();
const _box = new THREE.Box3();
const _corner = new THREE.Vector3();

/** Bounds of all meshes below `group`, projected onto the wall face. */
function measureGroup(group: THREE.Object3D, frame: WallFrame): { minU: number; maxU: number; minV: number; maxV: number } | null {
    group.updateWorldMatrix(true, true);
    worldToWallMatrix(frame, _wallMatrix);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry || object.userData.wallEditorIgnore) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox;
        if (!bb || bb.isEmpty()) return;
        _box.copy(bb);
        _matrix.multiplyMatrices(_wallMatrix, mesh.matrixWorld);
        for (let i = 0; i < 8; i++) {
            _corner.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z);
            _corner.applyMatrix4(_matrix);
            if (_corner.x < minU) minU = _corner.x;
            if (_corner.x > maxU) maxU = _corner.x;
            if (_corner.y < minV) minV = _corner.y;
            if (_corner.y > maxV) maxV = _corner.y;
        }
    });
    if (!Number.isFinite(minU)) return null;
    return { minU, maxU, minV, maxV };
}

/**
 * Computes an artwork's footprint on the wall face.
 *
 * Framed pictures are computed from their data (the frame is drawn instanced and is not part of
 * the artwork's scene graph). Everything else (monitor, beamer, legacy video planes) is measured
 * from its meshes, which must sit at the stored position — call this only while nothing is being
 * dragged.
 */
export function computeFootprint(inst: ArtworkInstanceData, frame: WallFrame): Footprint {
    const type = inst.artwork.asset.type ?? 'image';

    if (type === 'image') {
        const base = baseArtworkSize(inst);
        const w = base.w * safeScale(inst.scale_x) + 2 * FRAME_OUTER_MARGIN;
        const h = base.h * safeScale(inst.scale_y) + 2 * FRAME_OUTER_MARGIN;
        return symmetric(w, h, true);
    }

    const group = instanceRefMap.get(inst.id);
    const measured = group ? measureGroup(group, frame) : null;
    if (measured) {
        const anchor = worldToWall(frame, group!.position);
        return {
            left: measured.minU - anchor.u,
            right: measured.maxU - anchor.u,
            bottom: measured.minV - anchor.v,
            top: measured.maxV - anchor.v,
            exact: true,
        };
    }

    if (type === 'video' && inst.medium === 'monitor') {
        const { width, height } = inst.artwork.asset;
        const portrait = !!width && !!height && height > width;
        return portrait
            ? symmetric(MONITOR_FALLBACK_SIZE.h, MONITOR_FALLBACK_SIZE.w, false)
            : symmetric(MONITOR_FALLBACK_SIZE.w, MONITOR_FALLBACK_SIZE.h, false);
    }

    const dpi = inst.artwork.asset.dpi || 72;
    const w = (inst.artwork.asset.width / dpi) * 0.0254 * safeScale(inst.scale_x);
    const h = (inst.artwork.asset.height / dpi) * 0.0254 * safeScale(inst.scale_y);
    return symmetric(w || 0.5, h || 0.5, false);
}

/** Rectangle of an artwork whose anchor sits at (u, v). */
export function footprintRect(fp: Footprint, u: number, v: number): Rect {
    return { x: u + fp.left, y: v + fp.bottom, w: fp.right - fp.left, h: fp.top - fp.bottom };
}
