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

function run(command: ffmpeg.FfmpegCommand, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        command
            .output(outputPath)
            .on('end', () => resolve())
            .on('error', (err: Error) => reject(err))
            .run();
    });
}

/** Stream copy with the moov atom moved to the front (playback starts before full download). */
export function remuxForWeb(inputPath: string, outputPath: string): Promise<void> {
    return run(
        ffmpeg(inputPath).outputOptions(['-map 0:v:0', '-map 0:a:0?', '-c copy', '-movflags +faststart']),
        outputPath,
    );
}

export function transcodeForWeb(inputPath: string, outputPath: string): Promise<void> {
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
    );
}

/** Writes a browser-safe MP4 to `outputPath`. `probe` may be null if ffprobe failed. */
export async function makeWebVideo(inputPath: string, outputPath: string, probe: VideoProbe | null): Promise<'remux' | 'transcode'> {
    if (probe && isWebCompatible(probe)) {
        try {
            await remuxForWeb(inputPath, outputPath);
            return 'remux';
        } catch (err) {
            console.warn('[Video] Remux failed, transcoding instead:', err);
        }
    }
    await transcodeForWeb(inputPath, outputPath);
    return 'transcode';
}
