import { describe, expect, it } from 'vitest';
import { effectiveTitle, formatThickness, textChange, thicknessChange, thicknessToField, titleChange } from './settingsForm';

describe('book settings form helpers', () => {
  it('formats thickness with a decimal comma, empty for automatic', () => {
    expect(formatThickness(1.4)).toBe('1,4');
    expect(thicknessToField(2)).toBe('2,0');
    expect(thicknessToField(null)).toBe('');
    expect(thicknessToField(undefined)).toBe('');
  });
  it('falls back to the filename for an empty title', () => {
    expect(effectiveTitle('  ', 'katalog.pdf')).toBe('katalog.pdf');
    expect(effectiveTitle(' Zine ', 'katalog.pdf')).toBe('Zine');
  });
  it('commits text only when it changed', () => {
    expect(textChange('a', 'a')).toBeNull();
    expect(textChange('a', 'b')).toBe('b');
    expect(textChange('a', '')).toBe('');
  });
  it('commits a title only when the effective title changed', () => {
    expect(titleChange('Zine', 'Zine', 'k.pdf')).toBeNull();
    expect(titleChange('Zine', ' Zine ', 'k.pdf')).toBeNull();
    expect(titleChange('Zine', ' Neu ', 'k.pdf')).toBe('Neu');
    expect(titleChange('Zine', '', 'k.pdf')).toBe('k.pdf');
    expect(titleChange('k.pdf', '', 'k.pdf')).toBeNull();
  });
  it('classifies a thickness edit', () => {
    expect(thicknessChange(1.4, '1,4')).toEqual({ kind: 'unchanged' });
    expect(thicknessChange(1.4, '2')).toEqual({ kind: 'set', value: 2 });
    expect(thicknessChange(1.4, '')).toEqual({ kind: 'set', value: null });
    expect(thicknessChange(null, '')).toEqual({ kind: 'unchanged' });
    expect(thicknessChange(null, '3,5')).toEqual({ kind: 'set', value: 3.5 });
    expect(thicknessChange(1.4, '9')).toEqual({ kind: 'invalid' });
    expect(thicknessChange(1.4, 'abc')).toEqual({ kind: 'invalid' });
  });
  it('leaves a stored depth alone that the field only shows rounded (1.46 -> 1,5)', () => {
    expect(thicknessToField(1.46)).toBe('1,5');
    expect(thicknessChange(1.46, '1,5')).toEqual({ kind: 'unchanged' });
    expect(thicknessChange(1.46, '1,6')).toEqual({ kind: 'set', value: 1.6 });
  });
});
