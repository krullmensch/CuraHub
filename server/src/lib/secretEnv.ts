import fs from 'fs';
import path from 'path';

/**
 * Fresh installs: the compose `init` service writes random secrets into a volume mounted here.
 * The server (and every script run with `docker compose exec`) reads them itself when
 * DATABASE_URL / JWT_SECRET are not set, so no .env is needed. Values set in the
 * environment always win (existing installations keep their .env).
 */
export const DEFAULT_SECRETS_DIR = '/run/curahub-secrets';

type Env = Record<string, string | undefined>;

function readSecret(dir: string, name: string, read: (p: string) => string): string | null {
    try {
        const value = read(path.join(dir, name)).trim();
        return value || null;
    } catch {
        return null;
    }
}

export function applySecretFiles(
    env: Env,
    dir: string = env.SECRETS_DIR || DEFAULT_SECRETS_DIR,
    read: (p: string) => string = (p) => fs.readFileSync(p, 'utf8'),
): void {
    if (!env.DATABASE_URL) {
        const password = readSecret(dir, 'db_password', read);
        if (password) env.DATABASE_URL = `mysql://curahub:${encodeURIComponent(password)}@db:3306/curahub`;
    }
    if (!env.JWT_SECRET) {
        const secret = readSecret(dir, 'jwt_secret', read);
        if (secret) env.JWT_SECRET = secret;
    }
}
