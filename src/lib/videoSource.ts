/** Short edge of the browser version of a video (VID-02 caps it at 1080 px). */
const WEB_MAX_SHORT_EDGE = 1080;

interface VideoAssetLike {
    path: string;
    /** Original pixel dimensions (UPL-05). */
    width: number;
    height: number;
    metadata?: { videoProxies?: Record<string, string> | null } | null;
}

/**
 * VID-04: file to play for a render preset — the largest proxy whose short edge fits
 * `maxShortEdge`, otherwise the full browser version (no limit, no proxies yet, or the video
 * is already small enough).
 */
export function pickVideoSource(asset: VideoAssetLike, maxShortEdge: number | null): string {
    const proxies = asset.metadata?.videoProxies;
    if (maxShortEdge === null || !proxies) return asset.path;
    const webShortEdge = Math.min(asset.width || WEB_MAX_SHORT_EDGE, asset.height || WEB_MAX_SHORT_EDGE, WEB_MAX_SHORT_EDGE);
    if (webShortEdge <= maxShortEdge) return asset.path;
    const best = Object.entries(proxies)
        .map(([height, path]) => [Number(height), path] as const)
        .filter(([height, path]) => Number.isFinite(height) && height <= maxShortEdge && typeof path === 'string')
        .sort((a, b) => b[0] - a[0])[0];
    return best ? best[1] : asset.path;
}

const UPLOADS_PREFIX = '/uploads/';

/**
 * URL for a playing <video>: the server's stream endpoint, which answers in short ranges past
 * the Cloudflare cache (server/src/lib/videoRanges.ts — long-lived video streams stalled
 * Firefox's HTTP/3 connection and with it every artwork image).
 */
export function videoStreamUrl(path: string): string {
    if (!path.startsWith(UPLOADS_PREFIX)) return path;
    return `/uploads/stream?src=${encodeURIComponent(path.slice(UPLOADS_PREFIX.length))}`;
}
