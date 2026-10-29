import type { PrismaClient, User } from '@prisma/client';

/** The user object every auth response sends (login, local login, /auth/me). */
export function publicUser(user: Pick<User, 'id' | 'email' | 'role' | 'onboarding_completed_at'>) {
    return {
        id: user.id,
        email: user.email,
        role: user.role,
        onboardingCompletedAt: user.onboarding_completed_at ? user.onboarding_completed_at.toISOString() : null,
    };
}

export interface OnboardingStore {
    setIfNull(userId: number, at: Date): Promise<void>;
    read(userId: number): Promise<{ onboarding_completed_at: Date | null } | null>;
}

/**
 * Marks the dashboard tour as finished or skipped. Only the first call stores a timestamp;
 * later calls return the stored one. Null = the user does not exist.
 */
export async function completeOnboarding(store: OnboardingStore, userId: number, now: Date): Promise<Date | null> {
    await store.setIfNull(userId, now);
    const row = await store.read(userId);
    return row?.onboarding_completed_at ?? null;
}

export function prismaOnboardingStore(prisma: PrismaClient): OnboardingStore {
    return {
        setIfNull: async (userId, at) => {
            await prisma.user.updateMany({
                where: { id: userId, onboarding_completed_at: null },
                data: { onboarding_completed_at: at },
            });
        },
        read: (userId) => prisma.user.findUnique({
            where: { id: userId },
            select: { onboarding_completed_at: true },
        }),
    };
}
