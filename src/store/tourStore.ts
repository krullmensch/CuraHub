import { create } from 'zustand';
import type { AppRole } from './authStore';
import { stepsForRole, type TourStep } from '@/lib/tour/steps';
import { completeOnboarding } from '@/lib/tour/onboardingApi';

interface TourState {
  active: boolean;
  stepIndex: number;
  /** Filtered for the role when the tour starts. */
  steps: TourStep[];
  /** No-op while a tour is running. */
  start: (role: AppRole) => void;
  /** On the last step = finish(). */
  next: () => void;
  back: () => void;
  /** „Fertig": closes and stores the completion. */
  finish: () => void;
  /** „Überspringen" / Esc: closes and stores the completion. */
  skip: () => void;
  /** Closes without storing anything (the overlay unmounted, e.g. on logout). */
  reset: () => void;
}

const CLOSED = { active: false, stepIndex: 0, steps: [] as TourStep[] };

export const useTourStore = create<TourState>()((set, get) => ({
  ...CLOSED,
  start: (role) => {
    if (get().active) return;
    set({ active: true, stepIndex: 0, steps: stepsForRole(role) });
  },
  next: () => {
    const { stepIndex, steps } = get();
    if (stepIndex >= steps.length - 1) get().finish();
    else set({ stepIndex: stepIndex + 1 });
  },
  back: () => set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1) })),
  finish: () => {
    set(CLOSED);
    void completeOnboarding();
  },
  skip: () => {
    set(CLOSED);
    void completeOnboarding();
  },
  reset: () => set(CLOSED),
}));
