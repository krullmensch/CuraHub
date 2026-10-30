import { useState } from 'react';

/** What decides between the touch viewer (two sticks, tap for info) and the desktop viewer. */
export interface TouchEnv {
  coarse: boolean;
  fine: boolean;
  maxTouchPoints: number;
  ua: string;
}

/**
 * Touch mode: a coarse pointer and no fine one (phones, tablets). Touch laptops have a mouse too and
 * keep the desktop controls. iPadOS reports a Mac UA (and can report a fine pointer after a trackpad
 * was connected), so a Mac UA with touch points counts as touch.
 */
export function isTouchViewer(env: TouchEnv): boolean {
  if (/Macintosh/.test(env.ua) && env.maxTouchPoints > 1) return true;
  return env.coarse && !env.fine;
}

export function readTouchEnv(): TouchEnv {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { coarse: false, fine: true, maxTouchPoints: 0, ua: '' };
  }
  const media = (query: string) => window.matchMedia?.(query).matches ?? false;
  return {
    coarse: media('(any-pointer: coarse)'),
    fine: media('(any-pointer: fine)'),
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    ua: navigator.userAgent,
  };
}

/** Evaluated once per mount — a device doesn't change its pointers while the viewer is open. */
export function useTouchViewer(): boolean {
  const [touch] = useState(() => isTouchViewer(readTouchEnv()));
  return touch;
}
