import { useAuthStore } from '@/store/authStore';

/**
 * Tells the server the dashboard tour was finished or skipped. Marks it locally at once (so the
 * auto start doesn't fire again while the request runs) and takes the server's timestamp when it
 * answers. Never throws: a failed request leaves the local mark, the tour comes back next session.
 */
export async function completeOnboarding(): Promise<void> {
  const { token, markOnboardingCompleted } = useAuthStore.getState();
  markOnboardingCompleted(new Date().toISOString());
  if (!token) return;
  try {
    const res = await fetch('/auth/me/onboarding', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const body: { onboardingCompletedAt: string } = await res.json();
    markOnboardingCompleted(body.onboardingCompletedAt);
  } catch {
    // offline etc. — the local mark stays
  }
}
