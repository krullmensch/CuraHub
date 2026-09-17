import * as THREE from 'three';
import { frameStyle, type FrameStyleId, type LacquerSurface, type WoodSurface } from './frameStyles';

// Procedural surfaces for the wooden and lacquered frame profiles.
//
// The frame GLB ships a single anodised-aluminium material and its baked UVs are a Blender
// box unwrap — useless for a directional material like wood. modularFrameParts therefore
// re-unwraps both meshes so that U runs along the profile and V wraps once around its
// cross-section; this module paints textures for exactly that layout: the grain varies along
// V and is near-constant along U, which is why a 2 m edge and a 2 cm corner piece can share
// one texture and why stretching an edge to the artwork's width leaves the grain intact.
//
// Everything here is generated once per style, on first use, and then cached for the lifetime
// of the tab — a frame style is picked far more often than it is dropped, and the textures are
// a few hundred KB each.

/** Square so the same tile can wrap both around the profile and along its length. */
const TEX_SIZE = 512;
/** Length of local UV space (meters) covered by one texture tile along the profile. */
const TILE_U = 0.35;

// ── seamless value noise ────────────────────────────────────────────────────

function randomTable(seed: number): Float32Array {
    const table = new Float32Array(256);
    let state = seed >>> 0;
    for (let i = 0; i < 256; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        table[i] = state / 4294967296;
    }
    return table;
}

/** Value noise whose lattice wraps after `period` steps, so sampling x∈[0,period) tiles. */
function pnoise(table: Float32Array, x: number, period: number): number {
    const i = Math.floor(x);
    const f = x - i;
    const a = table[(((i % period) + period) % period) & 255];
    const b = table[((((i + 1) % period) + period) % period) & 255];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── grain field ─────────────────────────────────────────────────────────────

interface GrainField {
    /** 0 = pale early wood, 1 = dark late wood. Also used as the relief height. */
    height: Float32Array;
    /** 0..1 open pores and rays, darkening the albedo without changing the relief much. */
    pore: Float32Array;
}

/**
 * Builds one tileable grain field. `bands` grain lines are laid out across V (one wrap around
 * the profile); along U they only drift, so an edge stretched to any artwork width keeps the
 * same grain spacing — the lines just get longer.
 *
 * Evenly spaced identical lines read as corrugation rather than wood, so every band gets its
 * own offset, width and darkness (irregular spacing, some lines hairline and near-black,
 * others broad and faint) on top of a slow shared drift along the length.
 */
function buildGrainField(bands: number, seed: number): GrainField {
    const size = TEX_SIZE;
    const height = new Float32Array(size * size);
    const pore = new Float32Array(size * size);
    const slow = randomTable(seed);
    const fast = randomTable(seed + 101);
    const fibre = randomTable(seed + 202);
    const pores = randomTable(seed + 303);
    const tone = randomTable(seed + 404);
    const perBand = randomTable(seed + 505);

    // Per-band character. Offsets stay well inside half a band so neighbouring lines never
    // cross and the band boundary — where the field is flat early wood — keeps tiling in V.
    const phase = new Float32Array(bands);
    const sharpness = new Float32Array(bands);
    const darkness = new Float32Array(bands);
    for (let k = 0; k < bands; k++) {
        phase[k] = (perBand[(k * 3) & 255] - 0.5) * 0.34;
        sharpness[k] = 2 + perBand[(k * 3 + 1) & 255] * 7;
        darkness[k] = 0.5 + perBand[(k * 3 + 2) & 255] * 0.5;
    }

    // Precompute the per-column drift and board tone: both only depend on U.
    const drift = new Float32Array(size);
    const shade = new Float32Array(size);
    for (let x = 0; x < size; x++) {
        const u = x / size;
        drift[x] = ((pnoise(slow, u * 3, 3) - 0.5) * 0.9 + (pnoise(fast, u * 11, 11) - 0.5) * 0.25) * 0.22;
        shade[x] = (pnoise(tone, u * 2, 2) - 0.5) * 0.14;
    }

    for (let y = 0; y < size; y++) {
        const v = y / size;
        const row = y * size;
        const base = v * bands;
        const k = ((Math.floor(base) % bands) + bands) % bands;
        const exponent = sharpness[k];
        const dark = darkness[k];
        for (let x = 0; x < size; x++) {
            const t = base + phase[k] + drift[x];
            const f = t - Math.floor(t);
            // Dark line through the middle of the band, flat early wood at its borders.
            const ring = Math.pow(Math.max(0, 1 - Math.abs(f - 0.5) * 2), exponent) * dark;
            const fibres = (pnoise(fibre, (x / size) * 128 + y * 7, 128) - 0.5) * 0.1;
            height[row + x] = clamp01(ring + fibres + shade[x] + 0.12);
            // Pores sit inside the dark bands and streak along the profile.
            const streak = pnoise(pores, (x / size) * 64 + k * 23, 64);
            pore[row + x] = ring > 0.3 ? clamp01((streak - 0.78) / 0.22) : 0;
        }
    }
    return { height, pore };
}

// ── canvases ────────────────────────────────────────────────────────────────

function createCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = TEX_SIZE;
    canvas.height = TEX_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('frameMaterials: 2D canvas context unavailable');
    return { canvas, ctx };
}

/** sRGB bytes — the albedo canvas is tagged SRGBColorSpace, so mixing happens in sRGB. */
function rgbOf(hex: string): [number, number, number] {
    const c = new THREE.Color(hex);
    return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

function woodAlbedoCanvas(field: GrainField, surface: WoodSurface): HTMLCanvasElement {
    const { canvas, ctx } = createCanvas();
    const image = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    const early = rgbOf(surface.early);
    const late = rgbOf(surface.late);
    const pore = rgbOf(surface.pore);
    for (let i = 0; i < field.height.length; i++) {
        const h = field.height[i];
        const p = field.pore[i];
        const o = i * 4;
        for (let ch = 0; ch < 3; ch++) {
            const wood = early[ch] + (late[ch] - early[ch]) * h;
            image.data[o + ch] = wood + (pore[ch] - wood) * p;
        }
        image.data[o + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

function roughnessCanvas(field: GrainField, range: [number, number]): HTMLCanvasElement {
    const { canvas, ctx } = createCanvas();
    const image = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    const [low, high] = range;
    for (let i = 0; i < field.height.length; i++) {
        // Open pores scatter the most, polished early wood the least.
        const r = low + (high - low) * clamp01(field.height[i] + field.pore[i] * 0.6);
        const byte = Math.round(clamp01(r) * 255);
        const o = i * 4;
        image.data[o] = byte;
        image.data[o + 1] = byte;
        image.data[o + 2] = byte;
        image.data[o + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

/** Tangent-space normals from the grain height, wrapping at both borders so the tile is seamless. */
function normalCanvas(field: GrainField, strength: number): HTMLCanvasElement {
    const { canvas, ctx } = createCanvas();
    const image = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    const size = TEX_SIZE;
    const h = field.height;
    const p = field.pore;
    const at = (x: number, y: number) => {
        const i = ((y + size) % size) * size + ((x + size) % size);
        // Pores are little troughs in the surface.
        return h[i] - p[i] * 0.5;
    };
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
            const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
            const len = Math.hypot(dx, dy, 1);
            const o = (y * size + x) * 4;
            image.data[o] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
            image.data[o + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
            image.data[o + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
            image.data[o + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

function textureFrom(canvas: HTMLCanvasElement, colorSpace: THREE.ColorSpace): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    // U is in meters of local geometry, V wraps exactly once around the profile (see
    // modularFrameParts.applyProfileUVs), so only U needs a repeat factor.
    texture.repeat.set(1 / TILE_U, 1);
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
}

// ── materials ───────────────────────────────────────────────────────────────

function woodMaterial(surface: WoodSurface, seed: number): THREE.Material {
    const field = buildGrainField(surface.bands, seed);
    return new THREE.MeshPhysicalMaterial({
        map: textureFrom(woodAlbedoCanvas(field, surface), THREE.SRGBColorSpace),
        roughnessMap: textureFrom(roughnessCanvas(field, surface.roughness), THREE.NoColorSpace),
        normalMap: textureFrom(normalCanvas(field, surface.relief * 6), THREE.NoColorSpace),
        normalScale: new THREE.Vector2(1, 1),
        metalness: 0,
        roughness: 1,
        clearcoat: surface.clearcoat,
        clearcoatRoughness: surface.clearcoatRoughness,
        side: THREE.DoubleSide,
    });
}

function lacquerMaterial(surface: LacquerSurface, seed: number): THREE.Material {
    // Paint hides the colour of the grain but not its relief, so only a normal map is needed.
    const field = buildGrainField(surface.bands, seed);
    return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(surface.color),
        normalMap: textureFrom(normalCanvas(field, surface.relief * 6), THREE.NoColorSpace),
        normalScale: new THREE.Vector2(1, 1),
        metalness: 0,
        roughness: surface.roughness,
        clearcoat: surface.clearcoat,
        clearcoatRoughness: surface.clearcoatRoughness,
        side: THREE.DoubleSide,
    });
}

function metalMaterial(color: string, roughness: number, metalness: number, base: THREE.Material): THREE.Material {
    const material = base.clone() as THREE.MeshStandardMaterial;
    material.color = new THREE.Color(color);
    material.roughness = roughness;
    material.metalness = metalness;
    return material;
}

const cache = new Map<FrameStyleId, THREE.Material>();
/** Stable per style, so re-generating a texture always yields the same plank. */
const SEEDS: Record<string, number> = {
    'oak-natural': 1471, 'walnut': 5309, 'ash-black': 9127,
    'lacquer-white': 2711, 'lacquer-black': 3313, 'lacquer-bordeaux': 4409,
};

/**
 * Material for a frame style. `base` is the material that ships with the GLB — it is returned
 * as-is for the original silver profile and cloned for the other anodised colours, so those
 * two styles cost nothing.
 */
export function getFrameMaterial(id: FrameStyleId, base: THREE.Material): THREE.Material {
    const surface = frameStyle(id).surface;
    if (!surface) return base;
    if (surface.kind === 'metal' && surface.color === null) return base;

    const cached = cache.get(id);
    if (cached) return cached;

    const seed = SEEDS[id] ?? 7919;
    const material =
        surface.kind === 'wood' ? woodMaterial(surface, seed) :
        surface.kind === 'lacquer' ? lacquerMaterial(surface, seed) :
        metalMaterial(surface.color as string, surface.roughness, surface.metalness, base);

    cache.set(id, material);
    return material;
}
