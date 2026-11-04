import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { hashPassword } from './setupStore';
import { LOCAL_USERNAME_RE, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './setupValidation';
import type { AppRole } from './middleware';

/**
 * Local accounts (User.email = a username without "@", password as bcrypt hash) that admins
 * create in the user management, next to the HSBI accounts. New accounts and resets get a
 * generated start password that the account must replace at its next login.
 */

// No 0/o, 1/l/i: start passwords are read off a screen and typed in by hand.
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** 16 random characters in groups of four (≈ 79 bits), e.g. "k7mq-x2ha-p9tr-c4we". */
export function generateStartPassword(): string {
    const groups: string[] = [];
    for (let g = 0; g < 4; g++) {
        let group = '';
        for (let i = 0; i < 4; i++) group += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
        groups.push(group);
    }
    return groups.join('-');
}

export const isLocalAccount = (email: string): boolean => !email.includes('@');

export interface AccountRow {
    id: number;
    email: string;
    role: string;
    password_hash: string | null;
}

export interface LocalAccountStore {
    findByEmail(email: string): Promise<AccountRow | null>;
    findById(id: number): Promise<AccountRow | null>;
    create(data: { email: string; role: AppRole; passwordHash: string }): Promise<AccountRow>;
    setPassword(id: number, passwordHash: string, mustChange: boolean): Promise<void>;
}

export type AccountResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

export async function createLocalAccount(
    store: LocalAccountStore,
    input: { username: string; role: AppRole },
): Promise<AccountResult<{ user: AccountRow; password: string }>> {
    const username = input.username.trim().toLowerCase();
    if (!LOCAL_USERNAME_RE.test(username)) {
        return fail(400, 'Benutzername: 3–32 Zeichen, nur a–z, 0–9, Punkt, Unterstrich und Bindestrich.');
    }
    if (await store.findByEmail(username)) return fail(409, 'Diesen Benutzernamen gibt es schon.');
    const password = generateStartPassword();
    const user = await store.create({ email: username, role: input.role, passwordHash: await hashPassword(password) });
    return { ok: true, value: { user, password } };
}

export async function resetLocalPassword(store: LocalAccountStore, id: number): Promise<AccountResult<{ password: string }>> {
    const user = await store.findById(id);
    if (!user) return fail(404, 'Benutzer nicht gefunden');
    if (!isLocalAccount(user.email)) return fail(400, 'HSBI-Konten haben kein Passwort in CuraHub.');
    const password = generateStartPassword();
    await store.setPassword(id, await hashPassword(password), true);
    return { ok: true, value: { password } };
}

export async function changeOwnPassword(
    store: LocalAccountStore,
    id: number,
    current: string,
    next: string,
): Promise<AccountResult<null>> {
    const user = await store.findById(id);
    if (!user) return fail(401, 'Benutzer nicht gefunden');
    if (!isLocalAccount(user.email) || !user.password_hash) {
        return fail(400, 'HSBI-Konten ändern ihr Passwort bei der HSBI.');
    }
    if (!(await bcrypt.compare(current, user.password_hash))) return fail(403, 'Das aktuelle Passwort stimmt nicht.');
    if (next.length < MIN_PASSWORD_LENGTH || next.length > MAX_PASSWORD_LENGTH) {
        return fail(400, `Das neue Passwort muss ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} Zeichen lang sein.`);
    }
    if (next === current) return fail(400, 'Das neue Passwort muss sich vom aktuellen unterscheiden.');
    await store.setPassword(id, await hashPassword(next), false);
    return { ok: true, value: null };
}

export function prismaLocalAccountStore(prisma: PrismaClient): LocalAccountStore {
    const select = { id: true, email: true, role: true, password_hash: true } as const;
    return {
        findByEmail: (email) => prisma.user.findUnique({ where: { email }, select }),
        findById: (id) => prisma.user.findUnique({ where: { id }, select }),
        create: ({ email, role, passwordHash }) => prisma.user.create({
            data: { email, role, password_hash: passwordHash, must_change_password: true },
            select,
        }),
        setPassword: async (id, passwordHash, mustChange) => {
            await prisma.user.update({ where: { id }, data: { password_hash: passwordHash, must_change_password: mustChange } });
        },
    };
}
