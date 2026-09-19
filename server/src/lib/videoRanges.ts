import type { RequestHandler } from 'express';

// Videos are served in short range responses, and never from the Cloudflare cache.
//
// Firefox over HTTP/3 (Cloudflare) stalls the whole QUIC connection while a media channel
// is suspended: the <video> element asks for `bytes=0-`, reads until its read-ahead buffer
// is full and then pauses the stream. A 96 MB video therefore held one half-read stream
// open for minutes, and every artwork image requested on the same connection hung
// (public viewer of "Yol": ~20 of 72 pictures loaded). Short 206 responses finish quickly,
// and the browser asks for the next range when it needs it.
//
// Cloudflare would answer range requests from its cached copy of the whole file, so video
// responses are `private` (browser cache only).

export const VIDEO_RANGE_CHUNK_BYTES = 2 * 1024 * 1024;

const VIDEO_EXT_RE = /\.(mp4|m4v|webm|mov)$/i;
const SINGLE_RANGE_RE = /^bytes=(\d+)-(\d*)$/;

export function isVideoPath(filePath: string): boolean {
    return VIDEO_EXT_RE.test(filePath);
}

/** `bytes=a-` or `bytes=a-b` limited to `chunk` bytes; anything else (suffix, multi-range) unchanged. */
export function capRangeHeader(range: string, chunk = VIDEO_RANGE_CHUNK_BYTES): string {
    const m = SINGLE_RANGE_RE.exec(range.trim());
    if (!m) return range;
    const start = Number(m[1]);
    const lastAllowed = start + chunk - 1;
    const end = m[2] === '' ? lastAllowed : Math.min(Number(m[2]), lastAllowed);
    return `bytes=${start}-${end}`;
}

/** Mount before express.static for the uploads directory. */
export const capVideoRanges: RequestHandler = (req, _res, next) => {
    const range = req.headers.range;
    if (range && isVideoPath(req.path)) req.headers.range = capRangeHeader(range);
    next();
};
