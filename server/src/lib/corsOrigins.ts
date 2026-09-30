/**
 * SEC-07: origins allowed to call the API cross-origin. CORS_ORIGINS (comma-separated) wins;
 * otherwise the public URL from the setup. Without either no CORS headers are sent — the SPA
 * is served from the same origin as the API and needs none.
 */
export function allowedOrigins(env: Record<string, string | undefined>, publicUrl: string | null): string[] {
    const fromEnv = (env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
    if (fromEnv.length > 0) return fromEnv;
    return publicUrl ? [publicUrl] : [];
}
