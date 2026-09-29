import { describe, expect, it } from 'vitest';
import { labelPlateLines } from './labelPlate';

describe('labelPlateLines', () => {
  it('shows the title and „artist, year"', () => {
    expect(labelPlateLines({ title: 'Katalog.pdf', artist: 'Ada Muster', year: '2024' })).toEqual({ title: 'Katalog', byline: 'Ada Muster, 2024' });
  });
  it('drops the server placeholder artist and empty parts', () => {
    expect(labelPlateLines({ title: 'K', artist: 'Unknown', year: '' })).toEqual({ title: 'K', byline: '' });
    expect(labelPlateLines({ title: '', artist: null, year: '1999' })).toEqual({ title: 'Ohne Titel', byline: '1999' });
  });
  it('shortens long lines with an ellipsis', () => {
    const { title } = labelPlateLines({ title: 'x'.repeat(80) });
    expect(title).toHaveLength(42);
    expect(title.endsWith('…')).toBe(true);
  });
});
