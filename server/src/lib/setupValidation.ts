import { z } from 'zod';

// Mirrored in src/lib/setup/validation.ts (client) — keep both in sync.
export const LOCAL_USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** The instance's public origin: https, or plain http only for localhost tests. */
export function normalizePublicUrl(input: string): string | null {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        return null;
    }
    const isHttps = url.protocol === 'https:';
    const isLocalHttp = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
    if (!isHttps && !isLocalHttp) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    return url.origin;
}

export const completeSetupSchema = z.object({
    publicUrl: z.string().refine((v) => normalizePublicUrl(v) !== null, 'Ungültige öffentliche Adresse'),
    localAdmin: z.object({
        username: z.string().regex(LOCAL_USERNAME_RE, 'Ungültiger Benutzername'),
        password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
    }),
    hsbiAdmin: z.object({
        username: z.string().trim().min(1).max(100).refine((u) => !u.includes('@'), 'Nur die HSBI-Kennung, ohne @hsbi.de'),
        password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
    }).optional(),
});

export type CompleteSetupBody = z.infer<typeof completeSetupSchema>;
