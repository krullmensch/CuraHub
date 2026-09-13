import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

/**
 * LOAD-04: generates the 256px and 512px WebP thumbnail variants for an
 * already-processed (webp) image asset file.
 *
 * Naming convention: for a stored file `<stem>.webp`, the variants are
 * `<stem>-thumb-256.webp` and `<stem>-thumb-512.webp`. Callers should store
 * the 512 variant's public path in `Asset.thumbnailPath`; the 256 variant is
 * derived from it by convention (see `derive256FromThumbnailPath`).
 */

export interface ThumbnailResult {
    /** Absolute filesystem path to the 256px variant. */
    path256: string;
    /** Absolute filesystem path to the 512px variant. */
    path512: string;
}

/**
 * Generate 256px and 512px WebP thumbnails next to `sourcePath`.
 * `sourcePath` should be the full-size stored image (already a webp, but any
 * sharp-readable format works). Returns the absolute paths on disk.
 *
 * Never throws for "normal" failures — callers decide whether a failed
 * thumbnail should block the upload (it must not, per LOAD-04 requirements).
 * Only pass invalid arguments will throw synchronously before any I/O.
 */
export async function generateImageThumbnails(sourcePath: string): Promise<ThumbnailResult> {
    const dir = path.dirname(sourcePath);
    const ext = path.extname(sourcePath); // e.g. ".webp"
    const stem = path.basename(sourcePath, ext);

    const path256 = path.join(dir, `${stem}-thumb-256.webp`);
    const path512 = path.join(dir, `${stem}-thumb-512.webp`);

    await sharp(sourcePath)
        .rotate() // respect EXIF orientation
        .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 70 })
        .toFile(path256);

    await sharp(sourcePath)
        .rotate()
        .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 70 })
        .toFile(path512);

    return { path256, path512 };
}

/**
 * Given the public `/uploads/...` path of the 512 thumbnail (as stored in
 * `Asset.thumbnailPath`), derive the public path of the 256 thumbnail by
 * naming convention. Returns null if `thumbnailPath` doesn't match the
 * expected `-thumb-512.webp` suffix (e.g. a video poster path).
 */
export function derive256FromThumbnailPath(thumbnailPath: string): string | null {
    const suffix = '-thumb-512.webp';
    if (!thumbnailPath.endsWith(suffix)) return null;
    return thumbnailPath.slice(0, -suffix.length) + '-thumb-256.webp';
}

/**
 * Best-effort thumbnail generation for the upload pipeline: never throws.
 * Returns the public `/uploads/<file>` path for the 512 variant (to store in
 * `Asset.thumbnailPath`), or null if generation failed.
 *
 * `absoluteImagePath` is the full-size image already on disk (uploadDir).
 * `uploadsPublicPrefix` defaults to `/uploads`.
 */
export async function tryGenerateImageThumbnails(
    absoluteImagePath: string,
    uploadsPublicPrefix = '/uploads',
): Promise<string | null> {
    try {
        const { path512 } = await generateImageThumbnails(absoluteImagePath);
        return `${uploadsPublicPrefix}/${path.basename(path512)}`;
    } catch (err) {
        console.warn('[Thumbnails] Generation failed, continuing without thumbnails:', (err as Error).message);
        return null;
    }
}

/** True if the given absolute path exists on disk. */
export function fileExists(p: string): boolean {
    return fs.existsSync(p);
}
