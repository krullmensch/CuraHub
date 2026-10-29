import { useAuthStore } from '@/store/authStore';

/**
 * Tells the server the dashboard tour was finished or skipped. Never throws: when the request
 * fails the tour is still marked as done for this session and comes back once next session.
 */
export async function completeOnboarding(): Promise<void> {
  const { token, markOnboardingCompleted } = useAuthStore.getState();
  try {
    if (!token) throw new Error('no token');
    const res = await fetch('/auth/me/onboarding', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: { onboardingCompletedAt: string } = await res.json();
    markOnboardingCompleted(body.onboardingCompletedAt);
  } catch {
    markOnboardingCompleted(new Date().toISOString());
  }
}
