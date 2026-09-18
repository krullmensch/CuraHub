// Catalogue of the picture frame profiles a curator can pick per artwork.
//
// Every style reuses the two meshes of Halbe_Classic_Alu8.glb (one corner, one edge) and
// differs only in how the profile is scaled and which material it gets — so a new style
// costs no extra geometry and no extra GLB download. Pure data, no three.js import, so the
// geometry (modularFrameParts) and the materials (frameMaterials) can both depend on it.

export type FrameStyleId =
    | 'none'
    | 'alu-silver'
    | 'alu-black'
    | 'oak-natural'
    | 'walnut'
    | 'ash-black'
    | 'lacquer-white'
    | 'lacquer-black'
    | 'lacquer-bordeaux';

export type FrameStyleGroup = 'metall' | 'holz' | 'lack';

/** Bare profile of the GLB, in meters: the reference every style scales from. */
export const BASE_FACE_WIDTH = 0.009;
export const BASE_PROFILE_DEPTH = 0.027;
/**
 * How far a corner piece reaches along each picture edge, measured from the picture's
 * corner. Read off Halbe_Classic_Alu8_Corner: its L-shaped cross-section spans
 * x ∈ [-0.009, 0.011] and z ∈ [-0.011, 0.009] — 9 mm of face width *outside* the picture
 * and 11 mm of arm *inside* it. Using the 9 mm by mistake let every edge overlap its two
 * corners by 1.5 mm of perfectly coplanar surface, which is what produced the z-fighting.
 */
export const BASE_CORNER_ARM = 0.011;

/** Distance once around the profile's cross-section — one full wrap of the wood texture. */
export const BASE_PROFILE_PERIMETER = 2 * (BASE_FACE_WIDTH + BASE_PROFILE_DEPTH);

/** Wood with an open, visible grain (oiled or clear-varnished). */
export interface WoodSurface {
    kind: 'wood';
    /** Pale early wood between the grain lines. */
    early: string;
    /** Dark late wood inside a grain line. */
    late: string;
    /** Open pores and medullary rays scattered along the profile. */
    pore: string;
    /**
     * Grain lines over one full wrap around the profile. The UVs are in unscaled local space,
     * so the spacing a viewer sees is (72 mm / bands) x faceScale — these counts land around
     * 4-5 mm of real grain spacing on each profile.
     */
    bands: number;
    /** Roughness between the grain lines and inside them. */
    roughness: [number, number];
    /** Depth of the grain relief in the normal map (0..1). */
    relief: number;
    clearcoat: number;
    clearcoatRoughness: number;
}

/** Painted wood: the colour hides the grain, the relief underneath still catches light. */
export interface LacquerSurface {
    kind: 'lacquer';
    color: string;
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    /** How much grain still telegraphs through the paint (0..1). */
    relief: number;
    bands: number;
}

/** Anodised aluminium — flat colour, no maps. `color: null` keeps the GLB's own material. */
export interface MetalSurface {
    kind: 'metal';
    color: string | null;
    roughness: number;
    metalness: number;
}

export type FrameSurface = WoodSurface | LacquerSurface | MetalSurface;

export interface FrameStyle {
    id: FrameStyleId;
    /** German, shown in the properties panel. */
    label: string;
    group: FrameStyleGroup;
    /** Scales the visible face width *and* the corner arm length. */
    faceScale: number;
    /** Scales how far the profile stands off the wall. */
    depthScale: number;
    /** null for 'none' — that style draws no frame at all. */
    surface: FrameSurface | null;
}

export const DEFAULT_FRAME_STYLE: FrameStyleId = 'alu-silver';

export const FRAME_STYLES: Record<FrameStyleId, FrameStyle> = {
    'none': {
        id: 'none', label: 'Ohne Rahmen', group: 'metall',
        faceScale: 0, depthScale: 0, surface: null,
    },
    'alu-silver': {
        id: 'alu-silver', label: 'Alu silber (Halbe Classic 8)', group: 'metall',
        faceScale: 1, depthScale: 1,
        surface: { kind: 'metal', color: null, roughness: 0.6, metalness: 1 },
    },
    'alu-black': {
        id: 'alu-black', label: 'Alu schwarz eloxiert', group: 'metall',
        faceScale: 1, depthScale: 1,
        surface: { kind: 'metal', color: '#2a2a2c', roughness: 0.45, metalness: 1 },
    },
    'oak-natural': {
        id: 'oak-natural', label: 'Eiche natur', group: 'holz',
        faceScale: 2.2, depthScale: 1.3,
        surface: {
            kind: 'wood', early: '#cfa671', late: '#8d6234', pore: '#5f3f1e',
            bands: 30, roughness: [0.68, 0.82], relief: 0.55,
            clearcoat: 0.25, clearcoatRoughness: 0.5,
        },
    },
    'walnut': {
        id: 'walnut', label: 'Nussbaum geölt', group: 'holz',
        faceScale: 1.7, depthScale: 1.2,
        surface: {
            kind: 'wood', early: '#6d4a30', late: '#382213', pore: '#241309',
            bands: 26, roughness: [0.55, 0.72], relief: 0.4,
            clearcoat: 0.35, clearcoatRoughness: 0.4,
        },
    },
    'ash-black': {
        id: 'ash-black', label: 'Esche schwarz gebeizt', group: 'holz',
        faceScale: 1.35, depthScale: 1.1,
        surface: {
            kind: 'wood', early: '#3a3632', late: '#141312', pore: '#0b0a0a',
            bands: 24, roughness: [0.5, 0.78], relief: 0.62,
            clearcoat: 0.2, clearcoatRoughness: 0.55,
        },
    },
    'lacquer-white': {
        id: 'lacquer-white', label: 'Weiß lackiert, seidenmatt', group: 'lack',
        faceScale: 2.0, depthScale: 1.25,
        surface: {
            kind: 'lacquer', color: '#eceae5', roughness: 0.34,
            clearcoat: 0.5, clearcoatRoughness: 0.3, relief: 0.14, bands: 26,
        },
    },
    'lacquer-black': {
        id: 'lacquer-black', label: 'Schwarz lackiert, hochglanz', group: 'lack',
        faceScale: 1.6, depthScale: 1.2,
        surface: {
            kind: 'lacquer', color: '#131315', roughness: 0.12,
            clearcoat: 1, clearcoatRoughness: 0.05, relief: 0.07, bands: 24,
        },
    },
    'lacquer-bordeaux': {
        id: 'lacquer-bordeaux', label: 'Bordeaux lackiert', group: 'lack',
        faceScale: 1.8, depthScale: 1.25,
        surface: {
            kind: 'lacquer', color: '#5c1a22', roughness: 0.2,
            clearcoat: 0.85, clearcoatRoughness: 0.12, relief: 0.1, bands: 25,
        },
    },
};

const STYLE_IDS = Object.keys(FRAME_STYLES) as FrameStyleId[];

export const FRAME_STYLE_GROUP_LABELS: Record<FrameStyleGroup, string> = {
    metall: 'Metall',
    holz: 'Holz',
    lack: 'Lack',
};

export function isFrameStyleId(value: unknown): value is FrameStyleId {
    return typeof value === 'string' && (STYLE_IDS as string[]).includes(value);
}

/** Falls back to the default for unknown / missing values (older instances, other branches). */
export function frameStyleOf(value: unknown): FrameStyleId {
    return isFrameStyleId(value) ? value : DEFAULT_FRAME_STYLE;
}

export function frameStyle(id: FrameStyleId): FrameStyle {
    return FRAME_STYLES[id] ?? FRAME_STYLES[DEFAULT_FRAME_STYLE];
}

export interface FrameProfile {
    /** Visible band around the picture, in meters. */
    faceWidth: number;
    /** How far the frame stands off the wall, in meters. */
    depth: number;
    /** Reach of a corner piece along each picture edge, in meters. */
    cornerArm: number;
}

export function frameProfile(id: FrameStyleId): FrameProfile {
    const style = frameStyle(id);
    return {
        faceWidth: BASE_FACE_WIDTH * style.faceScale,
        depth: BASE_PROFILE_DEPTH * style.depthScale,
        cornerArm: BASE_CORNER_ARM * style.faceScale,
    };
}

/** Styles in panel order, grouped. 'none' is offered as its own toggle, not in the list. */
export const SELECTABLE_FRAME_STYLES: FrameStyle[] = STYLE_IDS
    .filter((id) => id !== 'none')
    .map((id) => FRAME_STYLES[id]);
