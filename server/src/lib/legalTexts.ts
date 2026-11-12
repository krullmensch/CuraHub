import { z } from 'zod';
import type { CheckStatus } from './systemChecks';

/**
 * Impressum (§ 5 DDG) and Datenschutzerklärung (Art. 13 DSGVO) of this installation. Only the
 * operator can write them, so they are Markdown in SystemSetting, edited by admins on /users and
 * shown on /impressum and /datenschutz (linked from every public page).
 */
export interface LegalTexts {
    imprint: string;
    privacy: string;
}

export const SETTING_IMPRINT = 'legal_imprint';
export const SETTING_PRIVACY = 'legal_privacy';

/** `[[…]]` marks what the template leaves for the operator to fill in. */
export const PLACEHOLDER_RE = /\[\[[^\]\n]+\]\]/;

const MAX_LENGTH = 100_000;
export const legalTextsSchema = z.object({
    imprint: z.string().max(MAX_LENGTH),
    privacy: z.string().max(MAX_LENGTH),
});

export interface LegalStore {
    systemSetting: {
        findMany(args: { where: { key: { in: string[] } } }): Promise<{ key: string; value: string }[]>;
        upsert(args: { where: { key: string }; create: { key: string; value: string }; update: { value: string } }): Promise<unknown>;
        deleteMany(args: { where: { key: string } }): Promise<unknown>;
    };
}

export async function loadLegalTexts(db: LegalStore): Promise<LegalTexts> {
    const rows = await db.systemSetting.findMany({ where: { key: { in: [SETTING_IMPRINT, SETTING_PRIVACY] } } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    return { imprint: byKey.get(SETTING_IMPRINT) ?? '', privacy: byKey.get(SETTING_PRIVACY) ?? '' };
}

/** Saves both texts (trimmed); an empty text removes its row. */
export async function saveLegalTexts(db: LegalStore, texts: LegalTexts): Promise<LegalTexts> {
    const next = { imprint: texts.imprint.trim(), privacy: texts.privacy.trim() };
    for (const [key, value] of [[SETTING_IMPRINT, next.imprint], [SETTING_PRIVACY, next.privacy]] as const) {
        if (value) await db.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
        else await db.systemSetting.deleteMany({ where: { key } });
    }
    return next;
}

/** System check: both texts present and no template placeholder left. */
export function legalCheck(texts: LegalTexts): { status: CheckStatus; detail: string } {
    const missing = [!texts.imprint.trim() && 'Impressum', !texts.privacy.trim() && 'Datenschutzerklärung'].filter(Boolean);
    if (missing.length) {
        return { status: 'warn', detail: `${missing.join(' und ')} fehlt — Pflicht für öffentlich erreichbare Ausstellungen (Benutzerverwaltung → Rechtliche Angaben).` };
    }
    const unfilled = [PLACEHOLDER_RE.test(texts.imprint) && 'Impressum', PLACEHOLDER_RE.test(texts.privacy) && 'Datenschutzerklärung'].filter(Boolean);
    if (unfilled.length) {
        return { status: 'warn', detail: `${unfilled.join(' und ')} enthält noch Platzhalter [[…]] aus der Vorlage.` };
    }
    return { status: 'ok', detail: 'Impressum und Datenschutzerklärung hinterlegt.' };
}
