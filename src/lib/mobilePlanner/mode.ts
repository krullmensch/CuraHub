import { useCallback, useState } from 'react';
import { isTouchViewer, readTouchEnv, type TouchEnv } from '@/lib/touch/touchMode';

/** 'full' = always the full editor, 'mobile' = always the mobile view, null = automatic. */
export type PlannerOverride = 'full' | 'mobile' | null;
export const MOBILE_PLANNER_KEY = 'curahub-mobile-planner';
/** Phones: short screen side below this (px); tablets keep the full editor. */
export const MOBILE_SHORT_SIDE = 600;

export function isMobilePlanner(env: TouchEnv & { width: number; height: number }, override: PlannerOverride): boolean {
  if (override === 'full') return false;
  if (override === 'mobile') return true;
  return isTouchViewer(env) && Math.min(env.width, env.height) < MOBILE_SHORT_SIDE;
}

export function readPlannerOverride(): PlannerOverride {
  try {
    const value = localStorage.getItem(MOBILE_PLANNER_KEY);
    return value === 'full' || value === 'mobile' ? value : null;
  } catch {
    return null;
  }
}

export function writePlannerOverride(value: PlannerOverride): void {
  try {
    if (value) localStorage.setItem(MOBILE_PLANNER_KEY, value);
    else localStorage.removeItem(MOBILE_PLANNER_KEY);
  } catch {
    // private mode etc. — the choice then lasts for this page only
  }
}

function currentEnv(): TouchEnv & { width: number; height: number } {
  return {
    ...readTouchEnv(),
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
  };
}

/** Decided once per page load (rotation doesn't switch), or by the user's override. */
export function useMobilePlanner(): { mobile: boolean; setOverride: (value: PlannerOverride) => void } {
  const [mobile, setMobile] = useState(() => isMobilePlanner(currentEnv(), readPlannerOverride()));
  const setOverride = useCallback((value: PlannerOverride) => {
    writePlannerOverride(value);
    setMobile(isMobilePlanner(currentEnv(), value));
  }, []);
  return { mobile, setOverride };
}
