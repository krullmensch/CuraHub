const DEV_FALLBACK = 'supersecret_dev_key';

/** The JWT signing secret. Production refuses to start without one instead of signing with a public key. */
export function resolveJwtSecret(env: Record<string, string | undefined>): string {
    if (env.JWT_SECRET) return env.JWT_SECRET;
    if (env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET fehlt: weder als Umgebungsvariable gesetzt noch in /run/curahub-secrets/jwt_secret gefunden.');
    }
    return DEV_FALLBACK;
}

export const JWT_SECRET = resolveJwtSecret(process.env);
