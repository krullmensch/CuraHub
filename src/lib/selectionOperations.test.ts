import { describe, expect, it } from 'vitest';
import {
  alignAxis, alignHeight, distributeAxis, duplicateSelection, scaleSelection, setSelectionFrame,
} from './selectionOperations';
import type { ArtworkInstanceData } from '@/store/editorStore';

const pic = (id: number, x: number, y: number, w = 100, h = 100, patch: Partial<ArtworkInstanceData> = {}): ArtworkInstanceData => ({
  id, artworkId: 40 + id, frameStyle: 'none',
  artwork: { width: w, height: h, asset: { path: '', width: 1000, height: 1000, dpi: 72, type: 'image' } },
  position_x: x, position_y: y, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1, ...patch,
});
const byId = (list: ArtworkInstanceData[] | null, id: number) => list!.find(i => i.id === id)!;

describe('alignHeight', () => {
  it('aligns bottoms to the primary (last) artwork', () => {
    const out = alignHeight([pic(1, 0, 1.5), pic(2, 2, 2, 100, 50)], [1, 2], [], 'bottom');
    expect(byId(out, 1).position_y - 0.5).toBeCloseTo(byId(out, 2).position_y - 0.25);
    expect(byId(out, 2).position_y).toBeCloseTo(2);
  });

  it('sets centres to a fixed height', () => {
    const out = alignHeight([pic(1, 0, 1.2), pic(2, 2, 1.8)], [1, 2], [], 'center', 1.5);
    expect(byId(out, 1).position_y).toBeCloseTo(1.5);
    expect(byId(out, 2).position_y).toBeCloseTo(1.5);
  });

  it('never puts an artwork below the floor', () => {
    const out = alignHeight([pic(1, 0, 1.5)], [1], [], 'center', 0.1);
    expect(byId(out, 1).position_y).toBeCloseTo(0.5);
  });

  it('is a no-op for an empty selection', () => {
    expect(alignHeight([pic(1, 0, 1.5)], [], [], 'center')).toBeNull();
  });
});

describe('alignAxis', () => {
  it('aligns left edges on x to the primary', () => {
    const out = alignAxis([pic(1, 0, 1.5), pic(2, 3, 1.5, 200)], [1, 2], [], 'x', 'min');
    expect(byId(out, 1).position_x - 0.5).toBeCloseTo(byId(out, 2).position_x - 1);
    expect(byId(out, 2).position_x).toBeCloseTo(3);
  });

  it('is a no-op with a single artwork', () => {
    expect(alignAxis([pic(1, 0, 1.5)], [1], [], 'x', 'min')).toBeNull();
  });
});

describe('distributeAxis', () => {
  it('distributes equal gaps and keeps the outer artworks', () => {
    const out = distributeAxis([pic(1, 0, 1.5), pic(2, 1.2, 1.5), pic(3, 6, 1.5)], [1, 2, 3], [], 'x');
    expect(byId(out, 1).position_x).toBeCloseTo(0);
    expect(byId(out, 3).position_x).toBeCloseTo(6);
    expect(byId(out, 2).position_x).toBeCloseTo(3);
  });

  it('is a no-op below three artworks', () => {
    expect(distributeAxis([pic(1, 0, 1.5), pic(2, 2, 1.5)], [1, 2], [], 'x')).toBeNull();
  });
});

describe('scaleSelection', () => {
  it('multiplies the scale and skips monitors', () => {
    const out = scaleSelection([pic(1, 0, 1.5), pic(2, 2, 1.5, 100, 100, { medium: 'monitor' })], [1, 2], 1.25);
    expect(byId(out, 1).scale_x).toBeCloseTo(1.25);
    expect(byId(out, 2).scale_x).toBe(1);
  });

  it('lifts a picture that would reach below the floor', () => {
    const out = scaleSelection([pic(1, 0, 0.5)], [1], 2);
    expect(byId(out, 1).position_y).toBeCloseTo(1);
  });
});

describe('setSelectionFrame', () => {
  it('only touches pictures', () => {
    const model = pic(2, 2, 0, 100, 100, { medium: 'model3d', frameStyle: undefined, artwork: { asset: { path: '', width: 0, height: 0, dpi: null, type: 'model3d' } } });
    const out = setSelectionFrame([pic(1, 0, 1.5), model], [1, 2], { frameStyle: 'alu8-silber-matt' });
    expect(byId(out, 1).frameStyle).toBe('alu8-silber-matt');
    expect(byId(out, 2).frameStyle).toBeUndefined();
  });
});

describe('duplicateSelection', () => {
  it('adds copies with new temporary ids, offset to the right of the group', () => {
    const res = duplicateSelection([pic(1, 0, 1.5), pic(2, 1.5, 1.5)], [1, 2], 2, [])!;
    expect(res.copies).toHaveLength(2);
    expect(res.copies.every(id => id < 0)).toBe(true);
    const copies = res.instances.filter(i => res.copies.includes(i.id));
    // The group spans −0.5 … 2.0 m → copies move by 2.5 m + 10 cm.
    expect(copies.map(i => +i.position_x.toFixed(3)).sort((a, b) => a - b)).toEqual([2.6, 4.1]);
    expect(copies.map(i => i.artworkId).sort()).toEqual([41, 42]);
    expect(res.instances).toHaveLength(4);
  });

  it('is a no-op for an empty selection', () => {
    expect(duplicateSelection([pic(1, 0, 1.5)], [], null, [])).toBeNull();
  });
});

describe('books in a selection', () => {
  const book = (id: number) => pic(id, 3, 0, 21, 30, { medium: 'book', artwork: { width: 21, height: 30, asset: { path: '', width: 1, height: 1, dpi: 72, type: 'book' } } });

  it('are never scaled', () => {
    const out = scaleSelection([pic(1, 0, 1.5), book(2)], [1, 2], 1.25);
    expect(byId(out, 2).scale_x).toBe(1);
    expect(byId(out, 1).scale_x).toBeCloseTo(1.25);
  });
  it('stay on the floor when heights are aligned', () => {
    const out = alignHeight([pic(1, 0, 1.5), book(2)], [1, 2], [], 'center', 1.6);
    expect(byId(out, 2).position_y).toBe(0);
  });
});
