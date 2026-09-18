import {
    FRAME_FINISHES,
    type FrameFinishId,
    type WoodSpecies,
    type WoodSurface,
} from './frameStyles';

// Procedural textures for the HALBE frame finishes and the passepartout board.
//
// Pure functions over typed arrays — no three.js, no DOM — so they run in a worker
// (workers/frameTexture.worker.ts): a wood finish is ~0.5 M texels of noise and takes a good
// 100 ms even on a fast machine.
//
// The geometry (frameProfileGeometry) lays U along the moulding and V around its cross-section,
// both in metres, so the textures are painted in real units: one tile covers TILE_U metres of
// moulding and TILE_V metres of profile. Veneer grain runs along the moulding, so all the detail
// is across V (grain lines, fibres, pores a few tenths of a millimetre wide) and U only carries
// slow drift — which is also why stretching an edge instance doesn't show.

export const TEX_U = 512;
export const TEX_V = 1024;
/** Metres of moulding per texture tile. */
export const TILE_U = 0.4;
/** Metres around the profile per texture tile (Holz 16 is ~9 cm around, the seam is on the back). */
export const TILE_V = 0.048;
const MM_PER_PX_U = (TILE_U * 1000) / TEX_U;
const MM_PER_PX_V = (TILE_V * 1000) / TEX_V;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, x: number) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
};

// ── tileable value noise ────────────────────────────────────────────────────

function hash2(seed: number, x: number, y: number): number {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);
const wrap = (i: number, period: number) => ((i % period) + period) % period;

/** 2D value noise in lattice units whose lattice repeats after px × py cells. */
function noise2(seed: number, x: number, y: number, px: number, py: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = fade(x - ix), fy = fade(y - iy);
    const x0 = wrap(ix, px), x1 = wrap(ix + 1, px);
    const y0 = wrap(iy, py), y1 = wrap(iy + 1, py);
    const a = hash2(seed, x0, y0), b = hash2(seed, x1, y0);
    const c = hash2(seed, x0, y1), d = hash2(seed, x1, y1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** 1D value noise repeating after `period` cells. */
function noise1(seed: number, x: number, period: number): number {
    const i = Math.floor(x);
    const f = fade(x - i);
    const a = hash2(seed, wrap(i, period), 7), b = hash2(seed, wrap(i + 1, period), 7);
    return a + (b - a) * f;
}

/**
 * Noise sampled in millimetres with a feature size (`lu`, `lv`) that is snapped so a whole number
 * of cells fits the tile — the result tiles seamlessly in both directions.
 */
function tiledNoise(seed: number, uMm: number, vMm: number, lu: number, lv: number): number {
    const pu = Math.max(1, Math.round((TILE_U * 1000) / lu));
    const pv = Math.max(1, Math.round((TILE_V * 1000) / lv));
    return noise2(seed, (uMm * pu) / (TILE_U * 1000), (vMm * pv) / (TILE_V * 1000), pu, pv);
}

// ── wood grain ──────────────────────────────────────────────────────────────

interface SpeciesGrain {
    /** Spacing between grain lines across the moulding, mm. */
    lineMin: number;
    lineMax: number;
    /** Width (mm) and darkness (0…1) of a grain line, per line random within these ranges. */
    widthMin: number;
    widthMax: number;
    darkMin: number;
    darkMax: number;
    /** Soft darker late-wood zone before each line (share of the gap, strength). */
    late: number;
    lateDark: number;
    /** Waviness: sideways wander of the lines in mm, and how quickly it changes across them. */
    wave: number;
    /** Strength of the fine fibre streaks between the lines. */
    fibre: number;
    /** Open pores: 0 = none … 1 = oak. Ring-porous species put them into the early wood. */
    pores: number;
    ringPorous: boolean;
    /** Broad colour bands across the grain (walnut heartwood, alder's cloudy tone). */
    bands: number;
}

/**
 * HALBE's veneers show the grain as long, fine lines along the moulding that wander a little and
 * run together here and there (a mix of rift and flat cut) — close to parallel, never evenly
 * spaced. Oak adds open pores as short dark dashes, walnut broad darker streaks.
 */
const SPECIES: Record<WoodSpecies, SpeciesGrain> = {
    eiche:    { lineMin: 0.7, lineMax: 4.2, widthMin: 0.07, widthMax: 0.32, darkMin: 0.15, darkMax: 0.65, late: 0.4, lateDark: 0.22, wave: 2.2, fibre: 0.14, pores: 1, ringPorous: true, bands: 0.2 },
    ahorn:    { lineMin: 0.8, lineMax: 3.2, widthMin: 0.05, widthMax: 0.18, darkMin: 0.1, darkMax: 0.4, late: 0.3, lateDark: 0.14, wave: 1.2, fibre: 0.1, pores: 0.15, ringPorous: false, bands: 0.12 },
    erle:     { lineMin: 0.8, lineMax: 3.4, widthMin: 0.06, widthMax: 0.22, darkMin: 0.12, darkMax: 0.45, late: 0.35, lateDark: 0.18, wave: 1.5, fibre: 0.12, pores: 0.3, ringPorous: false, bands: 0.22 },
    nussbaum: { lineMin: 0.5, lineMax: 4.5, widthMin: 0.08, widthMax: 0.5, darkMin: 0.25, darkMax: 0.9, late: 0.45, lateDark: 0.32, wave: 2.4, fibre: 0.18, pores: 0.5, ringPorous: false, bands: 0.5 },
};

interface GrainField {
    /** 0 = light wood … 1 = darkest grain line. */
    tone: Float32Array;
    /** 0…1 open pore. */
    pore: Float32Array;
    /** Surface height in mm (relief for the normal map). */
    height: Float32Array;
}

function seededRandom(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function buildGrain(species: WoodSpecies, seed: number): GrainField {
    const spec = SPECIES[species];
    const rand = seededRandom(seed);
    const tileV = TILE_V * 1000;
    const tileU = TILE_U * 1000;

    // Grain lines across one tile of profile, rescaled so the last one closes the tile exactly.
    const bounds: number[] = [0];
    while (bounds[bounds.length - 1] < tileV) {
        // Lines cluster: short gaps come in runs, now and then a wide calm stretch.
        const r = rand();
        bounds.push(bounds[bounds.length - 1] + spec.lineMin + r * r * (spec.lineMax - spec.lineMin));
    }
    const stretch = tileV / bounds[bounds.length - 1];
    for (let i = 0; i < bounds.length; i++) bounds[i] *= stretch;
    const lines = bounds.length - 1;
    const width = Float32Array.from({ length: lines }, () => spec.widthMin + rand() ** 2 * (spec.widthMax - spec.widthMin));
    const dark = Float32Array.from({ length: lines }, () => spec.darkMin + rand() * (spec.darkMax - spec.darkMin));

    // Line lookup at 1/64 mm.
    const lookupSize = Math.ceil(tileV * 64);
    const lineAt = new Uint16Array(lookupSize);
    for (let i = 0, k = 0; i < lookupSize; i++) {
        const w = i / 64;
        while (k < lines - 1 && w >= bounds[k + 1]) k++;
        lineAt[i] = k;
    }

    // Slow lengthwise tone change of the board.
    const board = new Float32Array(TEX_U);
    for (let x = 0; x < TEX_U; x++) {
        board[x] = (noise1(seed + 13, ((x * MM_PER_PX_U) / tileU) * 3, 3) - 0.5) * 0.1;
    }

    const size = TEX_U * TEX_V;
    const tone = new Float32Array(size);
    const pore = new Float32Array(size);
    const height = new Float32Array(size);

    for (let y = 0; y < TEX_V; y++) {
        const v = y * MM_PER_PX_V;
        const band = spec.bands > 0 ? (tiledNoise(seed + 21, 0, v, tileU, 6) - 0.5) * spec.bands : 0;
        for (let x = 0; x < TEX_U; x++) {
            const u = x * MM_PER_PX_U;
            const i = y * TEX_U + x;
            // The lines wander sideways along the moulding; because the wander also changes across
            // the grain, neighbouring lines drift towards and away from each other.
            const wave = (tiledNoise(seed + 31, u, v, 140, 9) - 0.5) * 2 * spec.wave
                + (tiledNoise(seed + 32, u, v, 45, 3) - 0.5) * 0.5 * spec.wave;
            let w = v + wave;
            w = ((w % tileV) + tileV) % tileV;
            const k = lineAt[Math.min(lookupSize - 1, Math.floor(w * 64))];
            const d0 = w - bounds[k];
            const d1 = bounds[k + 1] - w;
            const next = k + 1 < lines ? k + 1 : 0;
            const nearest = d0 < d1 ? k : next;
            const d = Math.min(d0, d1);
            const line = dark[nearest] * Math.exp(-((d / width[nearest]) ** 2));
            // Late wood darkens gently towards the next line.
            const f = d0 / (d0 + d1);
            const lateWood = smoothstep(1 - spec.late, 1, f) * spec.lateDark;
            const fibre = (tiledNoise(seed + 41, u, w, 22, 0.25) - 0.5) * 0.7
                + (tiledNoise(seed + 42, u, w, 6, 0.08) - 0.5) * 0.3;

            let p = 0;
            if (spec.pores > 0) {
                const zone = spec.ringPorous ? 1 - smoothstep(0.1, 0.35, f) : 0.7;
                const dash = tiledNoise(seed + 51, u, w, 1.1, 0.1);
                const threshold = 1 - 0.18 * spec.pores;
                p = clamp01((dash - threshold) / (1 - threshold)) * zone;
            }
            tone[i] = clamp01(line + lateWood + fibre * spec.fibre + band + board[x] + 0.2);
            pore[i] = p;
            // Pores are troughs; the hard late wood stands a hair proud of the early wood.
            height[i] = (lateWood + line * 0.5) * 0.01 + fibre * 0.003 - p * 0.025;
        }
    }
    return { tone, pore, height };
}

// ── brushed metal ───────────────────────────────────────────────────────────

function buildBrushed(seed: number): GrainField {
    const size = TEX_U * TEX_V;
    const tone = new Float32Array(size);
    const pore = new Float32Array(size);
    const height = new Float32Array(size);
    for (let y = 0; y < TEX_V; y++) {
        const v = y * MM_PER_PX_V;
        for (let x = 0; x < TEX_U; x++) {
            const u = x * MM_PER_PX_U;
            const i = y * TEX_U + x;
            // Grinding marks: long, hair-thin, at random depth.
            const s = (tiledNoise(seed, u, v, 40, 0.06) - 0.5) * 0.6
                + (tiledNoise(seed + 1, u, v, 12, 0.12) - 0.5) * 0.3
                + (tiledNoise(seed + 2, u, v, 90, 0.5) - 0.5) * 0.25;
            tone[i] = 0.5 + s;
            height[i] = s * 0.004;
        }
    }
    return { tone, pore, height };
}

// ── textures ────────────────────────────────────────────────────────────────

/** sRGB bytes of a catalogue colour (#rrggbb). Albedo textures are tagged sRGB, so mixing happens in sRGB. */
export function rgbOf(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function woodAlbedo(field: GrainField, surface: WoodSurface): Uint8Array {
    const data = new Uint8Array(TEX_U * TEX_V * 4);
    const light = rgbOf(surface.light);
    const dark = rgbOf(surface.dark);
    const pore = rgbOf(surface.pore);
    for (let i = 0; i < field.tone.length; i++) {
        const t = field.tone[i] * surface.contrast;
        const p = field.pore[i] * Math.min(1, surface.contrast + 0.3);
        const o = i * 4;
        for (let ch = 0; ch < 3; ch++) {
            const wood = light[ch] + (dark[ch] - light[ch]) * t;
            data[o + ch] = wood + (pore[ch] - wood) * p;
        }
        data[o + 3] = 255;
    }
    return data;
}

function roughnessData(field: GrainField, base: number, poreSpread: number, toneSpread: number): Uint8Array {
    const data = new Uint8Array(TEX_U * TEX_V * 4);
    for (let i = 0; i < field.tone.length; i++) {
        const r = clamp01(base + field.pore[i] * poreSpread + (field.tone[i] - 0.5) * toneSpread);
        const byte = Math.round(r * 255);
        const o = i * 4;
        data[o] = byte;
        data[o + 1] = byte;
        data[o + 2] = byte;
        data[o + 3] = 255;
    }
    return data;
}

/** Tangent-space normals from a height field in mm; texels are MM_PER_PX_U × MM_PER_PX_V. */
function normalData(field: GrainField, strength: number): Uint8Array {
    const data = new Uint8Array(TEX_U * TEX_V * 4);
    const h = field.height;
    const at = (x: number, y: number) => h[wrap(y, TEX_V) * TEX_U + wrap(x, TEX_U)];
    for (let y = 0; y < TEX_V; y++) {
        for (let x = 0; x < TEX_U; x++) {
            const du = ((at(x + 1, y) - at(x - 1, y)) / (2 * MM_PER_PX_U)) * strength;
            const dv = ((at(x, y + 1) - at(x, y - 1)) / (2 * MM_PER_PX_V)) * strength;
            const len = Math.hypot(du, dv, 1);
            const o = (y * TEX_U + x) * 4;
            data[o] = Math.round((-du / len * 0.5 + 0.5) * 255);
            data[o + 1] = Math.round((-dv / len * 0.5 + 0.5) * 255);
            data[o + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
            data[o + 3] = 255;
        }
    }
    return data;
}

// ── per finish ──────────────────────────────────────────────────────────────

export interface FinishTextures {
    /** RGBA8, sRGB. */
    albedo: Uint8Array;
    /** RGBA8, linear: roughness in every channel. */
    roughness: Uint8Array;
    /** RGBA8, linear: tangent-space normals. */
    normal: Uint8Array;
}

/** Stable per finish, so a regenerated texture always shows the same veneer. */
function seedOf(id: FrameFinishId): number {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return h >>> 0;
}

/** Whether a finish is drawn with generated textures (wood grain, brushing marks). */
export function finishHasTextures(id: FrameFinishId): boolean {
    const surface = FRAME_FINISHES[id].surface;
    return surface.kind === 'wood' || surface.brushed;
}

/** Texture data of a finish, or null for the flat anodised colours. */
export function generateFinishTextures(id: FrameFinishId): FinishTextures | null {
    const surface = FRAME_FINISHES[id].surface;
    const seed = seedOf(id);
    if (surface.kind === 'wood') {
        const field = buildGrain(surface.species, seed);
        return {
            albedo: woodAlbedo(field, surface),
            roughness: roughnessData(field, surface.roughness, 0.2, 0.06),
            normal: normalData(field, surface.relief * 1.6),
        };
    }
    if (!surface.brushed) return null;
    const field = buildBrushed(seed);
    const albedo = new Uint8Array(TEX_U * TEX_V * 4);
    for (let i = 0; i < field.tone.length; i++) {
        const byte = Math.round(clamp01(0.9 + (field.tone[i] - 0.5) * 0.2) * 255);
        albedo[i * 4] = byte;
        albedo[i * 4 + 1] = byte;
        albedo[i * 4 + 2] = byte;
        albedo[i * 4 + 3] = 255;
    }
    return { albedo, roughness: roughnessData(field, surface.roughness, 0, 0.35), normal: normalData(field, 1) };
}

/** Average look of a wood finish (sRGB bytes), shown until its textures are ready. */
export function woodBaseColor(surface: WoodSurface): [number, number, number] {
    const light = rgbOf(surface.light);
    const dark = rgbOf(surface.dark);
    return light.map((v, i) => Math.round(v + (dark[i] - v) * 0.3 * surface.contrast)) as [number, number, number];
}

/** Fine felt texture of museum board as tangent-space normals, `size`² texels, tileable. */
export function paperNormalData(size: number, tileMm: number): Uint8Array {
    const heights = new Float32Array(size * size);
    const cells = (l: number) => Math.round(tileMm / l);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size, v = y / size;
            const n = (l: number, s: number) => noise2(s, u * cells(l), v * cells(l), cells(l), cells(l));
            heights[y * size + x] = (n(0.35, 3) - 0.5) * 0.6 + (n(0.9, 5) - 0.5) * 0.3 + (n(3, 7) - 0.5) * 0.1;
        }
    }
    const data = new Uint8Array(size * size * 4);
    const at = (x: number, y: number) => heights[wrap(y, size) * size + wrap(x, size)];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const du = (at(x + 1, y) - at(x - 1, y)) * 0.6;
            const dv = (at(x, y + 1) - at(x, y - 1)) * 0.6;
            const len = Math.hypot(du, dv, 1);
            const o = (y * size + x) * 4;
            data[o] = Math.round((-du / len * 0.5 + 0.5) * 255);
            data[o + 1] = Math.round((-dv / len * 0.5 + 0.5) * 255);
            data[o + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
            data[o + 3] = 255;
        }
    }
    return data;
}
