import { z } from 'zod';

/**
 * Messages of the live channel (`/api/live`), see docs/superpowers/specs/2026-10-03-live-collaboration-design.md.
 * Client messages are validated here; the client mirrors the types in src/lib/live/protocol.ts.
 */

export const EDITOR_MODES = ['orbit', 'firstPerson', 'wallEditor'] as const;
export type EditorMode = (typeof EDITOR_MODES)[number];

const id = z.number().int().positive();

/** `instance:12`, `wall:3`, `figure:7` — only database ids (temp ids are never claimed). */
export const CLAIM_KINDS = ['instance', 'wall', 'figure'] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export const CLAIM_KEY_RE = /^(instance|wall|figure):([1-9]\d{0,9})$/;
const claimKey = z.string().regex(CLAIM_KEY_RE);
export const MAX_CLAIM_KEYS = 2000;

/** Coordinates in metres; the room is a few dozen metres, anything far beyond is garbage. */
const coord = z.number().min(-1e4).max(1e4);
const vec3 = z.tuple([coord, coord, coord]);
const quat = z.tuple([z.number().min(-1).max(1), z.number().min(-1).max(1), z.number().min(-1).max(1), z.number().min(-1).max(1)]);
const scale = z.number().min(-1e3).max(1e3);
export const MAX_DRAG_OBJECTS = 300;

const transformSchema = z.object({
    k: claimKey,
    p: vec3,
    q: quat,
    s: z.tuple([scale, scale, scale]),
});

export const clientMessageSchema = z.discriminatedUnion('t', [
    z.object({
        t: z.literal('hello'),
        session: z.string().uuid(),
        token: z.string().min(1).max(4096).optional(),
    }),
    z.object({
        t: z.literal('where'),
        exhibitionId: id,
        versionId: id.nullable(),
        mode: z.enum(EDITOR_MODES),
    }),
    z.object({
        t: z.literal('visit'),
        slug: z.string().min(1).max(200),
    }),
    z.object({ t: z.literal('leave') }),
    z.object({
        // The full set this tab wants to hold, in all-or-nothing groups (a wall with its artworks).
        t: z.literal('claim'),
        seq: z.number().int().nonnegative(),
        groups: z.array(z.array(claimKey).min(1).max(MAX_CLAIM_KEYS)).max(MAX_CLAIM_KEYS),
    }),
    z.object({
        // Where this tab's camera is (editor) or where the visitor stands (viewer).
        t: z.literal('pose'),
        p: vec3,
        yaw: z.number().min(-100).max(100),
        pitch: z.number().min(-10).max(10),
    }),
    z.object({
        // Unsaved transforms of objects this tab holds, while it moves them.
        t: z.literal('drag'),
        transforms: z.array(transformSchema).max(MAX_DRAG_OBJECTS),
    }),
]);

export type LiveTransform = z.infer<typeof transformSchema>;

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export interface LiveUser {
    id: number;
    name: string;
    color: string;
}

export interface PresenceMember {
    session: string;
    userId: number;
    name: string;
    color: string;
    versionId: number | null;
    mode: EditorMode;
}

export interface ClaimHolder {
    session: string;
    userId: number;
    name: string;
    color: string;
}

export interface ClaimEntry extends ClaimHolder {
    key: string;
}

export type ServerMessage =
    | { t: 'welcome'; session: string; user: LiveUser | null }
    | { t: 'presence'; exhibitionId: number; members: PresenceMember[]; publicVisitors: number }
    | { t: 'visitors'; count: number }
    /** Answer to `claim`: every key this tab holds now, and what it asked for but someone else holds. */
    | { t: 'claimed'; seq: number; granted: string[]; denied: { key: string; holder: ClaimHolder }[] }
    /** All claims in a version, to its editors whenever they change. */
    | { t: 'claims'; versionId: number; entries: ClaimEntry[] }
    /** Entering (or resuming) a version: the number of its last change, to notice missed ones. */
    | { t: 'version'; versionId: number; seq: number }
    /** Something in a version changed; `by` is the tab that did it (null: no live session). */
    | { t: 'changed'; versionId: number; seq: number; by: string | null } & LiveChange
    /** Versions of an exhibition changed (graph, publish state); to its editors. */
    | { t: 'versions'; exhibitionId: number; event: VersionEvent; versionId: number; fallbackVersionId: number | null; by: string | null }
    /** Another tab's camera (editor) or another visitor's standing point (viewer, anonymous id). */
    | { t: 'pose'; session: string; p: [number, number, number]; yaw: number; pitch: number }
    /** A visitor (public viewer) left; `session` is their anonymous visitor id. */
    | { t: 'gone'; session: string }
    /** Another tab's objects while it moves them (not saved yet). */
    | { t: 'drag'; session: string; transforms: LiveTransform[] }
    | { t: 'error'; code: string; message: string };

export type LiveChange =
    | { kind: 'instance' | 'wall' | 'figure'; op: 'upsert'; data: { id: number } & Record<string, unknown> }
    | { kind: 'instance' | 'wall' | 'figure'; op: 'delete'; data: { id: number } }
    | { kind: 'artwork'; op: 'upsert'; data: { id: number } & Record<string, unknown> }
    | { kind: 'wallLayout'; op: 'upsert'; data: { hangingHeight: number; guides: unknown } };

export type VersionEvent = 'created' | 'deleted' | 'published' | 'featured';

/** WebSocket close codes (4000–4999 are free for applications). */
export const CLOSE = {
    replaced: 4000,
    unauthorized: 4401,
    forbidden: 4403,
    helloTimeout: 4408,
    sessionTaken: 4409,
    badMessage: 4400,
} as const;

/** Parses one raw frame; null for anything that is not a valid client message. */
export function parseClientMessage(raw: string): ClientMessage | null {
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return null;
    }
    const result = clientMessageSchema.safeParse(data);
    return result.success ? result.data : null;
}

/** Distinct colours on the dark editor UI; picked by user id so a person keeps theirs in every tab. */
export const USER_COLORS = [
    '#f97316', '#22c55e', '#3b82f6', '#e11d48', '#a855f7',
    '#eab308', '#06b6d4', '#ec4899', '#84cc16', '#6366f1',
] as const;

export const colorForUser = (userId: number): string => USER_COLORS[Math.abs(userId) % USER_COLORS.length];

/** Display name: the local part of the e-mail, as in the editor header. */
export const nameForEmail = (email: string): string => email.split('@')[0] || email;

export function parseClaimKey(key: string): { kind: ClaimKind; id: number } | null {
    const m = CLAIM_KEY_RE.exec(key);
    return m ? { kind: m[1] as ClaimKind, id: Number(m[2]) } : null;
}
