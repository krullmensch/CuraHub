/** The bits of a DOM element the check needs (structural, so tests need no DOM). */
export interface KeyTargetLike {
    tagName?: string;
    getAttribute?: (name: string) => string | null;
}

const CONTROL_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);
const CONTROL_ROLES = new Set(['checkbox', 'switch', 'slider', 'button']);

/**
 * True when a key press comes from a focused form control or button. Delete/Backspace there
 * belongs to the control (or is a leftover focus after a click), never to the selected artwork.
 */
export function isFormControlTarget(target: unknown): boolean {
    if (!target || typeof target !== 'object') return false;
    const el = target as KeyTargetLike;
    if (typeof el.tagName === 'string' && CONTROL_TAGS.has(el.tagName.toUpperCase())) return true;
    const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
    return role !== null && CONTROL_ROLES.has(role.toLowerCase());
}
