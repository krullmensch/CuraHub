export interface ArExportStatusResponse {
  status: 'queued' | 'running' | 'done' | 'failed';
  glbSize: number | null;
  usdzSize: number | null;
  skipped: number;
  error: string | null;
  finishedAt: string | null;
  queuePosition: number | null;
}

/** Server answer of `GET …/ar-export`: a row, or `none` when no export was ever queued. */
export type ArExportStatus = ArExportStatusResponse | { status: 'none' };

/** One decimal with a German comma below 10 MB (3,4 MB), none from 10 MB (12 MB). */
export function formatMb(bytes: number): string {
  const mb = bytes / 1024 ** 2;
  if (mb < 9.95) return `${mb.toFixed(1).replace('.', ',')} MB`;
  return `${Math.round(mb)} MB`;
}

export function arExportStatusText(s: ArExportStatusResponse): { line: string; detail?: string } {
  switch (s.status) {
    case 'queued':
      return { line: `In Warteschlange (Platz ${s.queuePosition ?? 1})` };
    case 'running':
      return { line: 'Wird erzeugt…' };
    case 'failed':
      return { line: `Fehlgeschlagen: ${s.error ?? 'Unbekannter Fehler'}` };
    case 'done': {
      const sizes = [
        s.glbSize != null ? `GLB ${formatMb(s.glbSize)}` : null,
        s.usdzSize != null ? `USDZ ${formatMb(s.usdzSize)}` : null,
      ].filter(Boolean);
      const line = ['Fertig', ...sizes].join(' · ');
      if (s.skipped <= 0) return { line };
      return { line, detail: s.skipped === 1 ? '1 Werk ausgelassen' : `${s.skipped} Werke ausgelassen` };
    }
  }
}
