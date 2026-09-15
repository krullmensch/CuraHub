/**
 * Client-side image preprocessing before upload (UPL-01, UPL-05).
 *
 * Resizes oversized images to max 2500px JPEG in a background Worker pool and
 * extracts client-side hash/dimensions/DPI for the upload contract
 * (`clientHash`, `originalWidth`, `originalHeight`, `dpi`). Never blocks the
 * upload on failure — any error falls back to the original file.
 */
import type { ImageResizeRequest, ImageResizeResponse } from '@/workers/imageResize.worker';

export interface PreprocessResult {
  file: File;
  clientHash?: string;
  originalWidth?: number;
  originalHeight?: number;
  dpi?: number;
}

const MAX_WORKERS = 2;

interface PoolWorker {
  worker: Worker;
  busy: boolean;
}

let pool: PoolWorker[] | null = null;
let workerSupportUnavailable = false;
let reqCounter = 0;

const queue: Array<() => void> = [];

function createWorker(): Worker | null {
  try {
    return new Worker(new URL('../workers/imageResize.worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    return null;
  }
}

function getPool(): PoolWorker[] | null {
  if (workerSupportUnavailable) return null;
  if (pool) return pool;
  if (typeof Worker === 'undefined') {
    workerSupportUnavailable = true;
    return null;
  }
  const workers: PoolWorker[] = [];
  for (let i = 0; i < MAX_WORKERS; i++) {
    const w = createWorker();
    if (!w) {
      workerSupportUnavailable = true;
      workers.forEach((pw) => pw.worker.terminate());
      return null;
    }
    workers.push({ worker: w, busy: false });
  }
  pool = workers;
  return pool;
}

function acquireWorker(): Promise<PoolWorker> {
  return new Promise((resolve) => {
    const attempt = () => {
      const workers = getPool();
      if (!workers) return false;
      const free = workers.find((w) => !w.busy);
      if (free) {
        free.busy = true;
        resolve(free);
        return true;
      }
      return false;
    };

    if (attempt()) return;
    queue.push(attempt);
  });
}

function releaseWorker(pw: PoolWorker) {
  pw.busy = false;
  while (queue.length > 0) {
    const next = queue.shift();
    if (next && next()) break;
  }
}

function runInWorker(pw: PoolWorker, file: File): Promise<ImageResizeResponse> {
  return new Promise((resolve, reject) => {
    const reqId = ++reqCounter;
    const { worker } = pw;

    const onMessage = (event: MessageEvent<ImageResizeResponse>) => {
      if (event.data.reqId !== reqId) return;
      cleanup();
      resolve(event.data);
    };
    const onError = (err: ErrorEvent) => {
      cleanup();
      reject(err.error ?? new Error(err.message));
    };
    const cleanup = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    const request: ImageResizeRequest = { reqId, file };
    worker.postMessage(request);
  });
}

/** Main-thread fallback: reads dimensions only, never resizes. */
async function fallbackDimsOnly(file: File): Promise<PreprocessResult> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(file);
      const result: PreprocessResult = {
        file,
        originalWidth: bmp.width,
        originalHeight: bmp.height,
      };
      bmp.close();
      return result;
    }
  } catch {
    // fall through
  }
  return { file };
}

const IMAGE_MIME_PREFIX = 'image/';
const UNSUPPORTED_TYPES = new Set(['image/gif', 'image/svg+xml']);

export async function preprocessImageForUpload(file: File): Promise<PreprocessResult> {
  if (!file.type.startsWith(IMAGE_MIME_PREFIX) || UNSUPPORTED_TYPES.has(file.type)) {
    return { file };
  }

  const workers = getPool();
  if (!workers) {
    return fallbackDimsOnly(file);
  }

  let pw: PoolWorker;
  try {
    pw = await acquireWorker();
  } catch {
    return fallbackDimsOnly(file);
  }

  try {
    const response = await runInWorker(pw, file);
    if (response.ok) {
      return {
        file: response.file,
        clientHash: response.clientHash,
        originalWidth: response.originalWidth || undefined,
        originalHeight: response.originalHeight || undefined,
        dpi: response.dpi,
      };
    }
    // Worker reported a handled failure — upload original, keep whatever metadata we got.
    return {
      file,
      clientHash: response.clientHash,
      originalWidth: response.originalWidth,
      originalHeight: response.originalHeight,
      dpi: response.dpi,
    };
  } catch {
    // Worker crashed entirely — never block the upload.
    return { file };
  } finally {
    releaseWorker(pw);
  }
}
