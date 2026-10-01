// Mirror of server/src/lib/setupValidation.ts — keep both in sync.
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

export function usernameProblem(name: string): string | null {
    if (name.length < 3 || name.length > 32) return 'Der Benutzername muss 3–32 Zeichen lang sein.';
    if (!LOCAL_USERNAME_RE.test(name)) return 'Erlaubt sind nur a–z, 0–9, Punkt, Unterstrich und Bindestrich.';
    return null;
}

export function passwordProblem(password: string, repeat: string): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) return `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
    if (password.length > MAX_PASSWORD_LENGTH) return `Das Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen haben.`;
    if (password !== repeat) return 'Die Passwörter stimmen nicht überein.';
    return null;
}
