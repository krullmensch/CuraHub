// Catalogue of the picture frames and passepartouts a curator can pick per artwork.
//
// Two ranges, each modelled on a real maker:
// - HALBE magnet frames (halbe-rahmen.de, "Profil- und Farbübersicht"): aluminium and veneered
//   wood.
// - Max Aab (aab-bilderrahmen.com): solid-wood exchange frames, including a box frame (111).
//   Measurements and colours: docs/frames-aab-bilderrahmen.md.
// Every profile keeps its maker's face width (Aufsichtsmaß) and depth from the published
// cross-sections, every finish is one of the maker's colours, and a style is only offered for the
// profile/colour combinations actually sold. The one deliberate difference: the frame opening is
// always exactly the picture (or passepartout) — no rebate covers it.
//
// Pure data, no three.js import, so the geometry (frameProfileGeometry), the materials
// (frameMaterials), the wall editor footprints and the properties panel can all depend on it.
// server/src/lib/frameStyles.ts mirrors the style ids for API validation.

// ── Profiles ────────────────────────────────────────────────────────────────

export type FrameProfileId =
    | 'alu6' | 'alu7' | 'alu8' | 'alu12' | 'alu14' | 'alu18'
    | 'holz10' | 'holz16' | 'holz20' | 'holz22'
    | 'aab116' | 'aab102' | 'aab107' | 'aab111';

export type FrameManufacturer = 'halbe' | 'aab';

export type FrameMaterialGroup = 'alu' | 'holz';

/**
 * One moulding, all sizes in millimetres as the maker draws them. The cross-section is described
 * in two coordinates: `c` from the picture edge outwards (0 … width) and `z` from the wall to the
 * front (0 … depth).
 */
export interface FrameProfileSpec {
    id: FrameProfileId;
    /** German, shown in the properties panel. */
    label: string;
    manufacturer: FrameManufacturer;
    group: FrameMaterialGroup;
    /** Aufsichtsmaß: the visible band around the opening. */
    width: number;
    /** Profile depth from the wall to the front face. */
    depth: number;
    /**
     * How far the picture surface lies behind the front face: the frame's lip plus the glass.
     * This is the inner reveal a viewer sees between the front face and the picture.
     */
    reveal: number;
    /** Thickness of the part that carries the profile down to the wall (alu: the outer wall). */
    body: number;
    /** Front edge radii: next to the picture and on the outside. */
    innerRadius: number;
    outerRadius: number;
    /** Radius of the back edges (wood only, the extrusions are sharp there). */
    backRadius: number;
    /**
     * Box frames only (Aab 111 Objektrahmen): the space between the glass and the back board,
     * lined with a white lacquered spacer strip. The picture sits this much deeper.
     */
    objectDepth?: number;
    /**
     * Picture sizes (frame opening in cm, short × long side) the maker offers the profile for;
     * the panel warns outside this range. Missing = any size.
     */
    formats?: { min: [number, number]; max: [number, number] };
}

export const FRAME_PROFILES: Record<FrameProfileId, FrameProfileSpec> = {
    // Aluminium, HALBE magnet frames (Überrahmen). Walls ~1.5 mm, crisp edges except Alu 6
    // (two slightly rounded front edges) and Alu 12 (a soft radius towards the outside).
    alu6:  { id: 'alu6',  label: 'Alu 6',  manufacturer: 'halbe', group: 'alu', width: 8,    depth: 21.5, reveal: 4,   body: 1.3, innerRadius: 1.6, outerRadius: 2.2, backRadius: 0 },
    alu7:  { id: 'alu7',  label: 'Alu 7',  manufacturer: 'halbe', group: 'alu', width: 7.5,  depth: 21.5, reveal: 4,   body: 1.3, innerRadius: 0.3, outerRadius: 0.3, backRadius: 0 },
    alu8:  { id: 'alu8',  label: 'Alu 8',  manufacturer: 'halbe', group: 'alu', width: 9,    depth: 27,   reveal: 4.5, body: 1.4, innerRadius: 0.3, outerRadius: 0.3, backRadius: 0 },
    alu12: { id: 'alu12', label: 'Alu 12', manufacturer: 'halbe', group: 'alu', width: 12.5, depth: 27,   reveal: 4.5, body: 1.5, innerRadius: 0.4, outerRadius: 5,   backRadius: 0 },
    alu14: { id: 'alu14', label: 'Alu 14', manufacturer: 'halbe', group: 'alu', width: 13.5, depth: 27,   reveal: 4.5, body: 1.5, innerRadius: 0.3, outerRadius: 0.3, backRadius: 0 },
    alu18: { id: 'alu18', label: 'Alu 18', manufacturer: 'halbe', group: 'alu', width: 18,   depth: 40,   reveal: 5,   body: 1.8, innerRadius: 0.3, outerRadius: 0.3, backRadius: 0 },
    // Solid wood mouldings with a veneer, a rebate for glass and picture under the front, eased
    // edges all round.
    holz10: { id: 'holz10', label: 'Holz 10', manufacturer: 'halbe', group: 'holz', width: 13, depth: 29,   reveal: 7, body: 8.5,  innerRadius: 1.6, outerRadius: 1.1, backRadius: 1 },
    holz16: { id: 'holz16', label: 'Holz 16', manufacturer: 'halbe', group: 'holz', width: 17, depth: 29,   reveal: 7, body: 12,   innerRadius: 1.6, outerRadius: 1.1, backRadius: 1 },
    holz20: { id: 'holz20', label: 'Holz 20', manufacturer: 'halbe', group: 'holz', width: 21, depth: 30,   reveal: 7, body: 15.5, innerRadius: 2,   outerRadius: 1.2, backRadius: 1 },
    holz22: { id: 'holz22', label: 'Holz 22', manufacturer: 'halbe', group: 'holz', width: 21, depth: 41.5, reveal: 7, body: 16.5, innerRadius: 2,   outerRadius: 1.2, backRadius: 1 },
    // Max Aab solid wood, from the dimensioned cross-section photos: 2 mm glass in a rebate under
    // the lip (reveal = lip + glass), ~1 mm eased edges all round. The groove in the back for
    // stands and hangers lies against the wall and isn't modelled.
    aab116: { id: 'aab116', label: 'Aab 116', manufacturer: 'aab', group: 'holz', width: 15, depth: 19, reveal: 5.5, body: 11, innerRadius: 1,   outerRadius: 1,   backRadius: 1, formats: { min: [9, 9], max: [40, 40] } },
    aab102: { id: 'aab102', label: 'Aab 102', manufacturer: 'aab', group: 'holz', width: 20, depth: 24, reveal: 8,   body: 13, innerRadius: 1.2, outerRadius: 1.2, backRadius: 1, formats: { min: [35, 50], max: [70, 100] } },
    aab107: { id: 'aab107', label: 'Aab 107', manufacturer: 'aab', group: 'holz', width: 35, depth: 19, reveal: 6,   body: 28, innerRadius: 1.5, outerRadius: 1.5, backRadius: 1, formats: { min: [40, 50], max: [70, 100] } },
    // Box frame: 15 mm between the glass and the back board, lined with a white spacer.
    aab111: { id: 'aab111', label: 'Aab 111 Objektrahmen', manufacturer: 'aab', group: 'holz', width: 20, depth: 40, reveal: 9, body: 13, innerRadius: 1.2, outerRadius: 1.2, backRadius: 1, objectDepth: 15, formats: { min: [30, 30], max: [70, 100] } },
};

// ── Finishes ────────────────────────────────────────────────────────────────

export type FrameFinishId =
    | 'silber-matt' | 'weiss-matt' | 'schwarz-matt' | 'mittelgrau-matt'
    | 'edelstahl-gebuerstet' | 'chrom-glaenzend' | 'gold-matt'
    | 'ahorn-natur' | 'ahorn-weiss' | 'eiche-natur' | 'eiche-weiss' | 'eiche-grau'
    | 'eiche-schwarz' | 'erle-dunkel' | 'erle-braun' | 'nussbaum-natur'
    // Max Aab — prefixed so they never collide with a HALBE colour of the same name.
    | 'aab-weiss' | 'aab-weiss-lasiert' | 'aab-lichtgrau' | 'aab-anthrazit' | 'aab-schwarz'
    | 'aab-aspe' | 'aab-fichte' | 'aab-ayous' | 'aab-sipo' | 'aab-esche-dunkel'
    | 'aab-ahorn' | 'aab-kirsche' | 'aab-eiche';

/** Anodised or polished aluminium. `brushed` adds fine lengthwise grinding marks. */
export interface MetalSurface {
    kind: 'metal';
    color: string;
    metalness: number;
    roughness: number;
    brushed: boolean;
}

/** How the grain pattern of a species is laid out (see frameTextures.buildGrain). */
export type WoodSpecies =
    | 'eiche' | 'ahorn' | 'erle' | 'nussbaum'
    | 'esche' | 'fichte' | 'ayous' | 'aspe' | 'sipo' | 'kirsche';

/**
 * Veneered or solid wood. The colours are albedos, calibrated so that a frame in the gallery's
 * lighting (area lights + ACES filmic, exposure 1.1) renders like the maker's product photos.
 * HALBE: `light` matches the 90th, `dark` the 30th percentile of the moulding's pixels in those
 * photos; Aab: the render's 30th/50th/70th percentiles match the photo's.
 */
export interface WoodSurface {
    kind: 'wood';
    species: WoodSpecies;
    /** Light wood between the grain lines. */
    light: string;
    /** Inside a grain line. */
    dark: string;
    /** Open pores. */
    pore: string;
    /** 0…1: how strongly the grain shows in the colour. */
    contrast: number;
    /** 0…1: depth of the grain relief in the normal map. */
    relief: number;
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
}

/** Opaque, smooth lacquer without any grain showing (Aab Weiß, Lichtgrau). Albedo like wood. */
export interface LacquerSurface {
    kind: 'lacquer';
    color: string;
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
}

export type FrameSurface = MetalSurface | WoodSurface | LacquerSurface;

export interface FrameFinishSpec {
    id: FrameFinishId;
    label: string;
    manufacturer: FrameManufacturer;
    group: FrameMaterialGroup;
    surface: FrameSurface;
}

/** Aab's white lacquer — also the spacer strip lining the box frame (see objectDepth). */
const AAB_WHITE: LacquerSurface = { kind: 'lacquer', color: '#f5f1ef', roughness: 0.5, clearcoat: 0.1, clearcoatRoughness: 0.5 };
export const BOX_FRAME_SPACER_SURFACE = AAB_WHITE;

export const FRAME_FINISHES: Record<FrameFinishId, FrameFinishSpec> = {
    // Eloxal: matt anodised aluminium keeps a metallic sheen, the white one is dyed almost opaque.
    // Colours are tuned by eye against HALBE's photos in the gallery lighting — metals mostly
    // show the frame environment (frameMaterials.getFrameEnvironment), not the lights.
    'silber-matt':          { id: 'silber-matt', label: 'Silber matt', manufacturer: 'halbe', group: 'alu', surface: { kind: 'metal', color: '#a4a6a8', metalness: 0.9, roughness: 0.46, brushed: false } },
    'weiss-matt':           { id: 'weiss-matt', label: 'Weiß matt', manufacturer: 'halbe', group: 'alu', surface: { kind: 'metal', color: '#e4e4e1', metalness: 0.05, roughness: 0.5, brushed: false } },
    'schwarz-matt':         { id: 'schwarz-matt', label: 'Schwarz matt', manufacturer: 'halbe', group: 'alu', surface: { kind: 'metal', color: '#161617', metalness: 0.45, roughness: 0.5, brushed: false } },
    'mittelgrau-matt':      { id: 'mittelgrau-matt', label: 'Mittelgrau matt', manufacturer: 'halbe', group: 'alu', surface: { kind: 'metal', color: '#353637', metalness: 0.55, roughness: 0.48, brushed: false } },
    'edelstahl-gebuerstet': { id: 'edelstahl-gebuerstet', label: 'Edelstahl gebürstet', manufacturer: 'halbe', group: 'alu', surface: { kind: 'metal', color: '#acacab', metalness: 1, roughness: 0.3, brushed: true } },
    'chrom-glaenzend':      { id: 'chrom-glaenzend', label: 'Chrom glänzend', manufacturer: 'halbe', group: 'alu', surface: { kind: 'metal', color: '#d6d6d6', metalness: 1, roughness: 0.07, brushed: false } },
    'gold-matt':            { id: 'gold-matt', label: 'Gold matt', manufacturer: 'halbe', group: 'alu', surface: { kind: 'metal', color: '#9a7a48', metalness: 0.85, roughness: 0.48, brushed: false } },

    // Wood. "natur" = clear raw-wood lacquer, "weiß" on maple = white glaze with the grain showing,
    // "weiß"/"schwarz" on oak = opaque matt lacquer whose grain you still see and feel.
    'ahorn-natur':    { id: 'ahorn-natur', label: 'Ahorn natur', manufacturer: 'halbe', group: 'holz', surface: { kind: 'wood', species: 'ahorn', light: '#b58f6d', dark: '#977b62', pore: '#806c58', contrast: 1, relief: 0.25, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5 } },
    'ahorn-weiss':    { id: 'ahorn-weiss', label: 'Ahorn weiß', manufacturer: 'halbe', group: 'holz', surface: { kind: 'wood', species: 'ahorn', light: '#d7ccc1', dark: '#aea59e', pore: '#958d86', contrast: 0.6, relief: 0.25, roughness: 0.58, clearcoat: 0.1, clearcoatRoughness: 0.55 } },
    'eiche-natur':    { id: 'eiche-natur', label: 'Eiche natur', manufacturer: 'halbe', group: 'holz', surface: { kind: 'wood', species: 'eiche', light: '#ac8260', dark: '#6d5441', pore: '#584434', contrast: 1, relief: 0.6, roughness: 0.62, clearcoat: 0.1, clearcoatRoughness: 0.6 } },
    'eiche-weiss':    { id: 'eiche-weiss', label: 'Eiche weiß', manufacturer: 'halbe', group: 'holz', surface: { kind: 'wood', species: 'eiche', light: '#f5e8db', dark: '#bbb2a6', pore: '#9b938a', contrast: 0.35, relief: 0.5, roughness: 0.55, clearcoat: 0.1, clearcoatRoughness: 0.55 } },
    'eiche-grau':     { id: 'eiche-grau', label: 'Eiche grau', manufacturer: 'halbe', group: 'holz', surface: { kind: 'wood', species: 'eiche', light: '#605f5e', dark: '#4e4d4c', pore: '#41403e', contrast: 1, relief: 0.55, roughness: 0.6, clearcoat: 0.08, clearcoatRoughness: 0.6 } },
    'eiche-schwarz':  { id: 'eiche-schwarz', label: 'Eiche schwarz', manufacturer: 'halbe', group: 'holz', surface: { kind: 'wood', species: 'eiche', light: '#343434', dark: '#2b2a2b', pore: '#242425', contrast: 1, relief: 0.6, roughness: 0.62, clearcoat: 0.08, clearcoatRoughness: 0.6 } },
    'erle-dunkel':    { id: 'erle-dunkel', label: 'Erle dunkel', manufacturer: 'halbe', group: 'holz', surface: { kind: 'wood', species: 'erle', light: '#8f5f46', dark: '#724d39', pore: '#624230', contrast: 1, relief: 0.2, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.45 } },
    'erle-braun':     { id: 'erle-braun', label: 'Erle braun', manufacturer: 'halbe', group: 'holz', surface: { kind: 'wood', species: 'erle', light: '#342d2d', dark: '#2e2827', pore: '#272120', contrast: 1, relief: 0.2, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.45 } },
    'nussbaum-natur': { id: 'nussbaum-natur', label: 'Nussbaum natur', manufacturer: 'halbe', group: 'holz', surface: { kind: 'wood', species: 'nussbaum', light: '#735444', dark: '#553f33', pore: '#423027', contrast: 1, relief: 0.35, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5 } },

    // Max Aab. Weiß and Lichtgrau are smooth opaque lacquers. Schwarz and Anthrazit are lacquered
    // too, but over open-pored wood (ash-like) whose pores still show; "W. Lasiert" is a white glaze
    // over ash with dark open pores. The rest are natural woods under clear lacquer, Esche dunkel
    // is stained. Ahorn, Kirsche and Eiche are Aab's "Edelholz" (profile 102 only).
    'aab-weiss':         { id: 'aab-weiss', label: 'Weiß', manufacturer: 'aab', group: 'holz', surface: AAB_WHITE },
    'aab-weiss-lasiert': { id: 'aab-weiss-lasiert', label: 'Weiß lasiert', manufacturer: 'aab', group: 'holz', surface: { kind: 'wood', species: 'esche', light: '#d9cecc', dark: '#c3b8b6', pore: '#706a69', contrast: 1, relief: 0.5, roughness: 0.58, clearcoat: 0.08, clearcoatRoughness: 0.55 } },
    'aab-lichtgrau':     { id: 'aab-lichtgrau', label: 'Lichtgrau', manufacturer: 'aab', group: 'holz', surface: { kind: 'lacquer', color: '#8f8f92', roughness: 0.5, clearcoat: 0.1, clearcoatRoughness: 0.5 } },
    'aab-anthrazit':     { id: 'aab-anthrazit', label: 'Anthrazit', manufacturer: 'aab', group: 'holz', surface: { kind: 'wood', species: 'esche', light: '#4e4e52', dark: '#48474b', pore: '#3e3e41', contrast: 1, relief: 0.45, roughness: 0.58, clearcoat: 0.08, clearcoatRoughness: 0.6 } },
    'aab-schwarz':       { id: 'aab-schwarz', label: 'Schwarz', manufacturer: 'aab', group: 'holz', surface: { kind: 'wood', species: 'esche', light: '#323234', dark: '#2a2a2c', pore: '#242425', contrast: 1, relief: 0.55, roughness: 0.6, clearcoat: 0.08, clearcoatRoughness: 0.6 } },
    'aab-aspe':          { id: 'aab-aspe', label: 'Aspe', manufacturer: 'aab', group: 'holz', surface: { kind: 'wood', species: 'aspe', light: '#d9ccbe', dark: '#bbae9f', pore: '#aea294', contrast: 1, relief: 0.15, roughness: 0.6, clearcoat: 0.1, clearcoatRoughness: 0.55 } },
    'aab-fichte':        { id: 'aab-fichte', label: 'Fichte', manufacturer: 'aab', group: 'holz', surface: { kind: 'wood', species: 'fichte', light: '#c89c7a', dark: '#cb8f67', pore: '#ad7957', contrast: 1, relief: 0.3, roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.5 } },
    'aab-ayous':         { id: 'aab-ayous', label: 'Ayous', manufacturer: 'aab', group: 'holz', surface: { kind: 'wood', species: 'ayous', light: '#d0925d', dark: '#c28653', pore: '#a57246', contrast: 1, relief: 0.25, roughness: 0.58, clearcoat: 0.1, clearcoatRoughness: 0.55 } },
    'aab-sipo':          { id: 'aab-sipo', label: 'Mahagoni-Sipo', manufacturer: 'aab', group: 'holz', surface: { kind: 'wood', species: 'sipo', light: '#855a40', dark: '#774f38', pore: '#65432e', contrast: 1, relief: 0.25, roughness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.4 } },
    'aab-esche-dunkel':  { id: 'aab-esche-dunkel', label: 'Esche dunkel', manufacturer: 'aab', group: 'holz', surface: { kind: 'wood', species: 'esche', light: '#634229', dark: '#5a3b23', pore: '#4c311d', contrast: 1, relief: 0.55, roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.5 } },
    'aab-ahorn':         { id: 'aab-ahorn', label: 'Ahorn', manufacturer: 'aab', group: 'holz', surface: { kind: 'wood', species: 'ahorn', light: '#d1a788', dark: '#ca9a7a', pore: '#b78b6e', contrast: 1, relief: 0.2, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5 } },
    'aab-kirsche':       { id: 'aab-kirsche', label: 'Kirsche', manufacturer: 'aab', group: 'holz', surface: { kind: 'wood', species: 'kirsche', light: '#8b6146', dark: '#825a41', pore: '#6e4b36', contrast: 1, relief: 0.2, roughness: 0.5, clearcoat: 0.18, clearcoatRoughness: 0.45 } },
    'aab-eiche':         { id: 'aab-eiche', label: 'Eiche', manufacturer: 'aab', group: 'holz', surface: { kind: 'wood', species: 'eiche', light: '#896547', dark: '#7d5d41', pore: '#6a4e36', contrast: 1, relief: 0.55, roughness: 0.6, clearcoat: 0.1, clearcoatRoughness: 0.6 } },
};

const AAB_STANDARD: FrameFinishId[] = [
    'aab-weiss', 'aab-weiss-lasiert', 'aab-lichtgrau', 'aab-anthrazit', 'aab-schwarz',
    'aab-aspe', 'aab-fichte', 'aab-ayous', 'aab-sipo', 'aab-esche-dunkel',
];
const AAB_WIDE: FrameFinishId[] = ['aab-weiss', 'aab-weiss-lasiert', 'aab-schwarz', 'aab-ayous'];

/**
 * Which colours each maker sells per profile (HALBE: "Verfügbar in den Farben" / "Verfügbar bei
 * Profil", Aab: the colour choice on each profile's product page).
 */
export const PROFILE_FINISHES: Record<FrameProfileId, FrameFinishId[]> = {
    alu6:  ['silber-matt', 'weiss-matt', 'schwarz-matt', 'gold-matt'],
    alu7:  ['silber-matt', 'weiss-matt', 'schwarz-matt'],
    alu8:  ['silber-matt', 'weiss-matt', 'schwarz-matt', 'mittelgrau-matt', 'edelstahl-gebuerstet', 'chrom-glaenzend'],
    alu12: ['silber-matt', 'weiss-matt', 'schwarz-matt', 'mittelgrau-matt', 'edelstahl-gebuerstet'],
    alu14: ['silber-matt', 'weiss-matt', 'schwarz-matt', 'mittelgrau-matt', 'edelstahl-gebuerstet', 'chrom-glaenzend'],
    alu18: ['silber-matt', 'weiss-matt', 'schwarz-matt'],
    holz10: ['eiche-natur', 'eiche-schwarz', 'eiche-weiss', 'eiche-grau', 'ahorn-natur', 'ahorn-weiss', 'erle-dunkel', 'erle-braun', 'nussbaum-natur'],
    holz16: ['eiche-natur', 'eiche-schwarz', 'eiche-weiss', 'ahorn-natur', 'ahorn-weiss', 'erle-dunkel', 'erle-braun', 'nussbaum-natur'],
    holz20: ['eiche-natur', 'eiche-schwarz', 'ahorn-natur', 'ahorn-weiss', 'erle-dunkel', 'erle-braun', 'nussbaum-natur'],
    holz22: ['eiche-natur', 'eiche-schwarz', 'eiche-weiss', 'ahorn-natur', 'ahorn-weiss', 'nussbaum-natur'],
    aab116: AAB_STANDARD,
    aab102: [...AAB_STANDARD, 'aab-ahorn', 'aab-kirsche', 'aab-eiche'],
    aab107: AAB_WIDE,
    aab111: AAB_WIDE,
};

// ── Styles (profile × finish) ───────────────────────────────────────────────

/** `${profile}-${finish}`, e.g. "alu8-silber-matt", or "none" for an unframed work. */
export type FrameStyleId = 'none' | `${FrameProfileId}-${FrameFinishId}`;

export const DEFAULT_FRAME_STYLE: FrameStyleId = 'alu8-silber-matt';

const PROFILE_IDS = Object.keys(FRAME_PROFILES) as FrameProfileId[];

/** Every style on offer, in panel order. */
export const FRAME_STYLE_IDS: FrameStyleId[] = PROFILE_IDS.flatMap(
    (profile) => PROFILE_FINISHES[profile].map((finish) => `${profile}-${finish}` as FrameStyleId),
);

const STYLE_ID_SET = new Set<string>(['none', ...FRAME_STYLE_IDS]);

/** Styles of the first catalogue (before the HALBE range), still found in old snapshots. */
const LEGACY_STYLES: Record<string, FrameStyleId> = {
    'alu-silver': 'alu8-silber-matt',
    'alu-black': 'alu8-schwarz-matt',
    'oak-natural': 'holz16-eiche-natur',
    'walnut': 'holz16-nussbaum-natur',
    'ash-black': 'holz16-eiche-schwarz',
    'lacquer-white': 'holz16-eiche-weiss',
    'lacquer-black': 'holz16-eiche-schwarz',
    'lacquer-bordeaux': 'holz16-erle-braun',
};

export function isFrameStyleId(value: unknown): value is FrameStyleId {
    return typeof value === 'string' && STYLE_ID_SET.has(value);
}

/** Falls back to the default for unknown / missing values and maps the old catalogue's ids. */
export function frameStyleOf(value: unknown): FrameStyleId {
    if (isFrameStyleId(value)) return value;
    if (typeof value === 'string' && value in LEGACY_STYLES) return LEGACY_STYLES[value];
    return DEFAULT_FRAME_STYLE;
}

export interface FrameStyle {
    id: FrameStyleId;
    profile: FrameProfileSpec;
    finish: FrameFinishSpec;
}

/** Profile and finish of a framed style; null for 'none'. */
export function frameStyle(id: FrameStyleId): FrameStyle | null {
    if (id === 'none') return null;
    const style = frameStyleOf(id);
    if (style === 'none') return null;
    const cut = style.indexOf('-');
    const profileId = style.slice(0, cut) as FrameProfileId;
    const finishId = style.slice(cut + 1) as FrameFinishId;
    return { id: style, profile: FRAME_PROFILES[profileId], finish: FRAME_FINISHES[finishId] };
}

export function styleIdOf(profile: FrameProfileId, finish: FrameFinishId): FrameStyleId {
    return `${profile}-${finish}` as FrameStyleId;
}

/** sRGB bytes of a catalogue colour (#rrggbb). */
export function rgbOf(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Average look of a finish (sRGB bytes) — what a frame shows until its textures are ready. */
export function finishBaseColor(surface: FrameSurface): [number, number, number] {
    if (surface.kind !== 'wood') return rgbOf(surface.color);
    const light = rgbOf(surface.light);
    const dark = rgbOf(surface.dark);
    return light.map((v, i) => Math.round(v + (dark[i] - v) * 0.3 * surface.contrast)) as [number, number, number];
}

/** OKLab of sRGB bytes, so colour differences roughly match what the eye sees. */
function oklab([r, g, b]: [number, number, number]): [number, number, number] {
    const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

/** How different two finishes look: colour first, grain against grain, the same wood species. */
function lookDistance(a: FrameFinishSpec, b: FrameFinishSpec): number {
    const [la, aa, ba] = oklab(finishBaseColor(a.surface));
    const [lb, ab, bb] = oklab(finishBaseColor(b.surface));
    let distance = Math.hypot(la - lb, aa - ab, ba - bb);
    const grained = (f: FrameFinishSpec) => f.surface.kind === 'wood';
    if (grained(a) !== grained(b)) distance += 0.03;
    // "Ahorn natur" → "Ahorn" even if the makers' maple differs in tone; a black-lacquered oak
    // is still far enough from natural oak in colour to go to black instead.
    if (a.surface.kind === 'wood' && b.surface.kind === 'wood' && a.surface.species === b.surface.species) distance -= 0.06;
    return distance;
}

/** Colour family of a finish: "eiche" for eiche-natur, "esche" for aab-esche-dunkel. */
const familyOf = (id: FrameFinishId) => id.replace(/^aab-/, '').split('-')[0];

/**
 * Same colour on another profile, or — if the maker doesn't sell that combination — the closest
 * one it does: the same material family first (another oak, another matt anodising), then,
 * across makers, whatever looks most alike (HALBE Eiche schwarz → Aab Schwarz).
 */
export function styleForProfile(profile: FrameProfileId, preferredFinish: FrameFinishId | null): FrameStyleId {
    const available = PROFILE_FINISHES[profile];
    if (!preferredFinish) return styleIdOf(profile, available[0]);
    if (available.includes(preferredFinish)) return styleIdOf(profile, preferredFinish);
    const preferred = FRAME_FINISHES[preferredFinish];
    const family = familyOf(preferredFinish);
    const sameFamily = available.find((finish) =>
        FRAME_FINISHES[finish].manufacturer === preferred.manufacturer && familyOf(finish) === family);
    if (sameFamily) return styleIdOf(profile, sameFamily);
    let closest = available[0];
    let closestDistance = Infinity;
    for (const finish of available) {
        const distance = lookDistance(preferred, FRAME_FINISHES[finish]);
        if (distance < closestDistance) {
            closest = finish;
            closestDistance = distance;
        }
    }
    return styleIdOf(profile, closest);
}

export const FRAME_MANUFACTURER_LABELS: Record<FrameManufacturer, string> = {
    halbe: 'HALBE',
    aab: 'Max Aab',
};

const FRAME_GROUP_LABELS: Record<FrameManufacturer, Record<FrameMaterialGroup, string>> = {
    halbe: { alu: 'Aluminium', holz: 'Holz' },
    aab: { alu: 'Aluminium', holz: 'Massivholz' },
};

/** A maker's profiles of one material — one optgroup in the panel. */
export interface FrameLine {
    /** `${manufacturer}-${group}`, see frameLineOf. */
    key: string;
    label: string;
    profiles: FrameProfileSpec[];
}

export function frameLineOf(spec: { manufacturer: FrameManufacturer; group: FrameMaterialGroup }): string {
    return `${spec.manufacturer}-${spec.group}`;
}

/** Profiles in panel order, grouped by maker, then material. */
export const FRAME_LINES: FrameLine[] = PROFILE_IDS.reduce<FrameLine[]>((lines, id) => {
    const profile = FRAME_PROFILES[id];
    const key = frameLineOf(profile);
    let line = lines.find((l) => l.key === key);
    if (!line) {
        line = {
            key,
            label: `${FRAME_MANUFACTURER_LABELS[profile.manufacturer]} · ${FRAME_GROUP_LABELS[profile.manufacturer][profile.group]}`,
            profiles: [],
        };
        lines.push(line);
    }
    line.profiles.push(profile);
    return lines;
}, []);

/** Whether the maker offers a profile for a frame opening of `widthCm` × `heightCm`. */
export function profileFitsFormat(profile: FrameProfileSpec, widthCm: number, heightCm: number): boolean {
    if (!profile.formats) return true;
    const short = Math.min(Math.abs(widthCm), Math.abs(heightCm));
    const long = Math.max(Math.abs(widthCm), Math.abs(heightCm));
    const { min, max } = profile.formats;
    // Half a millimetre of slack for sizes typed in or scaled to e.g. 29.97 cm.
    const e = 0.05;
    return short >= min[0] - e && long >= min[1] - e && short <= max[0] + e && long <= max[1] + e;
}

// ── Passepartout ────────────────────────────────────────────────────────────

/** Where the window sits in the board — HALBE's three presets. */
export type PassepartoutPlacement = 'center' | 'optical-center' | 'golden-ratio';

export const PASSEPARTOUT_PLACEMENTS: { id: PassepartoutPlacement; label: string }[] = [
    { id: 'center', label: 'Mittig' },
    { id: 'optical-center', label: 'Optische Mitte' },
    { id: 'golden-ratio', label: 'Goldener Schnitt' },
];

export const DEFAULT_PASSEPARTOUT_WIDTH_CM = 5;
export const MAX_PASSEPARTOUT_WIDTH_CM = 50;

/** KLUG museum board, 1.5 mm — HALBE's standard for bevel-cut passepartouts. */
export const PASSEPARTOUT_THICKNESS = 0.0015;
/** How far the board reaches under the frame's lip, so no gap ever shows at the opening. */
export const PASSEPARTOUT_TUCK = 0.003;

export function isPassepartoutPlacement(value: unknown): value is PassepartoutPlacement {
    return value === 'center' || value === 'optical-center' || value === 'golden-ratio';
}

/** Margins in metres for a board `width` metres wide at the sides. */
export function passepartoutMargins(width: number, placement: PassepartoutPlacement): { side: number; top: number; bottom: number } {
    // Same formulas as HALBE's configurator: "optische Mitte" puts 93 % of the mean top/bottom
    // margin on top, the golden ratio gives the bottom 61.8 % of their sum.
    switch (placement) {
        case 'optical-center': return { side: width, top: width * 0.93, bottom: width * 1.07 };
        case 'golden-ratio': return { side: width, top: width * 2 * 0.382, bottom: width * 2 * 0.618 };
        default: return { side: width, top: width, bottom: width };
    }
}

// ── Layout of a framed picture ──────────────────────────────────────────────

export interface FramedArtworkInput {
    /** Picture size in metres (already scaled). */
    width: number;
    height: number;
    frameStyle: unknown;
    /** Passepartout width at the sides in centimetres, 0 or missing = none. */
    passepartoutWidth?: number | null;
    passepartoutPlacement?: unknown;
}

export interface PassepartoutLayout {
    /** Margins around the picture, metres. */
    side: number;
    top: number;
    bottom: number;
    /** z of the board's front face, relative to the wall. */
    frontZ: number;
}

export interface FramedArtworkLayout {
    style: FrameStyle | null;
    /** Frame opening (picture, or picture plus passepartout), metres. */
    openingWidth: number;
    openingHeight: number;
    /** Centre of the opening relative to the centre of the picture. */
    openingOffsetY: number;
    passepartout: PassepartoutLayout | null;
    /** z of the picture plane, relative to the wall. */
    pictureZ: number;
    /** How far the whole thing stands off the wall. */
    depth: number;
    /** Outer extent relative to the centre of the picture (frame included), metres. */
    left: number;
    right: number;
    bottom: number;
    top: number;
}

/** How far an unframed work stands off the wall — a mounted print rather than a sticker. */
export const UNFRAMED_DEPTH = 0.006;

const MM = 0.001;

/**
 * Everything the scene, the drag ghost and the wall editor need to know about a picture's frame
 * and passepartout. The picture is the anchor: its centre stays where the curator put it, the
 * passepartout and the frame grow around it (downwards more than upwards for the optical centre
 * and the golden ratio).
 */
export function framedArtworkLayout(input: FramedArtworkInput): FramedArtworkLayout {
    const { width, height } = input;
    const style = frameStyle(frameStyleOf(input.frameStyle));
    if (!style) {
        return {
            style: null, openingWidth: width, openingHeight: height, openingOffsetY: 0, passepartout: null,
            pictureZ: UNFRAMED_DEPTH, depth: UNFRAMED_DEPTH,
            left: -width / 2, right: width / 2, bottom: -height / 2, top: height / 2,
        };
    }

    const profile = style.profile;
    const depth = profile.depth * MM;
    // A hair behind the lip, so the picture/board never shares a plane with the profile. In a
    // box frame the picture (and a passepartout) lie on the back board, behind the spacer.
    const surfaceZ = depth - (profile.reveal + (profile.objectDepth ?? 0)) * MM - 0.0002;
    const matWidth = Math.min(Math.max(input.passepartoutWidth ?? 0, 0), MAX_PASSEPARTOUT_WIDTH_CM) / 100;
    const placement = isPassepartoutPlacement(input.passepartoutPlacement) ? input.passepartoutPlacement : 'center';
    const margins = matWidth > 0 ? passepartoutMargins(matWidth, placement) : null;

    const side = margins?.side ?? 0;
    const top = margins?.top ?? 0;
    const bottom = margins?.bottom ?? 0;
    const openingWidth = width + 2 * side;
    const openingHeight = height + top + bottom;
    const face = profile.width * MM;

    return {
        style,
        openingWidth,
        openingHeight,
        openingOffsetY: (top - bottom) / 2,
        passepartout: margins ? { ...margins, frontZ: surfaceZ } : null,
        pictureZ: margins ? surfaceZ - PASSEPARTOUT_THICKNESS : surfaceZ,
        depth,
        left: -width / 2 - side - face,
        right: width / 2 + side + face,
        bottom: -height / 2 - bottom - face,
        top: height / 2 + top + face,
    };
}
