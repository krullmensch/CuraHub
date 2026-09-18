// Catalogue of the picture frames and passepartouts a curator can pick per artwork.
//
// Modelled on the HALBE magnet frame range (halbe-rahmen.de, "Profil- und Farbübersicht"):
// every profile keeps HALBE's face width (Aufsichtsmaß) and depth from the published
// cross-section drawings, every finish is one of HALBE's colours, and a style is only offered
// for the profile/colour combinations HALBE actually sells. The one deliberate difference:
// the frame opening is always exactly the picture (or passepartout) — no rebate covers it.
//
// Pure data, no three.js import, so the geometry (frameProfileGeometry), the materials
// (frameMaterials), the wall editor footprints and the properties panel can all depend on it.
// server/src/lib/frameStyles.ts mirrors the style ids for API validation.

// ── Profiles ────────────────────────────────────────────────────────────────

export type FrameProfileId =
    | 'alu6' | 'alu7' | 'alu8' | 'alu12' | 'alu14' | 'alu18'
    | 'holz10' | 'holz16' | 'holz20' | 'holz22';

export type FrameMaterialGroup = 'alu' | 'holz';

/**
 * One moulding, all sizes in millimetres as HALBE draws them. The cross-section is described in
 * two coordinates: `c` from the picture edge outwards (0 … width) and `z` from the wall to the
 * front (0 … depth).
 */
export interface FrameProfileSpec {
    id: FrameProfileId;
    /** German, shown in the properties panel. */
    label: string;
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
}

export const FRAME_PROFILES: Record<FrameProfileId, FrameProfileSpec> = {
    // Aluminium, HALBE magnet frames (Überrahmen). Walls ~1.5 mm, crisp edges except Alu 6
    // (two slightly rounded front edges) and Alu 12 (a soft radius towards the outside).
    alu6:  { id: 'alu6',  label: 'Alu 6',  group: 'alu', width: 8,    depth: 21.5, reveal: 4,   body: 1.3, innerRadius: 1.6, outerRadius: 2.2, backRadius: 0 },
    alu7:  { id: 'alu7',  label: 'Alu 7',  group: 'alu', width: 7.5,  depth: 21.5, reveal: 4,   body: 1.3, innerRadius: 0.3, outerRadius: 0.3, backRadius: 0 },
    alu8:  { id: 'alu8',  label: 'Alu 8',  group: 'alu', width: 9,    depth: 27,   reveal: 4.5, body: 1.4, innerRadius: 0.3, outerRadius: 0.3, backRadius: 0 },
    alu12: { id: 'alu12', label: 'Alu 12', group: 'alu', width: 12.5, depth: 27,   reveal: 4.5, body: 1.5, innerRadius: 0.4, outerRadius: 5,   backRadius: 0 },
    alu14: { id: 'alu14', label: 'Alu 14', group: 'alu', width: 13.5, depth: 27,   reveal: 4.5, body: 1.5, innerRadius: 0.3, outerRadius: 0.3, backRadius: 0 },
    alu18: { id: 'alu18', label: 'Alu 18', group: 'alu', width: 18,   depth: 40,   reveal: 5,   body: 1.8, innerRadius: 0.3, outerRadius: 0.3, backRadius: 0 },
    // Solid wood mouldings with a veneer, a rebate for glass and picture under the front, eased
    // edges all round.
    holz10: { id: 'holz10', label: 'Holz 10', group: 'holz', width: 13, depth: 29,   reveal: 7, body: 8.5,  innerRadius: 1.6, outerRadius: 1.1, backRadius: 1 },
    holz16: { id: 'holz16', label: 'Holz 16', group: 'holz', width: 17, depth: 29,   reveal: 7, body: 12,   innerRadius: 1.6, outerRadius: 1.1, backRadius: 1 },
    holz20: { id: 'holz20', label: 'Holz 20', group: 'holz', width: 21, depth: 30,   reveal: 7, body: 15.5, innerRadius: 2,   outerRadius: 1.2, backRadius: 1 },
    holz22: { id: 'holz22', label: 'Holz 22', group: 'holz', width: 21, depth: 41.5, reveal: 7, body: 16.5, innerRadius: 2,   outerRadius: 1.2, backRadius: 1 },
};

// ── Finishes ────────────────────────────────────────────────────────────────

export type FrameFinishId =
    | 'silber-matt' | 'weiss-matt' | 'schwarz-matt' | 'mittelgrau-matt'
    | 'edelstahl-gebuerstet' | 'chrom-glaenzend' | 'gold-matt'
    | 'ahorn-natur' | 'ahorn-weiss' | 'eiche-natur' | 'eiche-weiss' | 'eiche-grau'
    | 'eiche-schwarz' | 'erle-dunkel' | 'erle-braun' | 'nussbaum-natur';

/** Anodised or polished aluminium. `brushed` adds fine lengthwise grinding marks. */
export interface MetalSurface {
    kind: 'metal';
    color: string;
    metalness: number;
    roughness: number;
    brushed: boolean;
}

/** How the grain pattern of a species is laid out (see frameMaterials.buildGrain). */
export type WoodSpecies = 'eiche' | 'ahorn' | 'erle' | 'nussbaum';

/**
 * Veneered wood. The colours are albedos, calibrated so that a frame in the gallery's lighting
 * (area lights + ACES filmic, exposure 1.1) renders like HALBE's product photos: `light` matches
 * the 90th, `dark` the 30th percentile of the moulding's pixels in those photos.
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

export type FrameSurface = MetalSurface | WoodSurface;

export interface FrameFinishSpec {
    id: FrameFinishId;
    label: string;
    group: FrameMaterialGroup;
    surface: FrameSurface;
}

export const FRAME_FINISHES: Record<FrameFinishId, FrameFinishSpec> = {
    // Eloxal: matt anodised aluminium keeps a metallic sheen, the white one is dyed almost opaque.
    // Colours are tuned by eye against HALBE's photos in the gallery lighting — metals mostly
    // show the frame environment (frameMaterials.getFrameEnvironment), not the lights.
    'silber-matt':          { id: 'silber-matt', label: 'Silber matt', group: 'alu', surface: { kind: 'metal', color: '#a4a6a8', metalness: 0.9, roughness: 0.46, brushed: false } },
    'weiss-matt':           { id: 'weiss-matt', label: 'Weiß matt', group: 'alu', surface: { kind: 'metal', color: '#e4e4e1', metalness: 0.05, roughness: 0.5, brushed: false } },
    'schwarz-matt':         { id: 'schwarz-matt', label: 'Schwarz matt', group: 'alu', surface: { kind: 'metal', color: '#161617', metalness: 0.45, roughness: 0.5, brushed: false } },
    'mittelgrau-matt':      { id: 'mittelgrau-matt', label: 'Mittelgrau matt', group: 'alu', surface: { kind: 'metal', color: '#353637', metalness: 0.55, roughness: 0.48, brushed: false } },
    'edelstahl-gebuerstet': { id: 'edelstahl-gebuerstet', label: 'Edelstahl gebürstet', group: 'alu', surface: { kind: 'metal', color: '#acacab', metalness: 1, roughness: 0.3, brushed: true } },
    'chrom-glaenzend':      { id: 'chrom-glaenzend', label: 'Chrom glänzend', group: 'alu', surface: { kind: 'metal', color: '#d6d6d6', metalness: 1, roughness: 0.07, brushed: false } },
    'gold-matt':            { id: 'gold-matt', label: 'Gold matt', group: 'alu', surface: { kind: 'metal', color: '#9a7a48', metalness: 0.85, roughness: 0.48, brushed: false } },

    // Wood. "natur" = clear raw-wood lacquer, "weiß" on maple = white glaze with the grain showing,
    // "weiß"/"schwarz" on oak = opaque matt lacquer whose grain you still see and feel.
    'ahorn-natur':    { id: 'ahorn-natur', label: 'Ahorn natur', group: 'holz', surface: { kind: 'wood', species: 'ahorn', light: '#b58f6d', dark: '#977b62', pore: '#806c58', contrast: 1, relief: 0.25, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5 } },
    'ahorn-weiss':    { id: 'ahorn-weiss', label: 'Ahorn weiß', group: 'holz', surface: { kind: 'wood', species: 'ahorn', light: '#d7ccc1', dark: '#aea59e', pore: '#958d86', contrast: 0.6, relief: 0.25, roughness: 0.58, clearcoat: 0.1, clearcoatRoughness: 0.55 } },
    'eiche-natur':    { id: 'eiche-natur', label: 'Eiche natur', group: 'holz', surface: { kind: 'wood', species: 'eiche', light: '#ac8260', dark: '#6d5441', pore: '#584434', contrast: 1, relief: 0.6, roughness: 0.62, clearcoat: 0.1, clearcoatRoughness: 0.6 } },
    'eiche-weiss':    { id: 'eiche-weiss', label: 'Eiche weiß', group: 'holz', surface: { kind: 'wood', species: 'eiche', light: '#f5e8db', dark: '#bbb2a6', pore: '#9b938a', contrast: 0.35, relief: 0.5, roughness: 0.55, clearcoat: 0.1, clearcoatRoughness: 0.55 } },
    'eiche-grau':     { id: 'eiche-grau', label: 'Eiche grau', group: 'holz', surface: { kind: 'wood', species: 'eiche', light: '#605f5e', dark: '#4e4d4c', pore: '#41403e', contrast: 1, relief: 0.55, roughness: 0.6, clearcoat: 0.08, clearcoatRoughness: 0.6 } },
    'eiche-schwarz':  { id: 'eiche-schwarz', label: 'Eiche schwarz', group: 'holz', surface: { kind: 'wood', species: 'eiche', light: '#343434', dark: '#2b2a2b', pore: '#242425', contrast: 1, relief: 0.6, roughness: 0.62, clearcoat: 0.08, clearcoatRoughness: 0.6 } },
    'erle-dunkel':    { id: 'erle-dunkel', label: 'Erle dunkel', group: 'holz', surface: { kind: 'wood', species: 'erle', light: '#8f5f46', dark: '#724d39', pore: '#624230', contrast: 1, relief: 0.2, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.45 } },
    'erle-braun':     { id: 'erle-braun', label: 'Erle braun', group: 'holz', surface: { kind: 'wood', species: 'erle', light: '#342d2d', dark: '#2e2827', pore: '#272120', contrast: 1, relief: 0.2, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.45 } },
    'nussbaum-natur': { id: 'nussbaum-natur', label: 'Nussbaum natur', group: 'holz', surface: { kind: 'wood', species: 'nussbaum', light: '#735444', dark: '#553f33', pore: '#423027', contrast: 1, relief: 0.35, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5 } },
};

/** Which colours HALBE sells per profile ("Verfügbar in den Farben" / "Verfügbar bei Profil"). */
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
};

// ── Styles (profile × finish) ───────────────────────────────────────────────

/** `${profile}-${finish}`, e.g. "alu8-silber-matt", or "none" for an unframed work. */
export type FrameStyleId = 'none' | `${FrameProfileId}-${FrameFinishId}`;

export const DEFAULT_FRAME_STYLE: FrameStyleId = 'alu8-silber-matt';

const PROFILE_IDS = Object.keys(FRAME_PROFILES) as FrameProfileId[];

/** Every style HALBE sells, in panel order. */
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

/**
 * Same colour on another profile, or — if HALBE doesn't make that combination — the closest one
 * it does: the same material family first (another oak, another matt anodising), then the first.
 */
export function styleForProfile(profile: FrameProfileId, preferredFinish: FrameFinishId | null): FrameStyleId {
    const available = PROFILE_FINISHES[profile];
    if (preferredFinish && available.includes(preferredFinish)) return styleIdOf(profile, preferredFinish);
    const family = preferredFinish?.split('-')[0];
    const sameFamily = family ? available.find((finish) => finish.startsWith(`${family}-`)) : undefined;
    return styleIdOf(profile, sameFamily ?? available[0]);
}

export const FRAME_GROUP_LABELS: Record<FrameMaterialGroup, string> = {
    alu: 'Aluminium',
    holz: 'Holz',
};

/** Profiles in panel order, grouped by material. */
export const PROFILE_GROUPS: [FrameMaterialGroup, FrameProfileSpec[]][] = (['alu', 'holz'] as FrameMaterialGroup[])
    .map((group) => [group, PROFILE_IDS.map((id) => FRAME_PROFILES[id]).filter((p) => p.group === group)]);

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
    // A hair behind the lip, so the picture/board never shares a plane with the profile.
    const surfaceZ = depth - profile.reveal * MM - 0.0002;
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
