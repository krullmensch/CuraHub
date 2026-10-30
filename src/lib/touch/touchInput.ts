import type { StickValue } from './stick';

/**
 * Current stick values of the touch viewer. Written by the DOM sticks, read every frame by the
 * player and the look component — a plain module object, so no React render per finger move.
 */
export const touchInput = {
  move: { x: 0, y: 0 } as StickValue,
  look: { x: 0, y: 0 } as StickValue,
  setMove(v: StickValue): void {
    touchInput.move = v;
  },
  setLook(v: StickValue): void {
    touchInput.look = v;
  },
  reset(): void {
    touchInput.move = { x: 0, y: 0 };
    touchInput.look = { x: 0, y: 0 };
  },
};

/** Book, dialog or tour opened: stop at once, so nothing keeps walking behind it. */
export function syncLock(locked: boolean): void {
  if (locked) touchInput.reset();
}

/** Tab hidden, screen locked or window blurred: release both sticks (their pointer-up never arrives). */
export function installTouchInputGuards(): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') touchInput.reset();
  };
  const onBlur = () => touchInput.reset();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
  };
}
