import { beforeEach, describe, expect, it, vi } from 'vitest';

// The persist middleware writes to localStorage, which the node test environment lacks.
vi.hoisted(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  });
});

import { useAuthStore } from './authStore';

const answer = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('authStore onboarding state', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    useAuthStore.getState().login('t1', { id: 1, email: 'a', role: 'curator' });
  });

  it('is not loaded right after login', () => {
    expect(useAuthStore.getState().meLoaded).toBe(false);
  });

  it('is loaded once /auth/me answered', async () => {
    vi.stubGlobal('fetch', answer(200, { token: 't2', user: { id: 1, email: 'a', role: 'curator', onboardingCompletedAt: null } }));
    await useAuthStore.getState().refreshAuth();
    expect(useAuthStore.getState().meLoaded).toBe(true);
    expect(useAuthStore.getState().user?.onboardingCompletedAt).toBeNull();
  });

  it('forgets the loaded state when /auth/me logs the user out', async () => {
    vi.stubGlobal('fetch', answer(200, { token: 't2', user: { id: 1, email: 'a', role: 'curator', onboardingCompletedAt: null } }));
    await useAuthStore.getState().refreshAuth();
    vi.stubGlobal('fetch', answer(401, { error: 'Invalid token' }));
    await useAuthStore.getState().refreshAuth();
    expect(useAuthStore.getState().meLoaded).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('keeps the local completion when /auth/me still says null in the same session', async () => {
    useAuthStore.getState().markOnboardingCompleted('2026-10-29T10:00:00.000Z');
    vi.stubGlobal('fetch', answer(200, { token: 't2', user: { id: 1, email: 'a', role: 'curator', onboardingCompletedAt: null } }));
    await useAuthStore.getState().refreshAuth();
    expect(useAuthStore.getState().user?.onboardingCompletedAt).toBe('2026-10-29T10:00:00.000Z');
  });

  it('takes the server value again after a logout', async () => {
    useAuthStore.getState().markOnboardingCompleted('2026-10-29T10:00:00.000Z');
    useAuthStore.getState().logout();
    useAuthStore.getState().login('t1', { id: 1, email: 'a', role: 'curator', onboardingCompletedAt: null });
    vi.stubGlobal('fetch', answer(200, { token: 't2', user: { id: 1, email: 'a', role: 'curator', onboardingCompletedAt: null } }));
    await useAuthStore.getState().refreshAuth();
    expect(useAuthStore.getState().user?.onboardingCompletedAt).toBeNull();
  });

  it('marks the onboarding as completed locally', () => {
    useAuthStore.getState().markOnboardingCompleted('2026-10-29T10:00:00.000Z');
    expect(useAuthStore.getState().user?.onboardingCompletedAt).toBe('2026-10-29T10:00:00.000Z');
  });
});
