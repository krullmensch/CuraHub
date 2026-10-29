import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { useAuthStore } from '@/store/authStore';
import { completeOnboarding } from './onboardingApi';

const completedAt = () => useAuthStore.getState().user?.onboardingCompletedAt;

describe('completeOnboarding', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    useAuthStore.getState().login('t1', { id: 1, email: 'a', role: 'curator', onboardingCompletedAt: null });
  });

  it('marks the tour as completed before the request answers', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    void completeOnboarding();
    expect(completedAt()).toEqual(expect.any(String));
  });

  it('takes the timestamp the server stored', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ onboardingCompletedAt: '2026-10-01T00:00:00.000Z' }), { status: 200 })));
    await completeOnboarding();
    expect(completedAt()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('keeps the local mark when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(completeOnboarding()).resolves.toBeUndefined();
    expect(completedAt()).toEqual(expect.any(String));
  });
});
