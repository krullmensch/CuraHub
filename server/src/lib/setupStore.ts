import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { SETTING_COMPLETED, SETTING_PUBLIC_URL } from './setupState';

export interface CompleteSetupInput {
    publicUrl: string;
    localAdmin: { username: string; passwordHash: string };
    hsbiEmail: string | null;
}

export const PASSWORD_COST = 12;

export function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, PASSWORD_COST);
}

/** Everything the wizard writes, in one transaction — an aborted setup leaves nothing behind. */
export async function completeSetupInDb(prisma: PrismaClient, input: CompleteSetupInput): Promise<void> {
    const setting = (key: string, value: string) =>
        prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    const { username, passwordHash } = input.localAdmin;

    await prisma.$transaction([
        prisma.user.upsert({
            where: { email: username },
            create: { email: username, password_hash: passwordHash, role: 'admin' },
            update: { password_hash: passwordHash, role: 'admin' },
        }),
        ...(input.hsbiEmail
            ? [prisma.user.upsert({
                where: { email: input.hsbiEmail },
                create: { email: input.hsbiEmail, role: 'admin' },
                update: { role: 'admin' },
            })]
            : []),
        setting(SETTING_PUBLIC_URL, input.publicUrl),
        setting(SETTING_COMPLETED, new Date().toISOString()),
    ]);
}
