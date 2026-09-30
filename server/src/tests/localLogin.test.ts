import bcrypt from 'bcryptjs';
import { verifyLocalLogin, type LocalUser } from '../lib/localLogin';

let admin: LocalUser;
beforeAll(async () => {
    admin = { id: 1, email: 'notfall', role: 'admin', password_hash: await bcrypt.hash('sehr-geheim-123', 4) };
});

const finder = (users: LocalUser[]) => jest.fn(async (email: string) => users.find((u) => u.email === email) ?? null);

describe('verifyLocalLogin', () => {
    it('returns the user for the right password', async () => {
        await expect(verifyLocalLogin(finder([admin]), ' Notfall ', 'sehr-geheim-123')).resolves.toBe(admin);
    });
    it('rejects a wrong password', async () => {
        await expect(verifyLocalLogin(finder([admin]), 'notfall', 'falsch')).resolves.toBeNull();
    });
    it('rejects unknown users (still runs a bcrypt compare)', async () => {
        await expect(verifyLocalLogin(finder([]), 'niemand', 'sehr-geheim-123')).resolves.toBeNull();
    });
    it('never looks up names with @ (HSBI accounts)', async () => {
        const find = finder([admin]);
        await expect(verifyLocalLogin(find, 'm@hsbi.de', 'x')).resolves.toBeNull();
        expect(find).not.toHaveBeenCalled();
    });
    it('rejects accounts without a password hash', async () => {
        const hsbiLike = { ...admin, password_hash: null };
        await expect(verifyLocalLogin(finder([hsbiLike]), 'notfall', 'sehr-geheim-123')).resolves.toBeNull();
    });
});
