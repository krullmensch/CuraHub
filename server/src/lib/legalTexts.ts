import { z } from 'zod';
import type { CheckStatus } from './systemChecks';

/**
 * Impressum (§ 5 DDG) and Datenschutzerklärung (Art. 13 DSGVO) of this installation. CuraHub is
 * self-hosted, so only the operator knows who is responsible: they enter their details once — in
 * the setup wizard or later on /users — and the client builds both texts from them
 * (src/lib/legal/documents.ts). An own Markdown text per document replaces the generated one.
 *
 * Mirrored in src/lib/legal/operator.ts (client) — keep the fields in sync.
 */

const text = (max = 500) => z.string().trim().max(max).default('');

export const legalOperatorSchema = z.object({
    /** 'public': Hochschule or other public body (Art. 6 Abs. 1 Buchst. e DSGVO); 'private': everyone else. */
    kind: z.enum(['public', 'private']).default('public'),
    name: text(200),
    legalForm: text(200),
    representative: text(200),
    street: text(200),
    postalCode: text(20),
    city: text(100),
    email: z.union([z.literal(''), z.string().trim().max(200).regex(/^[^\s@]+@[^\s@]+$/, 'Ungültige E-Mail-Adresse')]).default(''),
    phone: text(50),
    register: text(),
    supervisoryAuthority: text(),
    contentResponsible: text(),
    dpo: text(),
    stateLaw: text(200),
    dataProtectionAuthority: text(),
    hosting: text(),
    logRetentionDays: z.number().int().min(0).max(3650).nullable().default(null),
    otherRecipients: text(2000),
});

export type LegalOperatorInput = z.infer<typeof legalOperatorSchema>;
export type LegalOperator = LegalOperatorInput & { updatedAt: string };

/** Without these the texts can't be built (§ 5 DDG: name, postal address, fast electronic contact). */
export const REQUIRED_OPERATOR_FIELDS = ['name', 'street', 'postalCode', 'city', 'email'] as const;

export function operatorComplete(op: LegalOperatorInput | null): boolean {
    return !!op && REQUIRED_OPERATOR_FIELDS.every((f) => op[f].trim() !== '');
}

export interface LegalSettings {
    operator: LegalOperator | null;
    /** Own Markdown; empty = generated from `operator`. */
    imprint: string;
    privacy: string;
}

export const SETTING_OPERATOR = 'legal_operator';
export const SETTING_IMPRINT = 'legal_imprint';
export const SETTING_PRIVACY = 'legal_privacy';

const MAX_TEXT = 100_000;
export const legalSettingsSchema = z.object({
    operator: legalOperatorSchema.nullable(),
    imprint: z.string().max(MAX_TEXT),
    privacy: z.string().max(MAX_TEXT),
});

export interface LegalStore {
    systemSetting: {
        findMany(args: { where: { key: { in: string[] } } }): Promise<{ key: string; value: string }[]>;
        upsert(args: { where: { key: string }; create: { key: string; value: string }; update: { value: string } }): Promise<unknown>;
        deleteMany(args: { where: { key: string } }): Promise<unknown>;
    };
}

/** A stored operator that no longer parses (hand-edited row) reads as none rather than failing the page. */
function parseOperator(raw: string | undefined): LegalOperator | null {
    if (!raw) return null;
    try {
        const json: unknown = JSON.parse(raw);
        const parsed = legalOperatorSchema.safeParse(json);
        if (!parsed.success) return null;
        const updatedAt = typeof (json as { updatedAt?: unknown }).updatedAt === 'string' ? (json as { updatedAt: string }).updatedAt : '';
        return { ...parsed.data, updatedAt };
    } catch {
        return null;
    }
}

export async function loadLegalSettings(db: LegalStore): Promise<LegalSettings> {
    const rows = await db.systemSetting.findMany({ where: { key: { in: [SETTING_OPERATOR, SETTING_IMPRINT, SETTING_PRIVACY] } } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    return {
        operator: parseOperator(byKey.get(SETTING_OPERATOR)),
        imprint: byKey.get(SETTING_IMPRINT) ?? '',
        privacy: byKey.get(SETTING_PRIVACY) ?? '',
    };
}

/** The stored form of an operator: stamped, so the Datenschutzerklärung can say „Stand: …". */
export function operatorRow(op: LegalOperatorInput, now: Date = new Date()): string {
    return JSON.stringify({ ...op, updatedAt: now.toISOString() });
}

/** Saves operator + own texts; an empty value removes its row. */
export async function saveLegalSettings(
    db: LegalStore,
    input: { operator: LegalOperatorInput | null; imprint: string; privacy: string },
    now: Date = new Date(),
): Promise<LegalSettings> {
    const values: [string, string][] = [
        [SETTING_OPERATOR, input.operator ? operatorRow(input.operator, now) : ''],
        [SETTING_IMPRINT, input.imprint.trim()],
        [SETTING_PRIVACY, input.privacy.trim()],
    ];
    for (const [key, value] of values) {
        if (value) await db.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
        else await db.systemSetting.deleteMany({ where: { key } });
    }
    return loadLegalSettings(db);
}

/** System check: each document either has an own text or can be generated; public bodies name their DPO. */
export function legalCheck(s: LegalSettings): { status: CheckStatus; detail: string } {
    const generated = operatorComplete(s.operator);
    const missing = [
        !s.imprint.trim() && !generated && 'Impressum',
        !s.privacy.trim() && !generated && 'Datenschutzerklärung',
    ].filter(Boolean);
    if (missing.length) {
        return {
            status: 'warn',
            detail: `${missing.join(' und ')} fehlt — Betreiberangaben unter Benutzerverwaltung → Rechtliche Angaben eintragen (Pflicht für öffentlich erreichbare Ausstellungen).`,
        };
    }
    if (!s.privacy.trim() && s.operator?.kind === 'public' && !s.operator.dpo) {
        return { status: 'warn', detail: 'Datenschutzbeauftragte(r) fehlt — für öffentliche Stellen Pflicht (Art. 37 DSGVO).' };
    }
    return { status: 'ok', detail: 'Impressum und Datenschutzerklärung hinterlegt.' };
}

export const behindCloudflare = (env: NodeJS.ProcessEnv = process.env): boolean => env.BEHIND_CLOUDFLARE === 'true';
