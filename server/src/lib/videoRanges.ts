import type { RequestHandler } from 'express';

// Videos played in the scene are streamed in short range responses, past the Cloudflare cache.
//
// Firefox over HTTP/3 (Cloudflare) stalls the whole QUIC connection while a media channel
// is suspended: the <video> element asks for `bytes=0-`, reads until its read-ahead buffer
// is full and then pauses the stream. A 96 MB video therefore held one half-read stream
// open for minutes, and every artwork image requested on the same connection hung
// (public viewer of "Yol": ~20 of 72 pictures loaded). Short 206 responses finish quickly,
// and the browser asks for the next range when it needs it.
//
// This needs its own URL without a file extension (`/uploads/stream?src=<file>`): for paths
// ending in .mp4 Cloudflare drops the Range header, fetches the whole file for its cache and
// answers every range from that copy, whatever the origin would have sent.

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

/** GET /uploads/stream?src=<path inside uploads> — a video file with capped ranges. */
export function videoStreamHandler(uploadsDir: string): RequestHandler {
    return (req, res) => {
        const src = typeof req.query.src === 'string' ? req.query.src : '';
        if (!isVideoPath(src)) {
            res.status(400).json({ error: 'Ungültige Videoquelle' });
            return;
        }
        if (req.headers.range) req.headers.range = capRangeHeader(req.headers.range);
        // `root` makes send() reject `..` segments, so src can't leave the uploads directory.
        res.sendFile(src, {
            root: uploadsDir,
            dotfiles: 'deny',
            headers: { 'Cache-Control': 'private, max-age=604800' },
        }, (err?: Error & { status?: number }) => {
            if (err && !res.headersSent) res.status(err.status ?? 500).json({ error: 'Video nicht gefunden' });
        });
    };
}
