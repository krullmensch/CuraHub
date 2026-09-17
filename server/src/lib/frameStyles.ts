import { z } from 'zod';

/**
 * Picture frame profiles an instance can use. Mirrors src/lib/frameStyles.ts on the client —
 * keep both lists in sync when a style is added. Stored as a plain string column so adding a
 * style needs no migration; the enum here is what rejects typos coming in over the API.
 */
export const FRAME_STYLE_IDS = [
    'none',
    'alu-silver',
    'alu-black',
    'oak-natural',
    'walnut',
    'ash-black',
    'lacquer-white',
    'lacquer-black',
    'lacquer-bordeaux',
] as const;

export const DEFAULT_FRAME_STYLE = 'alu-silver';

export const frameStyleSchema = z.enum(FRAME_STYLE_IDS);
