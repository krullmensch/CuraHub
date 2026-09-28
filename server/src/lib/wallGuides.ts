import { z } from 'zod';

/**
 * Hanging height and ruler guides of the 2D wall editor, stored per exhibition version
 * (ExhibitionVersion.hanging_height / wall_guides). Guides are keyed by the client's face key:
 * `wall:<wallId>:<side>` for modular walls, the room face id (`room:…`) for walls of the room.
 * Wall ids change whenever a version is copied, so the keys are rewritten on the way
 * (old id → position in the copied wall list → new id). Mirrors src/lib/wallEditor/guides.ts.
 */

export const DEFAULT_HANGING_HEIGHT = 1.45;
export const MAX_GUIDES_PER_FACE = 200;
/** Upper bound on the number of wall faces a layout can carry guides for. */
export const MAX_GUIDE_FACES = 500;

export const guideSchema = z.object({
    axis: z.enum(['h', 'v']),
    // Guides may lie outside the wall face.
    value: z.number().min(-100).max(100),
});
export const wallGuidesSchema = z.record(z.string().min(1).max(200), z.array(guideSchema).max(MAX_GUIDES_PER_FACE))
    .refine((guides) => Object.keys(guides).length <= MAX_GUIDE_FACES, {
        message: `At most ${MAX_GUIDE_FACES} wall faces`,
    });
export const hangingHeightSchema = z.number().min(0.01).max(9.99);
export const wallLayoutPatchSchema = z.object({
    hangingHeight: hangingHeightSchema.optional(),
    guides: wallGuidesSchema.optional(),
});

export type WallGuides = z.infer<typeof wallGuidesSchema>;

const WALL_KEY = /^wall:(-?\d+):(front|back|left|right)$/;
const INDEX_KEY = /^wallIndex:(\d+):(front|back|left|right)$/;

/** Stored JSON → guides; null or invalid data counts as no guides. */
export function parseWallGuides(json: unknown): WallGuides {
    const parsed = wallGuidesSchema.safeParse(json ?? {});
    return parsed.success ? parsed.data : {};
}

/** `wall:<id>:<side>` → `wallIndex:<i>:<side>`. Walls missing from the map are dropped, other keys kept. */
export function guidesToIndexKeys(guides: WallGuides, wallIdToIndex: Map<number, number>): WallGuides {
    const out: WallGuides = {};
    for (const [key, list] of Object.entries(guides)) {
        const match = WALL_KEY.exec(key);
        if (!match) {
            out[key] = list;
            continue;
        }
        const index = wallIdToIndex.get(Number(match[1]));
        if (index !== undefined) out[`wallIndex:${index}:${match[2]}`] = list;
    }
    return out;
}

/** `wallIndex:<i>:<side>` → `wall:<newWallIds[i]>:<side>`. Unknown positions and leftover wall keys are dropped. */
export function guidesFromIndexKeys(guides: WallGuides, newWallIds: number[]): WallGuides {
    const out: WallGuides = {};
    for (const [key, list] of Object.entries(guides)) {
        if (WALL_KEY.test(key)) continue;
        const match = INDEX_KEY.exec(key);
        if (!match) {
            out[key] = list;
            continue;
        }
        const id = newWallIds[Number(match[1])];
        if (id !== undefined) out[`wall:${id}:${match[2]}`] = list;
    }
    return out;
}

/** Guides of a version whose walls were copied: old wall ids → positions → new wall ids. */
export function remapWallGuides(guides: WallGuides, wallIdToIndex: Map<number, number>, newWallIds: number[]): WallGuides {
    return guidesFromIndexKeys(guidesToIndexKeys(guides, wallIdToIndex), newWallIds);
}

/** Removes the guides of all faces of a deleted wall (the same object if it had none). */
export function dropWallGuides(guides: WallGuides, wallId: number): WallGuides {
    const prefix = `wall:${wallId}:`;
    if (!Object.keys(guides).some((key) => key.startsWith(prefix))) return guides;
    return Object.fromEntries(Object.entries(guides).filter(([key]) => !key.startsWith(prefix)));
}
