import * as THREE from 'three';
import type { RenderQualitySettings } from './renderQuality';

// LOAD-05 / LOAD-07: level-of-detail texture loading for artwork images.
//
// Previously every artwork used drei's useTexture(asset.path): the full-size image was
// decoded on the main thread and all ~70 textures were uploaded to the GPU in the same
// frame (3.5 s frozen first frame, ≈1.7 GB estimated texture memory for "Yol").
//
// Now each artwork registers here and gets a texture sized to what it actually covers on
// screen:
// - Tier 0 = the server's 512 px thumbnail, tiers 1–3 = the original resized to 1024/2048/
//   full, capped by the render preset.
// - Images are fetched and decoded off the main thread with createImageBitmap.
// - Decoded textures are uploaded with renderer.initTexture() under a per-frame time budget.
// - An estimated GPU memory budget per preset downgrades the least visible artworks first.
// - Materials always carry a map (a 1×1 placeholder until the first tier arrives), so
//   swapping textures never forces a shader recompile.

const TIER_SIZES = [512, 1024, 2048, 4096];
const MAX_TIER = TIER_SIZES.length - 1;
const EVAL_INTERVAL_MS = 250;
const UNUSED_TEXTURE_TTL_MS = 10_000;
/** Thumbnails are ~20 KB — they get their own slots so full-size downloads can't starve them. */
const THUMBNAIL_CONCURRENCY = 8;
/** Keep a higher tier until the artwork needs this many times fewer pixels. */
const DOWNGRADE_FACTOR = 2;

/** The renderer parts the manager uses — present on WebGLRenderer and WebGPURenderer. */
type RendererLike = Pick<THREE.WebGLRenderer, 'initTexture' | 'domElement'>;

export type ArtworkMaterial = THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;

export interface ArtworkTextureSource {
    path: string;
    thumbnailPath: string | null;
    /** Pixel size stored in the DB (original upload, used for the aspect ratio only). */
    pixelWidth: number;
    pixelHeight: number;
    /** Largest visible edge of the artwork in meters. */
    sizeM: number;
    /** Always use the highest allowed tier (e.g. the selected artwork in the editor). */
    forceMax: boolean;
}

interface Entry extends ArtworkTextureSource {
    id: number;
    object: THREE.Object3D | null;
    material: ArtworkMaterial | null;
    currentTier: number;
    currentKey: string | null;
    wantedTier: number;
    loadingTier: number;
    loadingKey: string | null;
    projectedPx: number;
    /** Lowered once the natural size of the original is known (no upscaled tiers). */
    maxUsefulTier: number;
    thumbnailFailed: boolean;
    failedKeys: Set<string>;
}

interface CacheItem {
    texture: THREE.Texture;
    bytes: number;
    refs: number;
    releasedAt: number;
}

interface DecodedTexture {
    key: string;
    texture: THREE.Texture;
    bytes: number;
    /** Natural max edge of the source image, null for thumbnails. */
    naturalMax: number | null;
}

function tierFor(px: number, maxTier: number): number {
    for (let i = 0; i < maxTier; i++) {
        if (TIER_SIZES[i] >= px) return i;
    }
    return maxTier;
}

function isAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === 'AbortError';
}

async function decodeArtworkTexture(
    url: string,
    maxDim: number,
    anisotropy: number,
    signal: AbortSignal,
): Promise<{ texture: THREE.Texture; bytes: number; naturalMax: number }> {
    if (typeof createImageBitmap !== 'function') {
        // Very old browsers: main-thread decode via three's loader, no resizing.
        const texture = await new THREE.TextureLoader().loadAsync(url);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = anisotropy;
        const image = texture.image as HTMLImageElement;
        return { texture, bytes: image.width * image.height * 4 * (4 / 3), naturalMax: Math.max(image.width, image.height) };
    }

    const res = await fetch(url, { signal, credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
    const blob = await res.blob();

    // Match three's own upload settings for sRGB images (no premultiply, no colour conversion).
    const options: ImageBitmapOptions = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
    let bitmap = await createImageBitmap(blob, options);
    const naturalMax = Math.max(bitmap.width, bitmap.height);
    if (naturalMax > maxDim) {
        const scale = maxDim / naturalMax;
        const resized = await createImageBitmap(bitmap, {
            ...options,
            resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
            resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
            resizeQuality: 'high',
        });
        bitmap.close();
        bitmap = resized;
    }
    if (signal.aborted) {
        bitmap.close();
        throw new DOMException('Aborted', 'AbortError');
    }

    const texture = new THREE.Texture(bitmap);
    texture.colorSpace = THREE.SRGBColorSpace;
    // WebGL ignores UNPACK_FLIP_Y for ImageBitmaps, and createImageBitmap's
    // `imageOrientation: 'flipY'` is not supported everywhere — flip via the UV transform.
    texture.flipY = false;
    texture.repeat.set(1, -1);
    texture.offset.set(0, 1);
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    const bytes = bitmap.width * bitmap.height * 4 * (4 / 3);
    // The GPU holds the pixels after the upload; free the decoded copy in this process.
    // After a context loss the manager reloads every texture (handleContextRestored).
    texture.onUpdate = () => {
        bitmap.close();
        texture.onUpdate = null;
    };
    return { texture, bytes, naturalMax };
}

export class ArtworkTextureManager {
    private entries = new Map<number, Entry>();
    private cache = new Map<string, CacheItem>();
    private pendingKeys = new Set<string>();
    private ready: DecodedTexture[] = [];
    private queue: number[] = [];
    private controllers = new Set<AbortController>();
    private activeJobs = 0;
    private activeThumbnailJobs = 0;
    private generation = 0;
    private lastEval = -Infinity;
    private evalTimer: ReturnType<typeof setTimeout> | null = null;
    private dirty = true;
    private settings: RenderQualitySettings | null = null;
    private glMaxTextureSize = 4096;
    private invalidate: () => void = () => {};
    private readonly cameraPos = new THREE.Vector3();
    private readonly lastCameraPos = new THREE.Vector3(Infinity, Infinity, Infinity);
    private readonly lastProjection: [number, number] = [NaN, NaN];
    private readonly objectPos = new THREE.Vector3();
    readonly placeholder: THREE.DataTexture;

    constructor() {
        this.placeholder = new THREE.DataTexture(new Uint8Array([232, 232, 232, 255]), 1, 1);
        this.placeholder.colorSpace = THREE.SRGBColorSpace;
        this.placeholder.needsUpdate = true;
    }

    configure(settings: RenderQualitySettings, glMaxTextureSize: number, invalidate: () => void): void {
        const capChanged = this.settings?.maxTextureDim !== settings.maxTextureDim;
        this.settings = settings;
        this.glMaxTextureSize = glMaxTextureSize;
        this.invalidate = invalidate;
        if (capChanged) {
            for (const entry of this.entries.values()) entry.maxUsefulTier = MAX_TIER;
        }
        this.dirty = true;
        invalidate();
    }

    register(id: number, source: ArtworkTextureSource, object: THREE.Object3D | null, material: ArtworkMaterial | null): void {
        this.unregister(id);
        const entry: Entry = {
            ...source,
            id,
            object,
            material,
            currentTier: -1,
            currentKey: null,
            wantedTier: 0,
            loadingTier: -1,
            loadingKey: null,
            projectedPx: 0,
            maxUsefulTier: MAX_TIER,
            thumbnailFailed: false,
            failedKeys: new Set(),
        };
        this.entries.set(id, entry);
        if (material) material.map = this.placeholder;
        this.markDirty();
    }

    update(id: number, patch: Partial<Omit<ArtworkTextureSource, 'path'>>): void {
        const entry = this.entries.get(id);
        if (!entry) return;
        Object.assign(entry, patch);
        this.markDirty();
    }

    bindMaterial(id: number, material: ArtworkMaterial | null): void {
        const entry = this.entries.get(id);
        if (!entry) return;
        entry.material = material;
        if (material) {
            const item = entry.currentKey ? this.cache.get(entry.currentKey) : undefined;
            material.map = item ? item.texture : this.placeholder;
            this.invalidate();
        }
    }

    unregister(id: number): void {
        const entry = this.entries.get(id);
        if (!entry) return;
        if (entry.currentKey) this.release(entry.currentKey);
        this.entries.delete(id);
        this.markDirty();
    }

    /** Call once per rendered frame. */
    tick(camera: THREE.Camera, gl: RendererLike, now: number): void {
        const settings = this.settings;
        if (!settings) return;

        camera.getWorldPosition(this.cameraPos);
        if (this.cameraPos.distanceToSquared(this.lastCameraPos) > 1e-4) {
            this.lastCameraPos.copy(this.cameraPos);
            this.dirty = true;
        }
        // Zooming an orthographic camera (2D wall editor) doesn't move it.
        const projection = (camera as THREE.OrthographicCamera).projectionMatrix;
        if (projection && (projection.elements[0] !== this.lastProjection[0] || projection.elements[5] !== this.lastProjection[1])) {
            this.lastProjection[0] = projection.elements[0];
            this.lastProjection[1] = projection.elements[5];
            this.dirty = true;
        }

        if (this.dirty) {
            if (now - this.lastEval >= EVAL_INTERVAL_MS) {
                this.dirty = false;
                this.lastEval = now;
                this.evaluate(camera, gl.domElement.height, settings, now);
            } else if (this.evalTimer === null) {
                // The camera may stop before the throttle window ends; make sure a frame
                // (and therefore an evaluation) still happens under frameloop="demand".
                this.evalTimer = setTimeout(() => {
                    this.evalTimer = null;
                    this.invalidate();
                }, EVAL_INTERVAL_MS);
            }
        }

        this.processUploads(gl, settings.uploadBudgetMs, now);
        this.pump();
        if (this.ready.length > 0) this.invalidate();
    }

    /** Textures still being fetched, decoded or uploaded. */
    get pendingCount(): number {
        return this.pendingKeys.size;
    }

    /**
     * Artworks that already show a picture (any tier), plus those with nothing left to try
     * (every source failed) — the viewer waits for this before letting the player in.
     */
    get baseProgress(): { settled: number; total: number } {
        let settled = 0;
        for (const entry of this.entries.values()) {
            if (entry.currentTier >= 0 || entry.failedKeys.size > 0) settled++;
        }
        return { settled, total: this.entries.size };
    }

    handleContextRestored(): void {
        this.abortAll();
        for (const item of this.cache.values()) item.texture.dispose();
        this.cache.clear();
        for (const entry of this.entries.values()) {
            entry.currentKey = null;
            entry.currentTier = -1;
            entry.loadingKey = null;
            entry.loadingTier = -1;
            if (entry.material) entry.material.map = this.placeholder;
        }
        this.placeholder.needsUpdate = true;
        this.markDirty();
    }

    /** Frees everything; the manager stays usable (React StrictMode re-runs effects). */
    dispose(): void {
        this.abortAll();
        for (const item of this.cache.values()) item.texture.dispose();
        this.cache.clear();
        this.entries.clear();
        this.queue = [];
        if (this.evalTimer !== null) clearTimeout(this.evalTimer);
        this.evalTimer = null;
    }

    private markDirty(): void {
        this.dirty = true;
        this.invalidate();
    }

    private abortAll(): void {
        this.generation++;
        for (const controller of this.controllers) controller.abort();
        this.controllers.clear();
        for (const item of this.ready) item.texture.dispose();
        this.ready = [];
        this.pendingKeys.clear();
    }

    /** Highest tier; its size is clamped to the preset/GPU cap by maxDimFor(). */
    private capTier(settings: RenderQualitySettings): number {
        return tierFor(Math.min(settings.maxTextureDim, this.glMaxTextureSize), MAX_TIER);
    }

    private maxDimFor(tier: number, settings: RenderQualitySettings): number {
        return Math.min(TIER_SIZES[tier], settings.maxTextureDim, this.glMaxTextureSize);
    }

    private sourceFor(entry: Entry, tier: number, settings: RenderQualitySettings): { url: string; key: string; isThumbnail: boolean } {
        const useThumbnail = tier === 0 && !!entry.thumbnailPath && !entry.thumbnailFailed;
        const url = useThumbnail ? entry.thumbnailPath! : entry.path;
        return { url, key: `${url}#${this.maxDimFor(tier, settings)}`, isThumbnail: useThumbnail };
    }

    private estimateBytes(entry: Entry, tier: number, settings: RenderQualitySettings): number {
        const dim = this.maxDimFor(tier, settings);
        const w = entry.pixelWidth > 0 ? entry.pixelWidth : 1;
        const h = entry.pixelHeight > 0 ? entry.pixelHeight : 1;
        const ratio = Math.min(w, h) / Math.max(w, h);
        return dim * dim * ratio * 4 * (4 / 3);
    }

    private evaluate(camera: THREE.Camera, viewportHeightPx: number, settings: RenderQualitySettings, now: number): void {
        const cap = this.capTier(settings);
        const perspective = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera) : null;
        const focalPx = perspective
            ? (viewportHeightPx * perspective.zoom) / (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2))
            : 0;
        // Orthographic (2D wall editor): the on-screen size doesn't depend on the distance.
        const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera ? (camera as THREE.OrthographicCamera) : null;
        const orthoPxPerM = ortho
            ? (viewportHeightPx * ortho.zoom) / Math.max(1e-6, ortho.top - ortho.bottom)
            : 0;

        let totalBytes = 0;
        for (const entry of this.entries.values()) {
            const maxTier = Math.min(cap, entry.maxUsefulTier);
            if (entry.forceMax) {
                entry.projectedPx = Infinity;
                entry.wantedTier = maxTier;
            } else if (entry.object && ortho) {
                const px = entry.sizeM * orthoPxPerM;
                entry.projectedPx = px;
                let tier = tierFor(px, maxTier);
                if (entry.currentTier > tier) {
                    tier = Math.min(entry.currentTier, tierFor(px * DOWNGRADE_FACTOR, maxTier));
                }
                entry.wantedTier = tier;
            } else if (!entry.object || !perspective) {
                entry.projectedPx = 0;
                entry.wantedTier = Math.min(1, maxTier);
            } else {
                entry.object.getWorldPosition(this.objectPos);
                const distance = Math.max(0.25, this.objectPos.distanceTo(this.cameraPos));
                const px = (entry.sizeM * focalPx) / distance;
                entry.projectedPx = px;
                let tier = tierFor(px, maxTier);
                if (entry.currentTier > tier) {
                    tier = Math.min(entry.currentTier, tierFor(px * DOWNGRADE_FACTOR, maxTier));
                }
                entry.wantedTier = tier;
            }
            totalBytes += this.estimateBytes(entry, entry.wantedTier, settings);
        }

        // Over budget: step down the artworks that need the fewest pixels first.
        if (totalBytes > settings.textureBudgetBytes) {
            const byNeed = [...this.entries.values()].sort((a, b) => a.projectedPx - b.projectedPx);
            let changed = true;
            while (totalBytes > settings.textureBudgetBytes && changed) {
                changed = false;
                for (const entry of byNeed) {
                    if (totalBytes <= settings.textureBudgetBytes) break;
                    if (entry.forceMax || entry.wantedTier === 0) continue;
                    totalBytes -= this.estimateBytes(entry, entry.wantedTier, settings)
                        - this.estimateBytes(entry, entry.wantedTier - 1, settings);
                    entry.wantedTier--;
                    changed = true;
                }
            }
        }

        // Nothing shown yet first, then downgrades (free memory), then upgrades by size on screen.
        this.queue = [...this.entries.values()]
            .filter((e) => e.wantedTier !== e.currentTier)
            .sort((a, b) => {
                const rank = (e: Entry) => (e.currentTier === -1 ? 0 : e.wantedTier < e.currentTier ? 1 : 2);
                return rank(a) - rank(b) || b.projectedPx - a.projectedPx;
            })
            .map((e) => e.id);

        this.collectGarbage(now, settings);
    }

    private pump(): void {
        const settings = this.settings;
        if (!settings) return;
        const waiting: number[] = [];
        for (const id of this.queue) {
            const entry = this.entries.get(id);
            if (!entry || entry.wantedTier === entry.currentTier) continue;
            // Nothing visible yet: show the smallest tier (the thumbnail) first, however big the
            // artwork is on screen — an empty frame is worse than a soft picture, and the viewer
            // waits for all of them before letting the player in. The upgrade follows right after.
            const tier = entry.currentTier === -1 ? 0 : entry.wantedTier;
            if (entry.loadingTier === tier) continue;
            // Let the running load finish instead of switching to a larger, slower download.
            if (entry.currentTier === -1 && entry.loadingKey) continue;
            const { isThumbnail } = this.sourceFor(entry, tier, settings);
            const slotsFull = isThumbnail
                ? this.activeThumbnailJobs >= THUMBNAIL_CONCURRENCY
                : this.activeJobs >= settings.maxConcurrentLoads;
            if (slotsFull) {
                waiting.push(id);
                continue;
            }
            this.request(entry, tier, settings);
        }
        this.queue = waiting;
    }

    private request(entry: Entry, tier: number, settings: RenderQualitySettings): void {
        const { url, key, isThumbnail } = this.sourceFor(entry, tier, settings);
        if (entry.failedKeys.has(key)) return;
        if (this.cache.has(key)) {
            this.apply(entry, key, tier);
            return;
        }
        entry.loadingKey = key;
        entry.loadingTier = tier;
        if (this.pendingKeys.has(key)) return;

        this.pendingKeys.add(key);
        if (isThumbnail) this.activeThumbnailJobs++;
        else this.activeJobs++;
        const generation = this.generation;
        const controller = new AbortController();
        this.controllers.add(controller);

        decodeArtworkTexture(url, this.maxDimFor(tier, settings), settings.anisotropy, controller.signal)
            .then(({ texture, bytes, naturalMax }) => {
                if (generation !== this.generation) {
                    texture.dispose();
                    return;
                }
                this.ready.push({ key, texture, bytes, naturalMax: isThumbnail ? null : naturalMax });
            })
            .catch((err: unknown) => {
                if (generation !== this.generation || isAbortError(err)) return;
                console.warn('[ArtworkTextures] Laden fehlgeschlagen:', url, err);
                this.pendingKeys.delete(key);
                for (const e of this.entries.values()) {
                    if (e.loadingKey !== key) continue;
                    e.loadingKey = null;
                    e.loadingTier = -1;
                    if (isThumbnail) e.thumbnailFailed = true;
                    else e.failedKeys.add(key);
                }
                this.dirty = true;
            })
            .finally(() => {
                this.controllers.delete(controller);
                if (isThumbnail) this.activeThumbnailJobs = Math.max(0, this.activeThumbnailJobs - 1);
                else this.activeJobs = Math.max(0, this.activeJobs - 1);
                this.invalidate();
            });
    }

    private processUploads(gl: RendererLike, budgetMs: number, now: number): void {
        const start = performance.now();
        while (this.ready.length > 0) {
            const item = this.ready.shift()!;
            this.pendingKeys.delete(item.key);
            gl.initTexture(item.texture);
            this.cache.set(item.key, { texture: item.texture, bytes: item.bytes, refs: 0, releasedAt: now });

            for (const entry of this.entries.values()) {
                if (entry.loadingKey !== item.key) continue;
                const tier = entry.loadingTier;
                entry.loadingKey = null;
                entry.loadingTier = -1;
                if (item.naturalMax !== null) {
                    const usefulTier = tierFor(item.naturalMax, MAX_TIER);
                    if (usefulTier < entry.maxUsefulTier) {
                        entry.maxUsefulTier = usefulTier;
                        this.dirty = true;
                    }
                }
                const useful = entry.currentTier === -1
                    || tier === entry.wantedTier
                    || (tier > entry.currentTier && tier <= entry.wantedTier)
                    || (tier < entry.currentTier && tier >= entry.wantedTier);
                if (useful) this.apply(entry, item.key, tier);
                else this.dirty = true;
            }

            if (performance.now() - start >= budgetMs) break;
        }
    }

    private apply(entry: Entry, key: string, tier: number): void {
        const item = this.cache.get(key);
        if (!item) return;
        entry.currentTier = tier;
        // The first tier is always the smallest one (see pump) — queue the upgrade.
        if (tier !== entry.wantedTier) this.dirty = true;
        if (entry.currentKey === key) return;
        item.refs++;
        if (entry.currentKey) this.release(entry.currentKey);
        entry.currentKey = key;
        if (entry.material) entry.material.map = item.texture;
        this.invalidate();
    }

    private release(key: string): void {
        const item = this.cache.get(key);
        if (!item) return;
        item.refs = Math.max(0, item.refs - 1);
        if (item.refs === 0) item.releasedAt = performance.now();
    }

    private collectGarbage(now: number, settings: RenderQualitySettings): void {
        let cachedBytes = 0;
        for (const item of this.cache.values()) cachedBytes += item.bytes;
        const overBudget = cachedBytes > settings.textureBudgetBytes;
        for (const [key, item] of this.cache) {
            if (item.refs > 0) continue;
            if (overBudget || now - item.releasedAt > UNUSED_TEXTURE_TTL_MS) {
                item.texture.dispose();
                this.cache.delete(key);
            }
        }
    }
}
