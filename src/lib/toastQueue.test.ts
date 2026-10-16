import { describe, expect, it } from 'vitest';
import { EMPTY_TOASTS, TOAST_LIMIT, addToast, closeToast, removeToast, toastDuration, type ToastEntry } from './toastQueue';

const entry = (id: string, over: Partial<ToastEntry> = {}): ToastEntry => ({
    id, kind: 'success', title: id, open: true, duration: 3000, ...over,
});

describe('addToast', () => {
    it('puts the newest toast first', () => {
        const s = addToast(addToast(EMPTY_TOASTS, entry('a')), entry('b'));
        expect(s.toasts.map((t) => t.id)).toEqual(['b', 'a']);
    });

    it('keeps at most TOAST_LIMIT open toasts and drops the oldest', () => {
        let s = EMPTY_TOASTS;
        for (let i = 0; i < TOAST_LIMIT + 2; i++) s = addToast(s, entry(String(i)));
        expect(s.toasts).toHaveLength(TOAST_LIMIT);
        expect(s.toasts[0].id).toBe(String(TOAST_LIMIT + 1));
    });

    it('does not count closing toasts against the limit', () => {
        let s = EMPTY_TOASTS;
        for (let i = 0; i < TOAST_LIMIT; i++) s = addToast(s, entry(String(i)));
        s = closeToast(s, '0');
        s = addToast(s, entry('new'));
        expect(s.toasts.filter((t) => t.open)).toHaveLength(TOAST_LIMIT);
        expect(s.toasts.map((t) => t.id)).toContain('0');
    });

    it('replaces an identical open toast instead of stacking it', () => {
        let s = addToast(EMPTY_TOASTS, entry('a', { title: 'Fehler', description: 'X' }));
        s = addToast(s, entry('b', { title: 'Fehler', description: 'X' }));
        expect(s.toasts.map((t) => t.id)).toEqual(['b']);
    });
});

describe('closeToast / removeToast', () => {
    it('marks a toast closed, then removes it', () => {
        let s = addToast(EMPTY_TOASTS, entry('a'));
        s = closeToast(s, 'a');
        expect(s.toasts[0].open).toBe(false);
        s = removeToast(s, 'a');
        expect(s.toasts).toEqual([]);
    });

    it('returns the same state for unknown ids', () => {
        const s = addToast(EMPTY_TOASTS, entry('a'));
        expect(closeToast(s, 'x')).toBe(s);
        expect(removeToast(s, 'x')).toBe(s);
    });
});

describe('toastDuration', () => {
    it('shows errors and actions longer than confirmations', () => {
        expect(toastDuration('success', false)).toBe(3000);
        expect(toastDuration('warning', false)).toBe(5000);
        expect(toastDuration('error', false)).toBe(6000);
        expect(toastDuration('success', true)).toBe(6000);
    });
});
