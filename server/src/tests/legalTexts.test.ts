import { legalCheck, legalTextsSchema, loadLegalTexts, saveLegalTexts, SETTING_IMPRINT, SETTING_PRIVACY, type LegalStore } from '../lib/legalTexts';

function memoryStore(initial: Record<string, string> = {}) {
    const rows = new Map(Object.entries(initial));
    const db: LegalStore = {
        systemSetting: {
            findMany: async ({ where }) => where.key.in.filter((k) => rows.has(k)).map((key) => ({ key, value: rows.get(key)! })),
            upsert: async ({ where, create, update }) => { rows.set(where.key, rows.has(where.key) ? update.value : create.value); },
            deleteMany: async ({ where }) => { rows.delete(where.key); },
        },
    };
    return { db, rows };
}

describe('legal texts', () => {
    it('reads missing texts as empty', async () => {
        expect(await loadLegalTexts(memoryStore().db)).toEqual({ imprint: '', privacy: '' });
    });

    it('saves trimmed texts and removes emptied ones', async () => {
        const { db, rows } = memoryStore({ [SETTING_PRIVACY]: 'alt' });
        expect(await saveLegalTexts(db, { imprint: '  # Impressum \n', privacy: '   ' })).toEqual({ imprint: '# Impressum', privacy: '' });
        expect(rows.get(SETTING_IMPRINT)).toBe('# Impressum');
        expect(rows.has(SETTING_PRIVACY)).toBe(false);
        expect(await loadLegalTexts(db)).toEqual({ imprint: '# Impressum', privacy: '' });
    });

    it('rejects non-strings and huge texts', () => {
        expect(legalTextsSchema.safeParse({ imprint: 1, privacy: '' }).success).toBe(false);
        expect(legalTextsSchema.safeParse({ imprint: 'x'.repeat(100_001), privacy: '' }).success).toBe(false);
        expect(legalTextsSchema.safeParse({ imprint: 'a', privacy: 'b' }).success).toBe(true);
    });
});

describe('legalCheck', () => {
    it('warns about missing texts', () => {
        const c = legalCheck({ imprint: '', privacy: ' ' });
        expect(c.status).toBe('warn');
        expect(c.detail).toContain('Impressum und Datenschutzerklärung fehlt');
    });
    it('warns while template placeholders remain', () => {
        const c = legalCheck({ imprint: 'HSBI', privacy: 'Verantwortlich: [[Name des Betreibers]]' });
        expect(c.status).toBe('warn');
        expect(c.detail).toContain('Datenschutzerklärung enthält noch Platzhalter');
    });
    it('is ok when both are filled in', () => {
        expect(legalCheck({ imprint: 'HSBI', privacy: 'Link: [Text](https://x.de) [1]' }).status).toBe('ok');
    });
});
