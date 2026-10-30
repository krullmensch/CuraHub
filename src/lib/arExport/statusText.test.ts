import { describe, expect, it } from 'vitest';
import { arExportStatusText, formatMb, type ArExportStatusResponse } from './statusText';

const base = { glbSize: null, usdzSize: null, skipped: 0, error: null, finishedAt: null, queuePosition: null };
const MB = 1024 ** 2;

describe('formatMb', () => {
  it('uses one decimal with a comma below 10 MB, none from 10 MB', () => {
    expect(formatMb(3.4 * MB)).toBe('3,4 MB');
    expect(formatMb(12 * MB)).toBe('12 MB');
    expect(formatMb(9.96 * MB)).toBe('10 MB');
  });
});

describe('arExportStatusText', () => {
  it('shows the queue position', () => {
    const s: ArExportStatusResponse = { ...base, status: 'queued', queuePosition: 2 };
    expect(arExportStatusText(s)).toEqual({ line: 'In Warteschlange (Platz 2)' });
  });
  it('shows running', () => {
    expect(arExportStatusText({ ...base, status: 'running' }).line).toBe('Wird erzeugt…');
  });
  it('shows sizes when done', () => {
    const s: ArExportStatusResponse = { ...base, status: 'done', glbSize: 12 * MB, usdzSize: 14 * MB };
    expect(arExportStatusText(s)).toEqual({ line: 'Fertig · GLB 12 MB · USDZ 14 MB' });
  });
  it('reports skipped works as detail', () => {
    const one: ArExportStatusResponse = { ...base, status: 'done', glbSize: 12 * MB, usdzSize: 14 * MB, skipped: 1 };
    expect(arExportStatusText(one).detail).toBe('1 Werk ausgelassen');
    expect(arExportStatusText({ ...one, skipped: 2 }).detail).toBe('2 Werke ausgelassen');
  });
  it('shows the error when failed', () => {
    const s: ArExportStatusResponse = { ...base, status: 'failed', error: 'Zu groß für AR' };
    expect(arExportStatusText(s).line).toBe('Fehlgeschlagen: Zu groß für AR');
  });
});
