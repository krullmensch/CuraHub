import { z } from 'zod';

const AAB_STANDARD = [
    'aab-weiss', 'aab-weiss-lasiert', 'aab-lichtgrau', 'aab-anthrazit', 'aab-schwarz',
    'aab-aspe', 'aab-fichte', 'aab-ayous', 'aab-sipo', 'aab-esche-dunkel',
];
const AAB_WIDE = ['aab-weiss', 'aab-weiss-lasiert', 'aab-schwarz', 'aab-ayous'];

/**
 * Picture frames an instance can use: "<profile>-<finish>" for every combination HALBE and
 * Max Aab sell, or "none". Mirrors PROFILE_FINISHES in src/lib/frameStyles.ts on the client —
 * keep both in sync when the range changes. Stored as a plain string column so adding a style
 * needs no migration; the enum here is what rejects typos coming in over the API.
 */
const PROFILE_FINISHES: Record<string, string[]> = {
    alu6: ['silber-matt', 'weiss-matt', 'schwarz-matt', 'gold-matt'],
    alu7: ['silber-matt', 'weiss-matt', 'schwarz-matt'],
    alu8: ['silber-matt', 'weiss-matt', 'schwarz-matt', 'mittelgrau-matt', 'edelstahl-gebuerstet', 'chrom-glaenzend'],
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

export const FRAME_STYLE_IDS = [
    'none',
    ...Object.entries(PROFILE_FINISHES).flatMap(([profile, finishes]) => finishes.map((finish) => `${profile}-${finish}`)),
] as [string, ...string[]];

export const DEFAULT_FRAME_STYLE = 'alu8-silber-matt';

/** The first catalogue's ids (still in snapshots and caches of older clients). */
const LEGACY_FRAME_STYLES: Record<string, string> = {
    'alu-silver': 'alu8-silber-matt',
    'alu-black': 'alu8-schwarz-matt',
    'oak-natural': 'holz16-eiche-natur',
    'walnut': 'holz16-nussbaum-natur',
    'ash-black': 'holz16-eiche-schwarz',
    'lacquer-white': 'holz16-eiche-weiss',
    'lacquer-black': 'holz16-eiche-schwarz',
    'lacquer-bordeaux': 'holz16-erle-braun',
};

export const frameStyleSchema = z.preprocess(
    (value) => (typeof value === 'string' && value in LEGACY_FRAME_STYLES ? LEGACY_FRAME_STYLES[value] : value),
    z.enum(FRAME_STYLE_IDS),
);

/** Passepartout width at the sides in cm; 0 = none. */
export const passepartoutWidthSchema = z.number().min(0).max(50);
export const passepartoutPlacementSchema = z.enum(['center', 'optical-center', 'golden-ratio']);
