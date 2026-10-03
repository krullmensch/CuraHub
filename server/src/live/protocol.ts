import { z } from 'zod';

/**
 * Messages of the live channel (`/api/live`), see docs/superpowers/specs/2026-10-03-live-collaboration-design.md.
 * Client messages are validated here; the client mirrors the types in src/lib/live/protocol.ts.
 */

export const EDITOR_MODES = ['orbit', 'firstPerson', 'wallEditor'] as const;
export type EditorMode = (typeof EDITOR_MODES)[number];

const id = z.number().int().positive();

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
]);

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

export type ServerMessage =
    | { t: 'welcome'; session: string; user: LiveUser | null }
    | { t: 'presence'; exhibitionId: number; members: PresenceMember[]; publicVisitors: number }
    | { t: 'visitors'; count: number }
    | { t: 'error'; code: string; message: string };

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
