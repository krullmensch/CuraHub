import path from 'path';
import ffmpeg from 'fluent-ffmpeg';

/**
 * VID-02: browser-safe video output. Uploads were passed through whenever the file ended in
 * `.mp4`, so HEVC (black in Firefox and in Chrome without a hardware decoder), VP9-in-MP4,
 * 10-bit and 4K files reached the scene. Only H.264 / yuv420p / ≤ 1080p / AAC is kept as-is
 * (remuxed for faststart); everything else is transcoded.
 */

export interface VideoProbe {
    width: number;
    height: number;
    duration: number;
    videoCodec: string | null;
    pixelFormat: string | null;
    audioCodec: string | null;
    /** ffprobe container list, e.g. "mov,mp4,m4a,3gp,3g2,mj2". */
    formatName: string | null;
}

const MAX_LONG_EDGE = 1920;
const MAX_SHORT_EDGE = 1080;

// Fit into 1920×1080 (landscape) or 1080×1920 (portrait), never upscale, even dimensions for yuv420p.
const SCALE_FILTER =
    "scale=w='if(gte(iw,ih),min(1920,iw),min(1080,iw))':h='if(gte(iw,ih),min(1080,ih),min(1920,ih))'" +
    ':force_original_aspect_ratio=decrease:force_divisible_by=2';

export function probeVideo(filePath: string): Promise<VideoProbe> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            const video = metadata.streams.find((s) => s.codec_type === 'video');
            const audio = metadata.streams.find((s) => s.codec_type === 'audio');
            resolve({
                width: video?.width || 0,
                height: video?.height || 0,
                duration: metadata.format.duration || 0,
                videoCodec: video?.codec_name ?? null,
                pixelFormat: video?.pix_fmt ?? null,
                audioCodec: audio?.codec_name ?? null,
                formatName: metadata.format.format_name ?? null,
            });
        });
    });
}

export function isWebCompatible(probe: VideoProbe): boolean {
    const longEdge = Math.max(probe.width, probe.height);
    const shortEdge = Math.min(probe.width, probe.height);
    return probe.videoCodec === 'h264'
        && (probe.pixelFormat === 'yuv420p' || probe.pixelFormat === 'yuvj420p')
        && longEdge > 0 && longEdge <= MAX_LONG_EDGE && shortEdge <= MAX_SHORT_EDGE
        && (probe.audioCodec === null || probe.audioCodec === 'aac')
        && !!probe.formatName && /\b(mp4|mov)\b/.test(probe.formatName);
}

/** 0–100 */
export type VideoProgressCallback = (percent: number) => void;

/** "HH:MM:SS.xx" → seconds */
function parseTimemark(timemark: string): number {
    const [h, m, sec] = timemark.split(':').map(Number);
    return (h || 0) * 3600 + (m || 0) * 60 + (sec || 0);
}

function run(command: ffmpeg.FfmpegCommand, outputPath: string, onProgress?: VideoProgressCallback, durationSec?: number): Promise<void> {
    return new Promise((resolve, reject) => {
        command
            .output(outputPath)
            .on('progress', (p: { percent?: number; timemark?: string }) => {
                if (!onProgress) return;
                let percent = typeof p.percent === 'number' && Number.isFinite(p.percent) ? p.percent : NaN;
                if (!Number.isFinite(percent) && durationSec && p.timemark) {
                    percent = (parseTimemark(p.timemark) / durationSec) * 100;
                }
                if (Number.isFinite(percent)) onProgress(Math.max(0, Math.min(100, percent)));
            })
            .on('end', () => resolve())
            .on('error', (err: Error) => reject(err))
            .run();
    });
}

/** Stream copy with the moov atom moved to the front (playback starts before full download). */
export function remuxForWeb(inputPath: string, outputPath: string, onProgress?: VideoProgressCallback, durationSec?: number): Promise<void> {
    return run(
        ffmpeg(inputPath).outputOptions(['-map 0:v:0', '-map 0:a:0?', '-c copy', '-movflags +faststart']),
        outputPath,
        onProgress,
        durationSec,
    );
}

export function transcodeForWeb(inputPath: string, outputPath: string, onProgress?: VideoProgressCallback, durationSec?: number): Promise<void> {
    return run(
        ffmpeg(inputPath)
            .videoFilters(SCALE_FILTER)
            .outputOptions([
                '-map 0:v:0',
                '-map 0:a:0?',
                '-c:v libx264',
                '-preset fast',
                '-crf 23',
                '-pix_fmt yuv420p',
                '-profile:v high',
                '-c:a aac',
                '-b:a 128k',
                '-movflags +faststart',
            ]),
        outputPath,
        onProgress,
        durationSec,
    );
}

/** Writes a browser-safe MP4 to `outputPath`. `probe` may be null if ffprobe failed. */
export interface WebVideoHooks {
    /** Called before each ffmpeg pass (a failed remux falls back to a transcode). */
    onStage?: (stage: 'remux' | 'transcode') => void;
    onProgress?: VideoProgressCallback;
}

export async function makeWebVideo(inputPath: string, outputPath: string, probe: VideoProbe | null, hooks: WebVideoHooks = {}): Promise<'remux' | 'transcode'> {
    const duration = probe?.duration || undefined;
    if (probe && isWebCompatible(probe)) {
        try {
            hooks.onStage?.('remux');
            await remuxForWeb(inputPath, outputPath, hooks.onProgress, duration);
            return 'remux';
        } catch (err) {
            console.warn('[Video] Remux failed, transcoding instead:', err);
        }
    }
    hooks.onStage?.('transcode');
    await transcodeForWeb(inputPath, outputPath, hooks.onProgress, duration);
    return 'transcode';
}

/** Poster frame (640 px wide) at 0.5 s. */
export function extractThumbnail(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .screenshots({
                count: 1,
                timestamps: ['00:00:00.500'],
                filename: path.basename(outputPath),
                folder: path.dirname(outputPath),
                size: '640x?',
            })
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });
}

/** VID-04: proxy sizes (short edge, px) for the low (480) and medium (720) render presets. */
export const VIDEO_PROXY_HEIGHTS = [720, 480] as const;

/** Proxy short edges that are smaller than the web version (whose short edge is ≤ 1080). */
export function proxyHeightsFor(width: number, height: number): number[] {
    const shortEdge = Math.min(width, height, MAX_SHORT_EDGE);
    if (!shortEdge || shortEdge <= 0) return [];
    return VIDEO_PROXY_HEIGHTS.filter((proxyHeight) => proxyHeight < shortEdge);
}

/** Smaller H.264 copy with `shortEdge` px on the short side (landscape or portrait). */
export function createVideoProxy(inputPath: string, outputPath: string, shortEdge: number, onProgress?: VideoProgressCallback, durationSec?: number): Promise<void> {
    return run(
        ffmpeg(inputPath)
            .videoFilters(`scale=w='if(gte(iw,ih),-2,${shortEdge})':h='if(gte(iw,ih),${shortEdge},-2)'`)
            .outputOptions([
                '-map 0:v:0',
                '-map 0:a:0?',
                '-c:v libx264',
                '-preset veryfast',
                `-crf ${shortEdge >= 720 ? 24 : 26}`,
                '-pix_fmt yuv420p',
                '-profile:v main',
                '-c:a aac',
                '-b:a 96k',
                '-movflags +faststart',
            ]),
        outputPath,
        onProgress,
        durationSec,
    );
}
