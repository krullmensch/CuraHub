import bcrypt from 'bcryptjs';
import {
    changeOwnPassword, createLocalAccount, generateStartPassword, isLocalAccount, resetLocalPassword,
    type AccountRow, type LocalAccountStore,
} from '../lib/localAccounts';

jest.mock('../lib/setupStore', () => ({ hashPassword: (pw: string) => bcrypt.hash(pw, 4) }));

interface Row extends AccountRow { must_change_password: boolean }

function memoryStore(rows: Row[]): LocalAccountStore & { rows: Row[] } {
    let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
    return {
        rows,
        findByEmail: async (email) => rows.find((r) => r.email === email) ?? null,
        findById: async (id) => rows.find((r) => r.id === id) ?? null,
        create: async ({ email, role, passwordHash }) => {
            const row = { id: nextId++, email, role, password_hash: passwordHash, must_change_password: true };
            rows.push(row);
            return row;
        },
        setPassword: async (id, passwordHash, mustChange) => {
            const row = rows.find((r) => r.id === id)!;
            row.password_hash = passwordHash;
            row.must_change_password = mustChange;
        },
    };
}

const hsbi = (): Row => ({ id: 1, email: 'amuster@hsbi.de', role: 'curator', password_hash: null, must_change_password: false });

describe('generateStartPassword', () => {
    it('is 4 groups of 4 unambiguous characters', () => {
        for (let i = 0; i < 50; i++) expect(generateStartPassword()).toMatch(/^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){3}$/);
    });
    it('differs between calls', () => {
        expect(new Set(Array.from({ length: 20 }, generateStartPassword)).size).toBe(20);
    });
});

describe('isLocalAccount', () => {
    it('tells usernames from HSBI addresses', () => {
        expect(isLocalAccount('gast.lehmann')).toBe(true);
        expect(isLocalAccount('amuster@hsbi.de')).toBe(false);
    });
});

describe('createLocalAccount', () => {
    it('creates a lower-cased account with a working start password that must be changed', async () => {
        const store = memoryStore([]);
        const result = await createLocalAccount(store, { username: ' Gast.Lehmann ', role: 'curator' });
        if (!result.ok) throw new Error(result.error);
        expect(result.value.user).toMatchObject({ email: 'gast.lehmann', role: 'curator' });
        expect(store.rows[0].must_change_password).toBe(true);
        await expect(bcrypt.compare(result.value.password, store.rows[0].password_hash!)).resolves.toBe(true);
    });
    it('rejects names that are no valid local usernames (incl. HSBI addresses)', async () => {
        for (const username of ['ab', 'a@hsbi.de', 'mit leerzeichen', 'x'.repeat(33)]) {
            await expect(createLocalAccount(memoryStore([]), { username, role: 'curator' })).resolves.toMatchObject({ ok: false, status: 400 });
        }
    });
    it('rejects a name that exists', async () => {
        const store = memoryStore([{ id: 3, email: 'gast', role: 'user', password_hash: 'x', must_change_password: false }]);
        await expect(createLocalAccount(store, { username: 'gast', role: 'curator' })).resolves.toMatchObject({ ok: false, status: 409 });
    });
});

describe('resetLocalPassword', () => {
    it('sets a new start password and requires a change', async () => {
        const store = memoryStore([{ id: 3, email: 'gast', role: 'curator', password_hash: 'alt', must_change_password: false }]);
        const result = await resetLocalPassword(store, 3);
        if (!result.ok) throw new Error(result.error);
        expect(store.rows[0].must_change_password).toBe(true);
        await expect(bcrypt.compare(result.value.password, store.rows[0].password_hash!)).resolves.toBe(true);
    });
    it('refuses HSBI accounts and unknown ids', async () => {
        await expect(resetLocalPassword(memoryStore([hsbi()]), 1)).resolves.toMatchObject({ ok: false, status: 400 });
        await expect(resetLocalPassword(memoryStore([]), 9)).resolves.toMatchObject({ ok: false, status: 404 });
    });
});

describe('changeOwnPassword', () => {
    const local = async (): Promise<Row> => ({
        id: 3, email: 'gast', role: 'curator', password_hash: await bcrypt.hash('k7mq-x2ha-p9tr-c4we', 4), must_change_password: true,
    });

    it('stores the new password and clears the change flag', async () => {
        const store = memoryStore([await local()]);
        await expect(changeOwnPassword(store, 3, 'k7mq-x2ha-p9tr-c4we', 'ein-neues-passwort')).resolves.toEqual({ ok: true, value: null });
        expect(store.rows[0].must_change_password).toBe(false);
        await expect(bcrypt.compare('ein-neues-passwort', store.rows[0].password_hash!)).resolves.toBe(true);
    });
    it('needs the current password', async () => {
        const store = memoryStore([await local()]);
        await expect(changeOwnPassword(store, 3, 'falsch', 'ein-neues-passwort')).resolves.toMatchObject({ ok: false, status: 403 });
        expect(store.rows[0].must_change_password).toBe(true);
    });
    it('enforces the length and a different password', async () => {
        const store = memoryStore([await local()]);
        await expect(changeOwnPassword(store, 3, 'k7mq-x2ha-p9tr-c4we', 'kurz')).resolves.toMatchObject({ ok: false, status: 400 });
        await expect(changeOwnPassword(store, 3, 'k7mq-x2ha-p9tr-c4we', 'k7mq-x2ha-p9tr-c4we')).resolves.toMatchObject({ ok: false, status: 400 });
    });
    it('refuses HSBI accounts', async () => {
        await expect(changeOwnPassword(memoryStore([hsbi()]), 1, 'x', 'ein-neues-passwort')).resolves.toMatchObject({ ok: false, status: 400 });
    });
});
