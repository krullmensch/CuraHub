import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Setup state of this instance. Loaded once at start (index.ts), then kept in memory:
 * it only ever changes through the wizard (setSetupState) or a restart after reset-setup.
 */
export interface SetupState {
    complete: boolean;
    publicUrl: string | null;
}

export interface SettingsReader {
    systemSetting: {
        findMany(args: { where: { key: { in: string[] } } }): Promise<{ key: string; value: string }[]>;
    };
}

export const SETTING_COMPLETED = 'setup_completed_at';
export const SETTING_PUBLIC_URL = 'public_url';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TOKEN_TTL = '30m';

let state: SetupState | null = null;
// Memory only: a restart makes a new code and invalidates every setup token.
let setupCode: string | null = null;
let tokenSecret: Buffer | null = null;

export async function loadSetupState(db: SettingsReader): Promise<SetupState> {
    const rows = await db.systemSetting.findMany({ where: { key: { in: [SETTING_COMPLETED, SETTING_PUBLIC_URL] } } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    state = { complete: byKey.has(SETTING_COMPLETED), publicUrl: byKey.get(SETTING_PUBLIC_URL) ?? null };
    return state;
}

export function getSetupState(): SetupState | null {
    return state;
}

export function setSetupState(next: SetupState): void {
    state = next;
    if (next.complete) {
        setupCode = null;
        tokenSecret = null;
    }
}

export function generateSetupCode(pick: (n: number) => number = (n) => crypto.randomInt(n)): string {
    const chars = Array.from({ length: 12 }, () => CODE_ALPHABET[pick(CODE_ALPHABET.length)]);
    return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((g) => g.join('')).join('-');
}

function normalizeCode(input: string): string {
    return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function codesMatch(input: string, expected: string): boolean {
    const a = Buffer.from(normalizeCode(input));
    const b = Buffer.from(normalizeCode(expected));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function ensureSetupSecrets(): { code: string } {
    if (!setupCode || !tokenSecret) {
        setupCode = generateSetupCode();
        tokenSecret = crypto.randomBytes(32);
    }
    return { code: setupCode };
}

export function getSetupCode(): string | null {
    return setupCode;
}

/** Signed with an in-memory secret, never with JWT_SECRET: a setup token must not pass `authenticate`. */
export function issueSetupToken(): string {
    if (!tokenSecret) throw new Error('Setup ist nicht offen');
    return jwt.sign({ purpose: 'setup' }, tokenSecret, { expiresIn: TOKEN_TTL });
}

export function verifySetupToken(token: string): boolean {
    if (!tokenSecret) return false;
    try {
        const payload = jwt.verify(token, tokenSecret) as { purpose?: string };
        return payload.purpose === 'setup';
    } catch {
        return false;
    }
}

export function formatSetupBanner(code: string): string {
    const line = '='.repeat(52);
    return [
        line,
        ' CuraHub ist noch nicht eingerichtet.',
        ` Setup-Code: ${code}`,
        ' Öffne https://<deine-domain>/setup im Browser.',
        ' Nach einem Neustart gilt ein neuer Code.',
        line,
    ].join('\n');
}

export function resetSetupStateForTests(): void {
    state = null;
    setupCode = null;
    tokenSecret = null;
}
