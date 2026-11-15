/**
 * The room's light rig (Satellit + Scene), in one place.
 *
 * Light needs a direction so that wall corners, wall ends and modular-wall edges read: with only
 * ambient / hemisphere / area light from above, two perpendicular white walls get the same light
 * and the edge between them disappears. The key light comes from the window wall (−Z), off-axis,
 * so all four wall directions end up with a different brightness; a weak counter light keeps the
 * walls facing away from it from going dull. Spec: docs/superpowers/specs/2026-11-15-raum-shading-design.md
 *
 * The downward area light stays at 3.5: the frame colours are calibrated against it
 * (docs/frames-aab-bilderrahmen.md §5).
 */

export type Vec3 = [number, number, number];

export interface DirectionalLightSpec {
    position: Vec3;
    intensity: number;
    color: string;
}

export interface RoomLightRig {
    ambient: number;
    /** Only in the preset without area lights ("Niedrig"). */
    hemisphere: { sky: string; ground: string; intensity: number } | null;
    directional: DirectionalLightSpec[];
    /** Ceiling area light facing down (0 = not rendered). */
    rectDown: number;
    /** Ceiling area light facing up, brightens the ceiling (0 = not rendered). */
    rectUp: number;
}

const WARM = '#fff5e0';
const COOL = '#f8f8ff';

/** Key light: from the window wall (−Z), above and to the −X side. */
const KEY_POSITION: Vec3 = [-3, 6, -8];
/** Counter light: from the opposite side, weaker. */
const COUNTER_POSITION: Vec3 = [4, 5, 6];

const RIG_WITH_AREA_LIGHTS: RoomLightRig = {
    ambient: 0.35,
    hemisphere: null,
    directional: [
        { position: KEY_POSITION, intensity: 1.0, color: WARM },
        { position: COUNTER_POSITION, intensity: 0.3, color: COOL },
    ],
    rectDown: 3.5,
    rectUp: 1.2,
};

const RIG_WITHOUT_AREA_LIGHTS: RoomLightRig = {
    ambient: 0.3,
    hemisphere: { sky: WARM, ground: '#f4efe8', intensity: 1.1 },
    directional: [
        { position: KEY_POSITION, intensity: 1.5, color: WARM },
        { position: COUNTER_POSITION, intensity: 0.45, color: COOL },
        // Replaces the upward area light that brightens the ceiling.
        { position: [0, -10, 0], intensity: 1.2, color: WARM },
    ],
    rectDown: 0,
    rectUp: 0,
};

/** The light rig for the render preset: `rectAreaLights` false in "Niedrig". */
export function roomLightRig(rectAreaLights: boolean): RoomLightRig {
    return rectAreaLights ? RIG_WITH_AREA_LIGHTS : RIG_WITHOUT_AREA_LIGHTS;
}

/** The rig before 2026-11-15, kept only to compare brightness in the tests. */
export const LEGACY_ROOM_LIGHT_RIG: Record<'rect' | 'noRect', RoomLightRig> = {
    rect: {
        ambient: 0.4,
        hemisphere: null,
        directional: [{ position: [-6, 6, -4], intensity: 0.3, color: COOL }],
        rectDown: 3.5,
        rectUp: 1.2,
    },
    noRect: {
        ambient: 0.4,
        hemisphere: { sky: WARM, ground: '#f4efe8', intensity: 1.7 },
        directional: [
            { position: [-6, 6, -4], intensity: 0.3, color: COOL },
            { position: [0, -10, 0], intensity: 1.2, color: WARM },
        ],
        rectDown: 0,
        rectUp: 0,
    },
};

/** Inner face normals of the four wall directions. */
export const WALL_NORMALS: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

/**
 * Rough guess of how much of the ceiling area lights reaches a vertical wall (per unit of
 * intensity). Only used for the brightness estimate below, not for rendering. The estimate is a
 * guard against accidental changes; the rig itself was tuned on screenshots.
 */
export const RECT_WALL_SHARE = 0.25;

function luminance(hex: string): number {
    const v = parseInt(hex.slice(1), 16);
    const r = ((v >> 16) & 255) / 255;
    const g = ((v >> 8) & 255) / 255;
    const b = (v & 255) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Rough Lambert estimate of the light a wall with the given normal receives: ambient, the
 * hemisphere (half sky, half ground on a vertical wall), every directional light by the angle to
 * the wall and a fixed share of the area lights. Intensities only, light colours ignored except
 * for the hemisphere's.
 */
export function wallIrradiance(rig: RoomLightRig, normal: Vec3): number {
    let e = rig.ambient;
    if (rig.hemisphere) {
        const { sky, ground, intensity } = rig.hemisphere;
        e += ((luminance(sky) + luminance(ground)) / 2) * intensity;
    }
    for (const light of rig.directional) {
        const [x, y, z] = light.position;
        const len = Math.hypot(x, y, z);
        const cos = (normal[0] * x + normal[1] * y + normal[2] * z) / len;
        e += light.intensity * Math.max(0, cos);
    }
    return e + RECT_WALL_SHARE * (rig.rectDown + rig.rectUp);
}
