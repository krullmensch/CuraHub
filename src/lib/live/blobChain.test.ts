import { describe, expect, it } from 'vitest';
import { BLOB_HEIGHT, BlobChain, MAX_LINK, ballStrength, blobColor, blobTarget } from './blobChain';

const run = (chain: BlobChain, target: [number, number, number], seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) chain.step(target, 1 / 60);
};

describe('blob chain', () => {
  it('rests as one ball where the visitor is', () => {
    const chain = new BlobChain([0, 1, 0]);
    run(chain, [0, 1, 0], 1);
    expect(chain.length).toBeLessThan(1e-6);
  });

  it('stretches behind the head while moving and catches up after stopping', () => {
    const chain = new BlobChain([0, 1, 0]);
    let maxStretch = 0;
    // Walk 1.5 m/s along x for a second.
    for (let t = 0; t < 1; t += 1 / 60) {
      chain.step([t * 1.5, 1, 0], 1 / 60);
      maxStretch = Math.max(maxStretch, chain.length);
    }
    expect(maxStretch).toBeGreaterThan(0.4);
    // The field cube (half size 1.1 m) is centred on the body: everything stays inside.
    const c = chain.centre;
    for (const seg of chain.segments) expect(Math.hypot(seg.position[0] - c[0], seg.position[2] - c[2]) + seg.radius).toBeLessThan(1.1);
    const tail = chain.segments[chain.segments.length - 1].position[0];
    expect(tail).toBeLessThan(chain.segments[0].position[0]); // trailing behind
    run(chain, [1.5, 1, 0], 6);
    expect(chain.length).toBeLessThan(0.01);
    expect(chain.segments[0].position[0]).toBeCloseTo(1.5, 2);
  });

  it('overshoots a little when stopping (wobble)', () => {
    const chain = new BlobChain([0, 1, 0]);
    for (let t = 0; t < 1; t += 1 / 60) chain.step([t * 2, 1, 0], 1 / 60);
    let maxTail = -Infinity;
    for (let t = 0; t < 2; t += 1 / 60) {
      chain.step([2, 1, 0], 1 / 60);
      maxTail = Math.max(maxTail, chain.segments[chain.segments.length - 1].position[0]);
    }
    expect(maxTail).toBeGreaterThan(2);
  });

  it('stays together and stable after a long pause or a teleport', () => {
    const chain = new BlobChain([0, 1, 0]);
    chain.step([50, 1, 0], 5); // tab was hidden, the visitor walked far
    for (const seg of chain.segments) expect(Number.isFinite(seg.position[0])).toBe(true);
    for (let i = 1; i < chain.segments.length; i++) {
      const a = chain.segments[i - 1].position;
      const b = chain.segments[i].position;
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThanOrEqual(MAX_LINK + 1e-9);
    }
  });

  it('helpers', () => {
    expect(blobTarget([3, 1.62, -2])).toEqual([3, BLOB_HEIGHT, -2]);
    expect(blobColor('abc')).toBe(blobColor('abc'));
    expect(blobColor('abc')).not.toBe(blobColor('abd'));
    // A ball of half the half-size, isolation 80, subtract 12 → r_n = 0.25.
    expect(ballStrength(0.5, 1, 80, 12)).toBeCloseTo(0.0625 * 92);
  });
});
