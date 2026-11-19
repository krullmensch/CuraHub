/** Pure helpers for loading indicators (Vitest: progress.test.ts). */

/** 0…1 → whole percent 0…100 (NaN and out-of-range values clamped). */
export function progressPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

/** Fraction loaded, or null while the total is unknown (no / invalid Content-Length). */
export function downloadFraction(loaded: number, total: number | null): number | null {
  if (total == null || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(1, Math.max(0, loaded / total));
}

/** Content-Length as a number, null when missing or not a positive integer (e.g. compressed responses). */
export function contentLength(headers: Pick<Headers, 'get'>): number | null {
  const raw = headers.get('content-length');
  if (raw == null || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

export type ProgressCallback = (fraction: number | null, loaded: number, total: number | null) => void;

/**
 * Reads a response body completely, reporting progress after every chunk. Falls back to
 * `response.blob()` (one report at the end) when the body cannot be streamed.
 */
export async function readBlobWithProgress(
  response: Response,
  onProgress: ProgressCallback,
  type?: string,
): Promise<Blob> {
  const total = contentLength(response.headers);
  const blobType = type ?? response.headers.get('content-type') ?? '';
  onProgress(downloadFraction(0, total), 0, total);
  if (!response.body) {
    const blob = await response.blob();
    onProgress(1, blob.size, total ?? blob.size);
    return type ? new Blob([blob], { type }) : blob;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(downloadFraction(loaded, total), loaded, total);
  }
  onProgress(1, loaded, total ?? loaded);
  return new Blob(chunks as BlobPart[], { type: blobType });
}

/** „12,3 von 80 MB" / „12,3 MB" for download labels. */
export function formatLoadedBytes(loaded: number, total: number | null): string {
  const mb = (bytes: number) => (bytes / 1024 ** 2).toFixed(1).replace('.', ',');
  return total ? `${mb(loaded)} von ${mb(total)} MB` : `${mb(loaded)} MB`;
}
