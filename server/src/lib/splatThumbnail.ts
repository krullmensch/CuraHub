import path from 'path';
import sharp from 'sharp';
import {
    decodeColor,
    decodeScale,
    readPositionComponent,
    type SpzSplats,
} from './spz';

// Asset-browser thumbnails for Gaussian splats. There is no GPU on the server, so the capture is
// rasterised on the CPU: the splats are sorted back to front and composited as round Gaussians.
// That is not the renderer's elliptical projection, but at 512 px it looks like the capture —
// enough to tell two scans apart in the sidebar, which the old "sparkles" icon never did.

/** Splats drawn at most; a capture with more is sampled evenly. */
const MAX_THUMBNAIL_SPLATS = 400_000;
const RENDER_SIZE = 512;
/** Half of the vertical field of view, matching the editor's perspective camera closely enough. */
const FOV = (35 * Math.PI) / 180;
/** Viewing direction: slightly from the right and above, like the editor's default orbit. */
const AZIMUTH = (35 * Math.PI) / 180;
const ELEVATION = (18 * Math.PI) / 180;
const FRAME_LOW = 0.01;
const FRAME_HIGH = 0.99;
/** Splats below this opacity contribute nothing visible but cost the same. */
const MIN_ALPHA = 6 / 255;

interface Bounds {
    center: [number, number, number];
    radius: number;
}

/** Robust (1–99 %) bounds of the splat centers, like the client's computeSplatFrame. */
function robustBounds(centers: Float32Array, count: number): Bounds {
    const axes = [new Float32Array(count), new Float32Array(count), new Float32Array(count)];
    for (let i = 0; i < count; i++) {
        axes[0][i] = centers[i * 3];
        axes[1][i] = centers[i * 3 + 1];
        axes[2][i] = centers[i * 3 + 2];
    }
    const center: [number, number, number] = [0, 0, 0];
    let radius = 0;
    for (let axis = 0; axis < 3; axis++) {
        axes[axis].sort();
        const low = axes[axis][Math.round(FRAME_LOW * (count - 1))];
        const high = axes[axis][Math.round(FRAME_HIGH * (count - 1))];
        center[axis] = (low + high) / 2;
        radius = Math.max(radius, (high - low) / 2);
    }
    return { center, radius: Math.max(radius, 1e-3) };
}

/**
 * Renders `splats` into a straight (non-premultiplied) RGBA buffer of RENDER_SIZE². The capture is
 * turned upright first (SPLAT_UP_FLIP on the client: x, -y, -z), so the thumbnail shows what the
 * editor shows.
 */
export function rasterizeSplats(splats: SpzSplats, size = RENDER_SIZE): Buffer {
    const step = Math.max(1, Math.ceil(splats.count / MAX_THUMBNAIL_SPLATS));
    const drawn = Math.ceil(splats.count / step);
    const centers = new Float32Array(drawn * 3);
    const radii = new Float32Array(drawn);
    const alphas = new Float32Array(drawn);
    const colors = new Uint8Array(drawn * 3);

    let n = 0;
    for (let i = 0; i < splats.count && n < drawn; i += step, n++) {
        centers[n * 3] = readPositionComponent(splats.positions, i * 9, splats.fractionalBits);
        centers[n * 3 + 1] = -readPositionComponent(splats.positions, i * 9 + 3, splats.fractionalBits);
        centers[n * 3 + 2] = -readPositionComponent(splats.positions, i * 9 + 6, splats.fractionalBits);
        // A round splat of the mean of the two larger axes reads like the ellipse the GPU draws.
        const scales = [
            decodeScale(splats.scales[i * 3]),
            decodeScale(splats.scales[i * 3 + 1]),
            decodeScale(splats.scales[i * 3 + 2]),
        ].sort((a, b) => b - a);
        radii[n] = (scales[0] + scales[1]) / 2;
        alphas[n] = splats.alphas[i] / 255;
        colors[n * 3] = decodeColor(splats.colors[i * 3]);
        colors[n * 3 + 1] = decodeColor(splats.colors[i * 3 + 1]);
        colors[n * 3 + 2] = decodeColor(splats.colors[i * 3 + 2]);
    }

    const bounds = robustBounds(centers, n);
    const focal = size / 2 / Math.tan(FOV / 2);
    const distance = (bounds.radius * 1.35) / Math.tan(FOV / 2) + bounds.radius;

    // Right-handed view basis looking from the orbit position at the bounds center.
    const dirX = Math.cos(ELEVATION) * Math.sin(AZIMUTH);
    const dirY = Math.sin(ELEVATION);
    const dirZ = Math.cos(ELEVATION) * Math.cos(AZIMUTH);
    const eye = [
        bounds.center[0] + dirX * distance,
        bounds.center[1] + dirY * distance,
        bounds.center[2] + dirZ * distance,
    ];
    // forward = normalize(center - eye) = -dir; right = normalize(cross(forward, worldUp)); up = cross(right, forward)
    const forward = [-dirX, -dirY, -dirZ];
    const rightLength = Math.hypot(forward[2], -forward[0]) || 1;
    const right = [forward[2] / rightLength, 0, -forward[0] / rightLength];
    const up = [
        right[1] * forward[2] - right[2] * forward[1],
        right[2] * forward[0] - right[0] * forward[2],
        right[0] * forward[1] - right[1] * forward[0],
    ];

    const viewX = new Float32Array(n);
    const viewY = new Float32Array(n);
    const viewZ = new Float32Array(n);
    const order: number[] = [];
    for (let i = 0; i < n; i++) {
        const dx = centers[i * 3] - eye[0];
        const dy = centers[i * 3 + 1] - eye[1];
        const dz = centers[i * 3 + 2] - eye[2];
        const z = dx * forward[0] + dy * forward[1] + dz * forward[2];
        if (z <= 1e-3 || alphas[i] < MIN_ALPHA) continue;
        viewX[i] = dx * right[0] + dy * right[1] + dz * right[2];
        viewY[i] = dx * up[0] + dy * up[1] + dz * up[2];
        viewZ[i] = z;
        order.push(i);
    }
    order.sort((a, b) => viewZ[b] - viewZ[a]); // painter's algorithm: far splats first

    const pixels = new Float32Array(size * size * 4);
    for (const i of order) {
        const z = viewZ[i];
        const px = size / 2 + (viewX[i] * focal) / z;
        const py = size / 2 - (viewY[i] * focal) / z;
        const screenRadius = Math.min((radii[i] * focal) / z, size / 6);
        if (screenRadius < 0.35) continue;
        const sigma = screenRadius / 1.5;
        const twoSigmaSquared = 2 * sigma * sigma;
        const extent = Math.ceil(screenRadius * 1.5);
        const minX = Math.max(0, Math.floor(px - extent));
        const maxX = Math.min(size - 1, Math.ceil(px + extent));
        const minY = Math.max(0, Math.floor(py - extent));
        const maxY = Math.min(size - 1, Math.ceil(py + extent));
        const r = colors[i * 3];
        const g = colors[i * 3 + 1];
        const b = colors[i * 3 + 2];
        const alpha = alphas[i];
        for (let y = minY; y <= maxY; y++) {
            const dy = y + 0.5 - py;
            for (let x = minX; x <= maxX; x++) {
                const dx = x + 0.5 - px;
                const weight = alpha * Math.exp(-(dx * dx + dy * dy) / twoSigmaSquared);
                if (weight < 0.002) continue;
                const offset = (y * size + x) * 4;
                const keep = 1 - weight;
                pixels[offset] = pixels[offset] * keep + r * weight;
                pixels[offset + 1] = pixels[offset + 1] * keep + g * weight;
                pixels[offset + 2] = pixels[offset + 2] * keep + b * weight;
                pixels[offset + 3] = pixels[offset + 3] * keep + weight;
            }
        }
    }

    const out = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        const coverage = pixels[i * 4 + 3];
        if (coverage <= 0.002) continue;
        // The colour accumulator is already coverage-weighted; undo it for straight alpha.
        out[i * 4] = Math.min(255, Math.round(pixels[i * 4] / coverage));
        out[i * 4 + 1] = Math.min(255, Math.round(pixels[i * 4 + 1] / coverage));
        out[i * 4 + 2] = Math.min(255, Math.round(pixels[i * 4 + 2] / coverage));
        out[i * 4 + 3] = Math.min(255, Math.round(coverage * 255));
    }
    return out;
}

/**
 * Writes the `-thumb-512.webp` / `-thumb-256.webp` pair next to `storedFilePath` (the same naming
 * the image pipeline uses, see ./thumbnails) and returns the public path of the 512 variant.
 * Best effort: a capture that cannot be rasterised must not fail the upload.
 */
export async function trySplatThumbnails(
    splats: SpzSplats,
    storedFilePath: string,
    uploadsPublicPrefix = '/uploads',
): Promise<string | null> {
    try {
        const started = Date.now();
        const raw = rasterizeSplats(splats);
        const directory = path.dirname(storedFilePath);
        const stem = path.basename(storedFilePath, path.extname(storedFilePath));
        const image = sharp(raw, { raw: { width: RENDER_SIZE, height: RENDER_SIZE, channels: 4 } });
        const path512 = path.join(directory, `${stem}-thumb-512.webp`);
        const path256 = path.join(directory, `${stem}-thumb-256.webp`);
        await image.clone().webp({ quality: 80 }).toFile(path512);
        await image.clone().resize(256, 256).webp({ quality: 80 }).toFile(path256);
        console.log(`[Splat] Thumbnail gerendert in ${Date.now() - started} ms (${splats.count} Splats)`);
        return `${uploadsPublicPrefix}/${path.basename(path512)}`;
    } catch (err) {
        console.warn('[Splat] Thumbnail konnte nicht gerendert werden:', (err as Error).message);
        return null;
    }
}
