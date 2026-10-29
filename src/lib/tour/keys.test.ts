import { describe, expect, it } from 'vitest';
import { tourKeyAction } from './keys';

const key = (k: string, mods: Partial<Record<'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey', boolean>> = {}) =>
  ({ key: k, altKey: false, metaKey: false, ctrlKey: false, shiftKey: false, ...mods });

describe('tourKeyAction', () => {
  it('maps the tour keys', () => {
    expect(tourKeyAction(key('ArrowRight'))).toBe('next');
    expect(tourKeyAction(key('Enter'))).toBe('next');
    expect(tourKeyAction(key('ArrowLeft'))).toBe('back');
    expect(tourKeyAction(key('Escape'))).toBe('skip');
  });
  it('ignores other keys', () => {
    expect(tourKeyAction(key('g'))).toBeNull();
    expect(tourKeyAction(key('Tab'))).toBeNull();
  });
  it('leaves modified keys to the browser (Alt+← = back)', () => {
    expect(tourKeyAction(key('ArrowLeft', { altKey: true }))).toBeNull();
    expect(tourKeyAction(key('ArrowRight', { metaKey: true }))).toBeNull();
    expect(tourKeyAction(key('Enter', { ctrlKey: true }))).toBeNull();
  });
});
