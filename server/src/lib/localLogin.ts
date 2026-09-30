import bcrypt from 'bcryptjs';

/**
 * Emergency login for local accounts (User.email = a username without "@", set in the setup
 * wizard or by scripts/reset-local-admin). HSBI accounts always have "@hsbi.de" and never
 * log in here.
 */
export interface LocalUser {
    id: number;
    email: string;
    role: string;
    password_hash: string | null;
}

// Compared against for unknown users so the response time does not reveal which names exist.
let dummyHash: string | null = null;
function getDummyHash(): string {
    dummyHash ??= bcrypt.hashSync('curahub-dummy-password', 12);
    return dummyHash;
}

export async function verifyLocalLogin(
    findUser: (email: string) => Promise<LocalUser | null>,
    username: string,
    password: string,
): Promise<LocalUser | null> {
    const name = username.trim().toLowerCase();
    if (!name || name.includes('@')) return null;
    const user = await findUser(name);
    const matches = await bcrypt.compare(password, user?.password_hash ?? getDummyHash());
    return matches && user?.password_hash ? user : null;
}
