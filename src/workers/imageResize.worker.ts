/**
 * Image resize worker (UPL-01/UPL-05).
 *
 * Given an original image File, this worker:
 *  - computes the SHA-256 hash of the ORIGINAL bytes (skipped if crypto.subtle unavailable)
 *  - parses original pixel dimensions + DPI from the file headers (JPEG JFIF/EXIF, PNG pHYs)
 *  - decodes via createImageBitmap and, if oversized, downsamples to max 2500px JPEG
 *
 * Runs as a Vite module worker — no external dependencies.
 */

export interface ImageResizeRequest {
  reqId: number;
  file: File;
}

export interface ImageResizeSuccess {
  reqId: number;
  ok: true;
  file: File;
  clientHash?: string;
  originalWidth: number;
  originalHeight: number;
  dpi?: number;
}

export interface ImageResizeFailure {
  reqId: number;
  ok: false;
  /** Preprocessing failed — caller should fall back to uploading the original file unchanged. */
  originalWidth?: number;
  originalHeight?: number;
  dpi?: number;
  clientHash?: string;
}

export type ImageResizeResponse = ImageResizeSuccess | ImageResizeFailure;

const MAX_DIMENSION = 2500;
const MAX_UNCHANGED_BYTES = 8 * 1024 * 1024; // 8 MB
const JPEG_QUALITY = 0.92;

// ── Hashing ──────────────────────────────────────────────────────────────

async function computeSha256(buf: ArrayBuffer): Promise<string | undefined> {
  try {
    if (!('crypto' in self) || !self.crypto.subtle) return undefined;
    const digest = await self.crypto.subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  } catch {
    return undefined;
  }
}

// ── Header parsers (dimensions + DPI) ───────────────────────────────────

interface HeaderInfo {
  width?: number;
  height?: number;
  dpi?: number;
}

function parseJpegHeader(view: DataView): HeaderInfo {
  const info: HeaderInfo = {};
  let offset = 2; // skip SOI marker (0xFFD8)
  const len = view.byteLength;

  while (offset < len - 4) {
    if (view.getUint8(offset) !== 0xff) {
      offset++;
      continue;
    }
    const marker = view.getUint8(offset + 1);
    offset += 2;

    // Standalone markers without a length field
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > len) break;
    const segLen = view.getUint16(offset);

    // JFIF APP0 — density
    if (marker === 0xe0 && offset + segLen <= len) {
      const identOffset = offset + 2;
      if (
        view.getUint8(identOffset) === 0x4a &&
        view.getUint8(identOffset + 1) === 0x46 &&
        view.getUint8(identOffset + 2) === 0x49 &&
        view.getUint8(identOffset + 3) === 0x46
      ) {
        const units = view.getUint8(identOffset + 7);
        const xDensity = view.getUint16(identOffset + 8);
        if (units === 1 && xDensity > 0) {
          info.dpi = xDensity; // dots per inch
        } else if (units === 2 && xDensity > 0) {
          info.dpi = Math.round(xDensity * 2.54); // dots per cm -> dpi
        }
      }
    }

    // EXIF APP1 — resolution tags (only used if JFIF density absent)
    if (marker === 0xe1 && info.dpi === undefined && offset + segLen <= len) {
      const exifDpi = parseExifResolution(view, offset + 2, segLen - 2);
      if (exifDpi !== undefined) info.dpi = exifDpi;
    }

    // SOF markers carry width/height
    if (
      (marker >= 0xc0 && marker <= 0xcf) &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      if (offset + 7 <= len) {
        info.height = view.getUint16(offset + 3);
        info.width = view.getUint16(offset + 5);
      }
      break;
    }

    offset += segLen;
  }

  return info;
}

function parseExifResolution(view: DataView, start: number, segLen: number): number | undefined {
  try {
    if (segLen < 14) return undefined;
    // "Exif\0\0" header
    if (
      view.getUint8(start) !== 0x45 ||
      view.getUint8(start + 1) !== 0x78 ||
      view.getUint8(start + 2) !== 0x69 ||
      view.getUint8(start + 3) !== 0x66
    ) {
      return undefined;
    }
    const tiffStart = start + 6;
    const little = view.getUint16(tiffStart) === 0x4949;
    const ifd0Offset = view.getUint32(tiffStart + 4, little);
    const ifd0 = tiffStart + ifd0Offset;
    const numEntries = view.getUint16(ifd0, little);

    let xRes: number | undefined;
    let resUnit = 2; // default inches

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifd0 + 2 + i * 12;
      if (entryOffset + 12 > view.byteLength) break;
      const tag = view.getUint16(entryOffset, little);
      if (tag === 0x011a) {
        // XResolution — rational (2x uint32) stored at pointer
        const valueOffset = view.getUint32(entryOffset + 8, little);
        const numerator = view.getUint32(tiffStart + valueOffset, little);
        const denominator = view.getUint32(tiffStart + valueOffset + 4, little);
        if (denominator > 0) xRes = numerator / denominator;
      } else if (tag === 0x0128) {
        // ResolutionUnit: 1=none, 2=inch, 3=cm
        resUnit = view.getUint16(entryOffset + 8, little);
      }
    }

    if (xRes === undefined) return undefined;
    if (resUnit === 3) return Math.round(xRes * 2.54);
    return Math.round(xRes);
  } catch {
    return undefined;
  }
}

function parsePngHeader(view: DataView): HeaderInfo {
  const info: HeaderInfo = {};
  // IHDR always immediately follows the 8-byte signature
  if (view.byteLength >= 24) {
    info.width = view.getUint32(16);
    info.height = view.getUint32(20);
  }

  let offset = 8;
  const len = view.byteLength;
  while (offset + 8 <= len) {
    const chunkLen = view.getUint32(offset);
    const type =
      String.fromCharCode(view.getUint8(offset + 4)) +
      String.fromCharCode(view.getUint8(offset + 5)) +
      String.fromCharCode(view.getUint8(offset + 6)) +
      String.fromCharCode(view.getUint8(offset + 7));

    if (type === 'pHYs' && offset + 8 + 9 <= len) {
      const ppuX = view.getUint32(offset + 8);
      const unit = view.getUint8(offset + 16);
      if (unit === 1 && ppuX > 0) {
        // pixels per metre -> dpi
        info.dpi = Math.round(ppuX * 0.0254);
      }
    }
    if (type === 'IDAT' || type === 'IEND') break;
    offset += 8 + chunkLen + 4; // length + type + data + CRC
  }

  return info;
}

async function parseHeaderInfo(file: File): Promise<HeaderInfo> {
  try {
    // Only the first ~256KB is needed for header parsing (PNG chunks before IDAT are usually small).
    const headBuf = await file.slice(0, 262144).arrayBuffer();
    const view = new DataView(headBuf);
    if (view.byteLength >= 2 && view.getUint16(0) === 0xffd8) {
      return parseJpegHeader(view);
    }
    if (
      view.byteLength >= 8 &&
      view.getUint32(0) === 0x89504e47 &&
      view.getUint32(4) === 0x0d0a1a0a
    ) {
      return parsePngHeader(view);
    }
    return {};
  } catch {
    return {};
  }
}

// ── Resize via OffscreenCanvas ──────────────────────────────────────────

async function resizeIfNeeded(file: File): Promise<File> {
  const supportsOffscreen =
    typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';
  if (!supportsOffscreen) return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Decode failed (e.g. HEIC, unsupported format) — upload original unchanged.
    return file;
  }

  try {
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const needsResize = longestSide > MAX_DIMENSION || file.size > MAX_UNCHANGED_BYTES;

    if (!needsResize) {
      return file;
    }

    let targetWidth = bitmap.width;
    let targetHeight = bitmap.height;
    if (longestSide > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / longestSide;
      targetWidth = Math.round(bitmap.width * scale);
      targetHeight = Math.round(bitmap.height * scale);
    }

    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });

    const dot = file.name.lastIndexOf('.');
    const baseName = dot > 0 ? file.name.slice(0, dot) : file.name;
    const newFile = new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    return newFile;
  } finally {
    bitmap.close();
  }
}

// ── Message handling ─────────────────────────────────────────────────────

self.addEventListener('message', (event: MessageEvent<ImageResizeRequest>) => {
  const { reqId, file } = event.data;
  void handle(reqId, file);
});

async function handle(reqId: number, file: File): Promise<void> {
  let headerInfo: HeaderInfo = {};
  let clientHash: string | undefined;

  try {
    headerInfo = await parseHeaderInfo(file);
  } catch {
    headerInfo = {};
  }

  try {
    const buf = await file.arrayBuffer();
    clientHash = await computeSha256(buf);
  } catch {
    clientHash = undefined;
  }

  // Fall back to bitmap-derived dimensions if header parsing found nothing.
  let originalWidth = headerInfo.width ?? 0;
  let originalHeight = headerInfo.height ?? 0;

  try {
    const resultFile = await resizeIfNeeded(file);

    if (!originalWidth || !originalHeight) {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        originalWidth = bmp.width;
        originalHeight = bmp.height;
        bmp.close();
      } catch {
        // leave at 0 — caller should treat as unknown
      }
    }

    const response: ImageResizeSuccess = {
      reqId,
      ok: true,
      file: resultFile,
      clientHash,
      originalWidth,
      originalHeight,
      dpi: headerInfo.dpi,
    };
    (self as unknown as Worker).postMessage(response);
  } catch {
    const response: ImageResizeFailure = {
      reqId,
      ok: false,
      originalWidth: originalWidth || undefined,
      originalHeight: originalHeight || undefined,
      dpi: headerInfo.dpi,
      clientHash,
    };
    (self as unknown as Worker).postMessage(response);
  }
}
