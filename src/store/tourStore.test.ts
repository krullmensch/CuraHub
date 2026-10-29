import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tour/onboardingApi', () => ({ completeOnboarding: vi.fn(async () => {}) }));

import { completeOnboarding } from '@/lib/tour/onboardingApi';
import { useTourStore } from './tourStore';

const tour = () => useTourStore.getState();

describe('tourStore', () => {
  beforeEach(() => {
    tour().reset();
    vi.mocked(completeOnboarding).mockClear();
  });

  it('starts at step 0 with the steps for the role', () => {
    tour().start('curator');
    expect(tour().active).toBe(true);
    expect(tour().stepIndex).toBe(0);
    expect(tour().steps).toHaveLength(13);
  });

  it('gives admins all fifteen steps', () => {
    tour().start('admin');
    expect(tour().steps).toHaveLength(15);
  });

  it('does not go back before the first step', () => {
    tour().start('curator');
    tour().back();
    expect(tour().stepIndex).toBe(0);
  });

  it('moves forward step by step', () => {
    tour().start('curator');
    tour().next();
    tour().next();
    tour().next();
    expect(tour().stepIndex).toBe(3);
  });

  it('keeps the current step when started again while active', () => {
    tour().start('curator');
    tour().next();
    tour().start('curator');
    expect(tour().stepIndex).toBe(1);
  });

  it('finishes on next from the last step', () => {
    tour().start('curator');
    for (let i = 0; i < 12; i++) tour().next();
    tour().next();
    expect(tour().active).toBe(false);
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('skip closes the tour and stores completion', () => {
    tour().start('curator');
    tour().next();
    tour().skip();
    expect(tour().active).toBe(false);
    expect(tour().stepIndex).toBe(0);
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('reset closes the tour without storing completion', () => {
    tour().start('curator');
    tour().reset();
    expect(tour().active).toBe(false);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });
});
