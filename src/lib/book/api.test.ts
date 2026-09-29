import { describe, expect, it } from 'vitest';
import { bookDragInfo, bookPdfUrl, parseThickness } from './api';

describe('book api helpers', () => {
  it('builds the PDF route', () => {
    expect(bookPdfUrl(42)).toBe('/api/books/42/pdf');
  });
  it('parses the thickness field (cm, comma or dot, empty = automatic)', () => {
    expect(parseThickness('1,4')).toBe(1.4);
    expect(parseThickness('2.5')).toBe(2.5);
    expect(parseThickness('')).toBeNull();
    expect(parseThickness('0.1')).toBe('invalid');
    expect(parseThickness('abc')).toBe('invalid');
  });
  it('builds drag info only for books', () => {
    expect(bookDragInfo({ id: 1, type: 'image' })).toBeUndefined();
    expect(bookDragInfo({ id: 2, type: 'book', metadata: { pageCount: 12 }, artwork: { title: 'K', depth: 2 } }))
      .toMatchObject({ assetId: 2, pageCount: 12, depth: 2, publicReadable: false, title: 'K' });
  });
});
