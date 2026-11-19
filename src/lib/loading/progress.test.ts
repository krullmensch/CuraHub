import { describe, expect, it } from 'vitest';
import { contentLength, downloadFraction, formatLoadedBytes, progressPercent, readBlobWithProgress } from './progress';

describe('progressPercent', () => {
  it('rounds and clamps', () => {
    expect(progressPercent(0.456)).toBe(46);
    expect(progressPercent(-1)).toBe(0);
    expect(progressPercent(2)).toBe(100);
    expect(progressPercent(Number.NaN)).toBe(0);
  });
});

describe('downloadFraction', () => {
  it('is null without a usable total', () => {
    expect(downloadFraction(10, null)).toBeNull();
    expect(downloadFraction(10, 0)).toBeNull();
  });
  it('clamps to 1', () => {
    expect(downloadFraction(5, 10)).toBe(0.5);
    expect(downloadFraction(20, 10)).toBe(1);
  });
});

describe('contentLength', () => {
  const h = (v: string | null) => ({ get: () => v });
  it('parses positive integers only', () => {
    expect(contentLength(h('1024'))).toBe(1024);
    expect(contentLength(h(null))).toBeNull();
    expect(contentLength(h('0'))).toBeNull();
    expect(contentLength(h('abc'))).toBeNull();
  });
});

describe('formatLoadedBytes', () => {
  it('uses a German comma', () => {
    expect(formatLoadedBytes(1.5 * 1024 ** 2, 10 * 1024 ** 2)).toBe('1,5 von 10,0 MB');
    expect(formatLoadedBytes(1.5 * 1024 ** 2, null)).toBe('1,5 MB');
  });
});

describe('readBlobWithProgress', () => {
  it('reports every chunk and ends at 1', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    });
    const res = new Response(body, { headers: { 'content-length': '10' } });
    const seen: (number | null)[] = [];
    const blob = await readBlobWithProgress(res, (f) => seen.push(f), 'model/vnd.usdz+zip');
    expect(blob.size).toBe(10);
    expect(blob.type).toBe('model/vnd.usdz+zip');
    expect(seen).toEqual([0, 0.4, 1, 1]);
  });

  it('stays indeterminate without Content-Length', async () => {
    const res = new Response(new Uint8Array(3));
    res.headers.delete('content-length');
    const seen: (number | null)[] = [];
    await readBlobWithProgress(res, (f) => seen.push(f));
    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]).toBe(1);
  });
});
