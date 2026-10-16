/**
 * Toast queue — pure state transitions behind `toast()` (hooks/use-toast.ts).
 * A closed toast stays in the list until its exit animation is over
 * (`removeToast`), but no longer counts against the limit.
 */

export type ToastKind = 'success' | 'error' | 'warning';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

export interface ToastEntry {
    id: string;
    kind: ToastKind;
    title: string;
    description?: string;
    action?: ToastAction;
    duration: number;
    open: boolean;
}

export interface ToastState {
    /** Newest first. */
    toasts: ToastEntry[];
}

export const TOAST_LIMIT = 3;
export const EMPTY_TOASTS: ToastState = { toasts: [] };

const DURATIONS: Record<ToastKind, number> = { success: 3000, warning: 5000, error: 6000 };
const ACTION_DURATION = 6000;

/** How long a toast stays: errors and toasts with an action longer, so they can be read and used. */
export function toastDuration(kind: ToastKind, hasAction: boolean): number {
    return hasAction ? Math.max(ACTION_DURATION, DURATIONS[kind]) : DURATIONS[kind];
}

const sameMessage = (a: ToastEntry, b: ToastEntry) =>
    a.kind === b.kind && a.title === b.title && a.description === b.description && !a.action && !b.action;

export function addToast(state: ToastState, toast: ToastEntry): ToastState {
    // A repeated message (e.g. the same save error twice) replaces the open one instead of stacking.
    const rest = state.toasts.filter((t) => !(t.open && sameMessage(t, toast)));
    let open = 1;
    const toasts = [toast, ...rest].filter((t, i) => {
        if (i === 0 || !t.open) return true;
        open += 1;
        return open <= TOAST_LIMIT;
    });
    return { toasts };
}

export function closeToast(state: ToastState, id: string): ToastState {
    if (!state.toasts.some((t) => t.id === id && t.open)) return state;
    return { toasts: state.toasts.map((t) => (t.id === id ? { ...t, open: false } : t)) };
}

export function removeToast(state: ToastState, id: string): ToastState {
    if (!state.toasts.some((t) => t.id === id)) return state;
    return { toasts: state.toasts.filter((t) => t.id !== id) };
}
