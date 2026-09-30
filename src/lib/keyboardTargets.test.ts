import { describe, expect, it } from 'vitest';
import { isFormControlTarget } from './keyboardTargets';

const el = (tagName: string, role?: string) => ({ tagName, getAttribute: (n: string) => (n === 'role' ? role ?? null : null) });

describe('isFormControlTarget', () => {
    it('accepts form controls and buttons', () => {
        for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'button']) expect(isFormControlTarget(el(tag))).toBe(true);
    });
    it('accepts custom controls by role', () => {
        for (const role of ['checkbox', 'switch', 'slider']) expect(isFormControlTarget(el('DIV', role))).toBe(true);
    });
    it('rejects plain elements and non-elements', () => {
        expect(isFormControlTarget(el('DIV'))).toBe(false);
        expect(isFormControlTarget(el('CANVAS', 'img'))).toBe(false);
        expect(isFormControlTarget(null)).toBe(false);
        expect(isFormControlTarget(undefined)).toBe(false);
        expect(isFormControlTarget({})).toBe(false);
    });
});
