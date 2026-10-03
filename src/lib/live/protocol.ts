import { z } from 'zod';

/**
 * Client side of the live channel (`/api/live`). Mirrors server/src/live/protocol.ts;
 * design in docs/superpowers/specs/2026-10-03-live-collaboration-design.md.
 */

export const EDITOR_MODES = ['orbit', 'firstPerson', 'wallEditor'] as const;
export type EditorMode = (typeof EDITOR_MODES)[number];

export type ClientMessage =
  | { t: 'hello'; session: string; token?: string }
  | { t: 'where'; exhibitionId: number; versionId: number | null; mode: EditorMode }
  | { t: 'visit'; slug: string }
  | { t: 'leave' }
  | { t: 'claim'; seq: number; groups: string[][] };

const liveUserSchema = z.object({ id: z.number(), name: z.string(), color: z.string() });

const presenceMemberSchema = z.object({
  session: z.string(),
  userId: z.number(),
  name: z.string(),
  color: z.string(),
  versionId: z.number().nullable(),
  mode: z.enum(EDITOR_MODES),
});

const claimHolderSchema = z.object({ session: z.string(), userId: z.number(), name: z.string(), color: z.string() });
const claimEntrySchema = claimHolderSchema.extend({ key: z.string() });

const serverMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('welcome'), session: z.string(), user: liveUserSchema.nullable() }),
  z.object({
    t: z.literal('presence'),
    exhibitionId: z.number(),
    members: z.array(presenceMemberSchema),
    publicVisitors: z.number(),
  }),
  z.object({ t: z.literal('visitors'), count: z.number() }),
  z.object({
    t: z.literal('claimed'),
    seq: z.number(),
    granted: z.array(z.string()),
    denied: z.array(z.object({ key: z.string(), holder: claimHolderSchema })),
  }),
  z.object({ t: z.literal('claims'), versionId: z.number(), entries: z.array(claimEntrySchema) }),
  z.object({ t: z.literal('version'), versionId: z.number(), seq: z.number() }),
  z.object({
    t: z.literal('changed'),
    versionId: z.number(),
    seq: z.number(),
    by: z.string().nullable(),
    kind: z.enum(['instance', 'wall', 'figure', 'artwork', 'wallLayout']),
    op: z.enum(['upsert', 'delete']),
    // Rows as the REST routes return them; checked per kind where they are applied.
    data: z.record(z.string(), z.unknown()),
  }),
  z.object({
    t: z.literal('versions'),
    exhibitionId: z.number(),
    event: z.enum(['created', 'deleted', 'published', 'featured']),
    versionId: z.number(),
    fallbackVersionId: z.number().nullable(),
    by: z.string().nullable(),
  }),
  z.object({ t: z.literal('error'), code: z.string(), message: z.string() }),
]);

export type LiveUser = z.infer<typeof liveUserSchema>;
export type PresenceMember = z.infer<typeof presenceMemberSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ClaimHolder = z.infer<typeof claimHolderSchema>;
export type ClaimEntry = z.infer<typeof claimEntrySchema>;
export type ChangedMessage = Extract<ServerMessage, { t: 'changed' }>;
export type VersionsMessage = Extract<ServerMessage, { t: 'versions' }>;

/** Close codes the server uses (see server/src/live/protocol.ts). */
export const CLOSE = {
  replaced: 4000,
  badMessage: 4400,
  unauthorized: 4401,
  forbidden: 4403,
  helloTimeout: 4408,
  sessionTaken: 4409,
} as const;

/** Parses one frame; null for anything unknown (a newer server may send more types). */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = serverMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}
