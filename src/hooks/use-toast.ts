import { useSyncExternalStore } from 'react';

import {
  EMPTY_TOASTS,
  addToast,
  closeToast,
  removeToast,
  toastDuration,
  type ToastAction,
  type ToastKind,
  type ToastState,
} from '@/lib/toastQueue';

/** Matches the exit animation in components/ui/toast.tsx. */
const EXIT_MS = 200;

export interface ToastOptions {
  description?: string;
  action?: ToastAction;
  /** ms; default depends on the kind (lib/toastQueue `toastDuration`). */
  duration?: number;
}

let state: ToastState = EMPTY_TOASTS;
const listeners = new Set<() => void>();
let count = 0;

function setState(next: ToastState) {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function dismissToast(id: string) {
  setState(closeToast(state, id));
  setTimeout(() => setState(removeToast(state, id)), EXIT_MS);
}

function show(kind: ToastKind, title: string, options: ToastOptions = {}): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  const id = `toast-${count}`;
  setState(addToast(state, {
    id,
    kind,
    title,
    description: options.description,
    action: options.action,
    duration: options.duration ?? toastDuration(kind, !!options.action),
    open: true,
  }));
  return id;
}

/** App-wide notifications: `toast.success('Gespeichert', { description })`. */
export const toast = {
  success: (title: string, options?: ToastOptions) => show('success', title, options),
  error: (title: string, options?: ToastOptions) => show('error', title, options),
  warning: (title: string, options?: ToastOptions) => show('warning', title, options),
  dismiss: dismissToast,
};

export function useToasts(): ToastState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// ── Vertical position ─────────────────────────────────────────────────────
// Toasts sit top-centre below the page header (≤ 72 px on every page). Chrome that occupies that
// spot (the wall editor's top bar) pushes them down while it is mounted.

export const DEFAULT_TOAST_TOP = 84;

let topInset: number | null = null;
const insetListeners = new Set<() => void>();

export function setToastTopInset(px: number | null) {
  if (px === topInset) return;
  topInset = px;
  insetListeners.forEach((l) => l());
}

function subscribeInset(listener: () => void) {
  insetListeners.add(listener);
  return () => { insetListeners.delete(listener); };
}

export function useToastTop(): number {
  return useSyncExternalStore(subscribeInset, () => topInset ?? DEFAULT_TOAST_TOP, () => DEFAULT_TOAST_TOP);
}
