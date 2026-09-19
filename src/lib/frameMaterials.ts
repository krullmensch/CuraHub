import * as THREE from 'three';
import {
    BOX_FRAME_SPACER_SURFACE,
    FRAME_FINISHES,
    finishBaseColor,
    rgbOf,
    type FrameFinishId,
    type FrameStyle,
    type LacquerSurface,
    type MetalSurface,
    type WoodSurface,
} from './frameStyles';
import {
    TEX_U,
    TEX_V,
    TILE_U,
    TILE_V,
    finishHasTextures,
    generateFinishTextures,
    paperNormalData,
    type FinishTextures,
} from './frameTextures';
import type { FrameTextureRequest, FrameTextureResponse } from '../workers/frameTexture.worker';

// Materials for the frame finishes (HALBE, Max Aab), the box frame's spacer and the passepartout
// board.
//
// A material is created synchronously in its finish's average colour, so a frame shows up at
// once; the wood grain / brushing textures are generated in a worker (frameTexture.worker, see
// frameTextures) and attached when they arrive. Everything is cached per finish for the lifetime
// of the tab. No canvas, no downloads, no shader patches — the WebGPU path converts these
// materials to node materials and would drop an onBeforeCompile.

// ── studio environment for reflections ──────────────────────────────────────

let environment: THREE.DataTexture | null = null;

/**
 * A small equirectangular stand-in for the gallery: white ceiling with two long light fields,
 * white walls with a few darker openings and a bright window, a darker floor. The scene itself
 * has no environment map, and without one anodised or polished aluminium only reflects black —
 * this is what lets a silver frame read as silver and chrome as chrome (its sharp reflection
 * needs the structure, a uniform surround would make it look like grey paint). Used by the frame
 * materials only.
 */
export function getFrameEnvironment(): THREE.DataTexture {
    if (environment) return environment;
    const width = 256;
    const height = 128;
    const data = new Uint16Array(width * height * 4);
    // Darker openings in the walls (doorways, other works) and one window, as azimuth ranges.
    const openings = [[0.35, 0.75], [1.9, 2.15], [3.3, 3.9], [5.1, 5.35]];
    const windowRange = [4.3, 4.85];
    const inRange = (a: number, [lo, hi]: number[]) => a >= lo && a <= hi;
    for (let y = 0; y < height; y++) {
        const elevation = (0.5 - (y + 0.5) / height) * Math.PI; // +π/2 up … -π/2 down
        for (let x = 0; x < width; x++) {
            const azimuth = ((x + 0.5) / width) * Math.PI * 2;
            let level: number;
            let warm = 0.97;
            if (elevation > 0.42) {
                // Ceiling with two long light fields, like the room's area lights.
                const strip = Math.abs(Math.cos(azimuth)) > 0.35 && elevation > 0.75 && elevation < 1.2;
                level = strip ? 4.2 : 0.95;
            } else if (elevation > -0.1) {
                level = 0.8 + elevation * 0.25;
                if (elevation < 0.3 && openings.some((r) => inRange(azimuth, r))) level = 0.22;
                if (elevation > 0.02 && elevation < 0.36 && inRange(azimuth, windowRange)) { level = 2.2; warm = 1.02; }
            } else {
                // Floor, with a soft dark skirting line where it meets the walls.
                level = elevation > -0.16 ? 0.12 : 0.26 + (elevation + Math.PI / 2) * 0.03;
            }
            const o = (y * width + x) * 4;
            data[o] = THREE.DataUtils.toHalfFloat(level);
            data[o + 1] = THREE.DataUtils.toHalfFloat(level * (warm > 1 ? 1 : 0.99));
            data[o + 2] = THREE.DataUtils.toHalfFloat(level * warm * (warm > 1 ? 1.02 : 0.96));
            data[o + 3] = THREE.DataUtils.toHalfFloat(1);
        }
    }
    environment = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
    environment.mapping = THREE.EquirectangularReflectionMapping;
    environment.colorSpace = THREE.LinearSRGBColorSpace;
    environment.magFilter = THREE.LinearFilter;
    environment.minFilter = THREE.LinearFilter;
    environment.needsUpdate = true;
    return environment;
}

// ── materials ───────────────────────────────────────────────────────────────

function dataTexture(data: Uint8Array, colorSpace: THREE.ColorSpace): THREE.DataTexture {
    const texture = new THREE.DataTexture(data, TEX_U, TEX_V, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1 / TILE_U, 1 / TILE_V);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
}

const srgb = ([r, g, b]: [number, number, number]) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);

function woodMaterial(surface: WoodSurface): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
        color: srgb(finishBaseColor(surface)),
        roughness: surface.roughness,
        metalness: 0,
        clearcoat: surface.clearcoat,
        clearcoatRoughness: surface.clearcoatRoughness,
        envMap: getFrameEnvironment(),
        envMapIntensity: 0.18,
    });
}

/** Smooth opaque lacquer: lit like the wood finishes, just without grain. */
function lacquerMaterial(surface: LacquerSurface): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
        color: srgb(rgbOf(surface.color)),
        roughness: surface.roughness,
        metalness: 0,
        clearcoat: surface.clearcoat,
        clearcoatRoughness: surface.clearcoatRoughness,
        envMap: getFrameEnvironment(),
        envMapIntensity: 0.18,
    });
}

function metalMaterial(surface: MetalSurface): THREE.MeshStandardMaterial {
    const dielectric = surface.metalness < 0.3;
    return new THREE.MeshStandardMaterial({
        color: srgb(rgbOf(surface.color)),
        metalness: surface.metalness,
        roughness: surface.roughness,
        envMap: getFrameEnvironment(),
        // Powder-white and black anodising are mostly diffuse; don't let the stand-in light them.
        envMapIntensity: dielectric ? 0.25 : 1,
    });
}

/** Puts generated textures on a finish's material (the base colour then comes from the map). */
function attachTextures(id: FrameFinishId, material: THREE.MeshStandardMaterial, textures: FinishTextures): void {
    const surface = FRAME_FINISHES[id].surface;
    material.map = dataTexture(textures.albedo, THREE.SRGBColorSpace);
    material.roughnessMap = dataTexture(textures.roughness, THREE.NoColorSpace);
    material.normalMap = dataTexture(textures.normal, THREE.NoColorSpace);
    material.normalScale.set(1, 1);
    if (surface.kind === 'wood') {
        material.color.set(0xffffff);
        material.roughness = 1;
    } else {
        // Brushed steel: the map only modulates the metal's own colour; roughness from the map.
        material.roughness = 1;
    }
    material.needsUpdate = true;
    for (const listener of listeners) listener();
}

// ── texture worker ──────────────────────────────────────────────────────────

let worker: Worker | null = null;
let nextRequest = 0;
const waiting = new Map<number, (textures: FinishTextures | null) => void>();
const listeners = new Set<() => void>();

/** Called whenever a finish's textures arrived — frame meshes rendered on demand invalidate. */
export function onFrameTexturesReady(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function requestTextures(id: FrameFinishId): Promise<FinishTextures | null> {
    if (typeof Worker === 'undefined') return Promise.resolve(generateFinishTextures(id));
    if (!worker) {
        worker = new Worker(new URL('../workers/frameTexture.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<FrameTextureResponse>) => {
            const { reqId, textures } = event.data;
            waiting.get(reqId)?.(textures);
            waiting.delete(reqId);
        };
    }
    const reqId = ++nextRequest;
    return new Promise((resolve) => {
        waiting.set(reqId, resolve);
        worker!.postMessage({ reqId, finishId: id } satisfies FrameTextureRequest);
    });
}

const cache = new Map<FrameFinishId, THREE.Material>();

/**
 * Material of a finish, shared by every profile and frame. Returned at once; wood and brushed
 * steel get their textures a moment later (see onFrameTexturesReady).
 */
export function getFrameMaterial(id: FrameFinishId): THREE.Material {
    const cached = cache.get(id);
    if (cached) return cached;
    const surface = FRAME_FINISHES[id].surface;
    const material = surface.kind === 'wood'
        ? woodMaterial(surface)
        : surface.kind === 'lacquer' ? lacquerMaterial(surface) : metalMaterial(surface);
    material.name = `frame-${id}`;
    cache.set(id, material);
    if (finishHasTextures(id)) {
        requestTextures(id)
            .then((textures) => { if (textures) attachTextures(id, material, textures); })
            .catch((err) => console.warn(`Rahmen-Textur ${id} konnte nicht erzeugt werden:`, err));
    }
    return material;
}

let spacerMaterial: THREE.MeshPhysicalMaterial | null = null;

/**
 * The white lacquered spacer strip inside a box frame (Aab 111). Its vertex colours carry baked
 * occlusion — brighter behind the glass, darker down at the back board — since the scene has no
 * shadow maps and the depth of the box would otherwise read flat.
 */
function getSpacerMaterial(): THREE.MeshPhysicalMaterial {
    if (spacerMaterial) return spacerMaterial;
    spacerMaterial = lacquerMaterial(BOX_FRAME_SPACER_SURFACE);
    spacerMaterial.vertexColors = true;
    spacerMaterial.name = 'frame-spacer';
    return spacerMaterial;
}

const styleCache = new Map<FrameFinishId, THREE.Material[]>();

/**
 * What a style's frame geometry is drawn with: the finish's material, plus the spacer's for a box
 * frame, whose geometry carries two groups (see frameProfileGeometry.getFrameParts). Stable
 * objects, so instanced meshes don't re-create.
 */
export function getFrameStyleMaterial(style: FrameStyle): THREE.Material | THREE.Material[] {
    const finish = getFrameMaterial(style.finish.id);
    if (!style.profile.objectDepth) return finish;
    let materials = styleCache.get(style.finish.id);
    if (!materials) {
        materials = [finish, getSpacerMaterial()];
        styleCache.set(style.finish.id, materials);
    }
    return materials;
}

// ── passepartout board ──────────────────────────────────────────────────────

let passepartoutMaterial: THREE.MeshStandardMaterial | null = null;

/** Metres of board per tile of the paper-fibre normal map. */
export const PASSEPARTOUT_TILE = 0.04;

/**
 * KLUG museum board in HALBE's "Weiß": bright, neutral, fine-textured surface. The bevel shows
 * the same white core. The normal map only adds the paper's felt texture (256² texels, a few ms
 * to generate); its UVs are the board's own xy in metres.
 */
export function getPassepartoutMaterial(): THREE.MeshStandardMaterial {
    if (passepartoutMaterial) return passepartoutMaterial;
    const size = 256;
    const normalMap = new THREE.DataTexture(paperNormalData(size, PASSEPARTOUT_TILE * 1000), size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.magFilter = THREE.LinearFilter;
    normalMap.minFilter = THREE.LinearMipmapLinearFilter;
    normalMap.generateMipmaps = true;
    normalMap.needsUpdate = true;

    passepartoutMaterial = new THREE.MeshStandardMaterial({
        name: 'passepartout',
        color: new THREE.Color('#f5f5f2'),
        // The frame's shadow is baked into the board's vertex colours (see Passepartout).
        vertexColors: true,
        roughness: 0.92,
        metalness: 0,
        normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
    });
    return passepartoutMaterial;
}
