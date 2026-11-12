import {
    legalCheck, legalOperatorSchema, legalSettingsSchema, loadLegalSettings, operatorComplete, saveLegalSettings,
    SETTING_IMPRINT, SETTING_OPERATOR, SETTING_PRIVACY, type LegalStore,
} from '../lib/legalTexts';

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

const operator = legalOperatorSchema.parse({
    name: 'Hochschule Bielefeld', street: 'Interaktion 1', postalCode: '33619', city: 'Bielefeld',
    email: 'info@hsbi.de', dpo: 'datenschutz@hsbi.de',
});
const NOW = new Date('2026-11-12T10:00:00Z');

describe('legalOperatorSchema', () => {
    it('fills every optional field', () => {
        const op = legalOperatorSchema.parse({});
        expect(op.kind).toBe('public');
        expect(op.phone).toBe('');
        expect(op.logRetentionDays).toBeNull();
    });
    it('trims and validates the e-mail address', () => {
        expect(legalOperatorSchema.parse({ email: ' a@b.de ' }).email).toBe('a@b.de');
        expect(legalOperatorSchema.safeParse({ email: 'kein-mail' }).success).toBe(false);
        expect(legalOperatorSchema.safeParse({ logRetentionDays: -1 }).success).toBe(false);
    });
    it('knows when the texts can be built', () => {
        expect(operatorComplete(operator)).toBe(true);
        expect(operatorComplete({ ...operator, city: ' ' })).toBe(false);
        expect(operatorComplete(null)).toBe(false);
    });
});

describe('legal settings', () => {
    it('reads nothing as empty', async () => {
        expect(await loadLegalSettings(memoryStore().db)).toEqual({ operator: null, imprint: '', privacy: '' });
    });

    it('stores the operator with a timestamp and removes emptied texts', async () => {
        const { db, rows } = memoryStore({ [SETTING_PRIVACY]: 'alt' });
        const saved = await saveLegalSettings(db, { operator, imprint: '  # Eigenes Impressum \n', privacy: '  ' }, NOW);
        expect(saved).toEqual({ operator: { ...operator, updatedAt: NOW.toISOString() }, imprint: '# Eigenes Impressum', privacy: '' });
        expect(rows.has(SETTING_PRIVACY)).toBe(false);
        expect(rows.get(SETTING_IMPRINT)).toBe('# Eigenes Impressum');

        await saveLegalSettings(db, { operator: null, imprint: '', privacy: '' }, NOW);
        expect(rows.size).toBe(0);
    });

    it('ignores a broken operator row', async () => {
        expect((await loadLegalSettings(memoryStore({ [SETTING_OPERATOR]: '{kaputt' }).db)).operator).toBeNull();
        expect((await loadLegalSettings(memoryStore({ [SETTING_OPERATOR]: '{"email":"x"}' }).db)).operator).toBeNull();
    });

    it('rejects huge texts', () => {
        expect(legalSettingsSchema.safeParse({ operator: null, imprint: 'x'.repeat(100_001), privacy: '' }).success).toBe(false);
        expect(legalSettingsSchema.safeParse({ operator: null, imprint: '', privacy: '' }).success).toBe(true);
    });
});

describe('legalCheck', () => {
    const stamped = { ...operator, updatedAt: NOW.toISOString() };

    it('warns without operator details or own texts', () => {
        const c = legalCheck({ operator: null, imprint: '', privacy: ' ' });
        expect(c.status).toBe('warn');
        expect(c.detail).toContain('Impressum und Datenschutzerklärung fehlt');
    });
    it('is ok with complete operator details', () => {
        expect(legalCheck({ operator: stamped, imprint: '', privacy: '' }).status).toBe('ok');
    });
    it('is ok with own texts only', () => {
        expect(legalCheck({ operator: null, imprint: '# I', privacy: '# D' }).status).toBe('ok');
    });
    it('names the missing document', () => {
        expect(legalCheck({ operator: null, imprint: '# I', privacy: '' }).detail).toMatch(/^Datenschutzerklärung fehlt/);
    });
    it('asks public bodies for their data protection officer', () => {
        const c = legalCheck({ operator: { ...stamped, dpo: '' }, imprint: '', privacy: '' });
        expect(c.status).toBe('warn');
        expect(c.detail).toContain('Art. 37');
        expect(legalCheck({ operator: { ...stamped, dpo: '', kind: 'private' }, imprint: '', privacy: '' }).status).toBe('ok');
    });
});
