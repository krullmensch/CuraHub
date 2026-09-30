import { parseThickness } from './api';

/** Thickness as the text field shows it (cm, comma, one decimal); '' = automatic. */
export const formatThickness = (v: number) => v.toFixed(1).replace('.', ',');
export const thicknessToField = (depth: number | null | undefined) => (depth != null ? formatThickness(depth) : '');

/** Title that is saved for the field's text: an empty title falls back to the filename. */
export const effectiveTitle = (raw: string, filename: string) => raw.trim() || filename;

/** The new value of a free-text field, or null when there is nothing to commit. */
export function textChange(prev: string, next: string): string | null {
  return next === prev ? null : next;
}

/** The title to save, or null when it equals the stored one (after the filename fallback). */
export function titleChange(prev: string, raw: string, filename: string): string | null {
  const next = effectiveTitle(raw, filename);
  return next === prev ? null : next;
}

export type ThicknessChange = { kind: 'unchanged' } | { kind: 'invalid' } | { kind: 'set'; value: number | null };

/**
 * What a thickness field means against the stored depth. A field still showing the stored value
 * (which is displayed rounded to one decimal) is untouched — a stored 1.45 must not become 1.5.
 */
export function thicknessChange(prev: number | null | undefined, raw: string): ThicknessChange {
  if (raw === thicknessToField(prev)) return { kind: 'unchanged' };
  const parsed = parseThickness(raw);
  if (parsed === 'invalid') return { kind: 'invalid' };
  return parsed === (prev ?? null) ? { kind: 'unchanged' } : { kind: 'set', value: parsed };
}
