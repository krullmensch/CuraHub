import * as THREE from 'three';
import { WINDOW_VIEW_CONFIG, type AngularTextureMap } from './windowViewConfig';
import panoHighUrl from '../assets/window-view/street-pano-4096.webp?url';
import panoLowUrl from '../assets/window-view/street-pano-2048.webp?url';
import carsHighUrl from '../assets/window-view/street-cars-4096.webp?url';
import carsLowUrl from '../assets/window-view/street-cars-2048.webp?url';

// Street outside the room's windows, reconstructed from photos of it: a sidewalk, curb,
// road and facade surfaces at their measured positions (so walking around the room gives real
// parallax) plus a cut-out layer with the parked cars. Every surface samples a panorama that was
// baked for directions seen from WINDOW_VIEW_CONFIG.p0.

export const WINDOW_VIEW_TEXTURES = {
    low: { pano: panoLowUrl, cars: carsLowUrl },
    high: { pano: panoHighUrl, cars: carsHighUrl },
} as const;

/** Half width of the modelled street along x; beyond ±80° azimuth the textures clamp to their edges. */
const STREET_HALF_WIDTH = 400;
/** Height of the facade/sky surfaces — above anything visible through the windows. */
const SKY_TOP = 220;

const DEG = Math.PI / 180;
const cfg = WINDOW_VIEW_CONFIG;
const [P0X, P0Y, P0Z] = cfg.p0;

const roadY = (x: number) => cfg.roadY0 + cfg.roadSlope * x;
const sidewalkY = (x: number) => roadY(x) + cfg.curbHeight;

function facadeZ(x: number): number {
    const pts = cfg.facade;
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
        const [x1, z1] = pts[i];
        const [x2, z2] = pts[i + 1];
        if (x < x2 || i === pts.length - 2) {
            if (x2 === x1) return z2;
            return z1 + ((z2 - z1) * (x - x1)) / (x2 - x1);
        }
    }
    return pts[pts.length - 1][1];
}

/** Texture coordinates of a world point: azimuth/elevation seen from p0 (flipY = false, v = 0 at the top row). */
function angularUV(map: AngularTextureMap, x: number, y: number, z: number, out: number[]): void {
    const dx = x - P0X, dy = y - P0Y, dz = z - P0Z;
    const phi = Math.atan2(dx, -dz) / DEG;
    const theta = Math.atan2(dy, Math.hypot(dx, dz)) / DEG;
    out.push((phi - map.phiMin) / (map.phiMax - map.phiMin), (map.thetaMax - theta) / (map.thetaMax - map.thetaMin));
}

/** Positions between a and b spaced evenly in angle as seen from a point `distance` in front of `center`. */
function angleSpaced(a: number, b: number, center: number, distance: number, segments: number): number[] {
    const angA = Math.atan2(a - center, distance);
    const angB = Math.atan2(b - center, distance);
    const out: number[] = [];
    for (let i = 0; i <= segments; i++) out.push(center + distance * Math.tan(angA + ((angB - angA) * i) / segments));
    return out;
}

/** Sorted, de-duplicated x positions for the ground and facade grids, including every facade corner. */
function streetColumns(distance: number, segments: number): number[] {
    const xs = angleSpaced(-STREET_HALF_WIDTH, STREET_HALF_WIDTH, P0X, distance, segments);
    for (const [x] of cfg.facade) if (x > -STREET_HALF_WIDTH && x < STREET_HALF_WIDTH) xs.push(x);
    xs.sort((p, q) => p - q);
    return xs.filter((x, i) => i === 0 || x - xs[i - 1] > 1e-4);
}

/** Grid geometry: point(i, j) for column i of `cols`, row j of `rows` (j = 0 is the near/bottom edge). */
function gridGeometry(cols: number, rows: number, point: (i: number, j: number) => [number, number, number], map: AngularTextureMap): THREE.BufferGeometry {
    const positions: number[] = [];
    const uvs: number[] = [];
    for (let j = 0; j <= rows; j++) {
        for (let i = 0; i < cols; i++) {
            const [x, y, z] = point(i, j);
            positions.push(x, y, z);
            angularUV(map, x, y, z, uvs);
        }
    }
    const index: number[] = [];
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols - 1; i++) {
            const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
            index.push(a, b, d, a, d, c);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    return geometry;
}

/** Depths between near and far (both negative z), evenly spaced in inverse distance from p0. */
function inverseDepthLerp(near: number, far: number, t: number): number {
    const a = 1 / (P0Z - near), b = 1 / (P0Z - far);
    return P0Z - 1 / (a + (b - a) * t);
}

export interface WindowViewGeometries {
    background: THREE.BufferGeometry[];
    cars: THREE.BufferGeometry;
}

export function buildWindowViewGeometries(): WindowViewGeometries {
    const pano = cfg.panoMap;
    const background: THREE.BufferGeometry[] = [];
    const xs = streetColumns(8, 240);

    // Sidewalk + bike lane (raised), from the building wall to the curb.
    const sidewalkRows = 24;
    background.push(gridGeometry(xs.length, sidewalkRows, (i, j) => {
        const x = xs[i];
        return [x, sidewalkY(x), inverseDepthLerp(cfg.wallZ, cfg.curbZ, j / sidewalkRows)];
    }, pano));

    // Curb face.
    background.push(gridGeometry(xs.length, 1, (i, j) => {
        const x = xs[i];
        return [x, j === 0 ? roadY(x) : sidewalkY(x), cfg.curbZ];
    }, pano));

    // Road, from the curb to the facade line of the far side.
    const roadRows = 32;
    background.push(gridGeometry(xs.length, roadRows, (i, j) => {
        const x = xs[i];
        return [x, roadY(x), inverseDepthLerp(cfg.curbZ, facadeZ(x), j / roadRows)];
    }, pano));

    // Facades (and the sky above them) along the far side's polyline.
    const pts = cfg.facade;
    const facadeRows = 40;
    for (let s = 0; s < pts.length - 1; s++) {
        const [x1, z1] = pts[s];
        const [x2, z2] = pts[s + 1];
        const xa = Math.max(x1, -STREET_HALF_WIDTH), xb = Math.min(x2, STREET_HALF_WIDTH);
        const isReturnWall = x1 === x2;
        if (!isReturnWall && xb <= xa) continue;
        const along = isReturnWall ? [0, 0.25, 0.5, 0.75, 1].map((t) => z1 + (z2 - z1) * t) : xs.filter((x) => x >= xa - 1e-6 && x <= xb + 1e-6);
        const cols = along.length;
        if (cols < 2) continue;
        background.push(gridGeometry(cols, facadeRows, (i, j) => {
            const x = isReturnWall ? x1 : along[i];
            const z = isReturnWall ? along[i] : facadeZ(x);
            const bottom = roadY(x);
            // rows evenly spaced in elevation angle from p0
            const dist = Math.hypot(x - P0X, z - P0Z);
            const angBottom = Math.atan2(bottom - P0Y, dist), angTop = Math.atan2(SKY_TOP - P0Y, dist);
            const ang = angBottom + ((angTop - angBottom) * j) / facadeRows;
            return [x, P0Y + dist * Math.tan(ang), z];
        }, pano));
    }

    // Parked cars: a cut-out layer at the cars' measured depth.
    const carCols = angleSpaced(cfg.carX[0], cfg.carX[1], P0X, P0Z - cfg.carZ, 160);
    const carRows = 6;
    const cars = gridGeometry(carCols.length, carRows, (i, j) => {
        const x = carCols[i];
        const y = roadY(x) - 0.1 + ((cfg.carTop + 0.1) * j) / carRows;
        return [x, y, cfg.carZ];
    }, cfg.carsMap);

    return { background, cars };
}

const textureCache = new Map<string, Promise<THREE.Texture | null>>();

/**
 * Decodes an image off the main thread (createImageBitmap) into a texture. Cached per URL so
 * re-entering first person reuses the uploaded GPU texture. Resolves null when loading fails —
 * the view outside is decoration and must never break the scene.
 */
export function loadWindowViewTexture(url: string, anisotropy: number): Promise<THREE.Texture | null> {
    let promise = textureCache.get(url);
    if (!promise) {
        promise = (async () => {
            try {
                const res = await fetch(url, { credentials: 'same-origin' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
                const texture = new THREE.Texture(bitmap);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.flipY = false;
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                texture.anisotropy = anisotropy;
                texture.needsUpdate = true;
                return texture;
            } catch (err) {
                console.warn('Fensterausblick konnte nicht geladen werden:', url, err);
                textureCache.delete(url);
                return null;
            }
        })();
        textureCache.set(url, promise);
    }
    return promise;
}
