/**
 * VID-03: chunked upload for large files. Cloudflare rejects request bodies > 100 MB, so files
 * above CHUNKED_UPLOAD_THRESHOLD are sent as sequential chunks and assembled on the server
 * (server/src/lib/chunkedUploads.ts). The final response matches a regular `POST /upload`.
 */

export const CHUNKED_UPLOAD_THRESHOLD = 64 * 1024 * 1024;

const FALLBACK_CHUNK_SIZE = 16 * 1024 * 1024;
const MAX_CONSECUTIVE_FAILURES = 5;

export interface UploadResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface ChunkedUploadOptions {
  token: string;
  /** Same form fields as the multipart upload (projectId, folderId, force, …). */
  fields: Record<string, string>;
  /** 0–1 */
  onProgress: (fraction: number) => void;
  /** Receives a function that aborts the upload. */
  onCancelReady: (cancel: () => void) => void;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Parses a JSON body; null for proxy error pages (HTML) or empty bodies. */
async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await res.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const isRetryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

export async function uploadFileInChunks(file: File, opts: ChunkedUploadOptions): Promise<UploadResponse> {
  const authHeaders = { Authorization: `Bearer ${opts.token}` };
  let aborted = false;
  let uploadId: string | null = null;
  let currentXhr: XMLHttpRequest | null = null;

  opts.onCancelReady(() => {
    aborted = true;
    currentXhr?.abort();
    if (uploadId) {
      fetch(`/upload/chunks/${uploadId}`, { method: 'DELETE', headers: authHeaders }).catch(() => undefined);
    }
  });
  const throwIfAborted = () => {
    if (aborted) throw new Error('Abgebrochen');
  };

  const initRes = await fetch('/upload/chunks', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      size: file.size,
      mimetype: file.type || undefined,
      fields: opts.fields,
    }),
  });
  const initBody = await readJson(initRes);
  if (!initRes.ok || !initBody || typeof initBody.uploadId !== 'string') {
    return { status: initRes.status, body: initBody ?? { error: `Upload konnte nicht gestartet werden (HTTP ${initRes.status})` } };
  }
  uploadId = initBody.uploadId;
  const chunkSize = typeof initBody.chunkSize === 'number' && initBody.chunkSize > 0 ? initBody.chunkSize : FALLBACK_CHUNK_SIZE;

  const putChunk = (offset: number, blob: Blob, onLoaded: (bytes: number) => void) =>
    new Promise<UploadResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      currentXhr = xhr;
      xhr.open('PUT', `/upload/chunks/${uploadId}?offset=${offset}`);
      xhr.setRequestHeader('Authorization', authHeaders.Authorization);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => onLoaded(e.loaded);
      xhr.onload = () => {
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(xhr.responseText) as Record<string, unknown>;
        } catch {
          // proxy error page — treated by status code
        }
        resolve({ status: xhr.status, body });
      };
      xhr.onerror = () => reject(new Error('Netzwerkfehler beim Upload'));
      xhr.onabort = () => reject(new Error('Abgebrochen'));
      xhr.send(blob);
    });

  let offset = 0;
  let failures = 0;
  while (offset < file.size) {
    throwIfAborted();
    const blob = file.slice(offset, Math.min(file.size, offset + chunkSize));
    try {
      const chunkOffset = offset;
      const res = await putChunk(chunkOffset, blob, (bytes) => opts.onProgress((chunkOffset + bytes) / file.size));
      if (res.status === 200 && typeof res.body.received === 'number') {
        offset = res.body.received;
        failures = 0;
        continue;
      }
      if (res.status === 409 && typeof res.body.received === 'number') {
        // Server has a different offset (e.g. a lost response) — continue from there.
        offset = res.body.received;
      } else if (!isRetryableStatus(res.status)) {
        return res;
      }
    } catch (err) {
      throwIfAborted();
      if (!(err instanceof Error) || err.message !== 'Netzwerkfehler beim Upload') throw err;
    }
    failures++;
    if (failures >= MAX_CONSECUTIVE_FAILURES) throw new Error('Netzwerkfehler beim Upload');
    await delay(1000 * 2 ** (failures - 1));
  }

  opts.onProgress(1);
  for (let attempt = 1; ; attempt++) {
    throwIfAborted();
    try {
      const res = await fetch(`/upload/chunks/${uploadId}/complete`, { method: 'POST', headers: authHeaders });
      const body = await readJson(res);
      // A JSON answer is final (the server caches it, a retry would return the same).
      if (body) return { status: res.status, body };
      if (!isRetryableStatus(res.status) || attempt >= MAX_CONSECUTIVE_FAILURES) {
        return { status: res.status, body: { error: `Ungültige Serverantwort (HTTP ${res.status})` } };
      }
    } catch {
      if (attempt >= MAX_CONSECUTIVE_FAILURES) throw new Error('Netzwerkfehler beim Upload');
    }
    await delay(1000 * 2 ** (attempt - 1));
  }
}
