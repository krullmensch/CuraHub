import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ArtworkTextureManager } from './artworkTextureManager';
import { RENDER_QUALITY_SETTINGS } from './renderQuality';

// Export mode (AR export page): straight to the top tier, thumbnail only as a fallback.

interface FakeBitmap { width: number; height: number; close: () => void; url?: string }

const NATURAL = { width: 3000, height: 2000 };
let failing: Set<string>;
let fetched: string[];
let bitmaps: FakeBitmap[];

beforeEach(() => {
    failing = new Set();
    fetched = [];
    bitmaps = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        fetched.push(url);
        const ok = !failing.has(url);
        return { ok, status: ok ? 200 : 404, blob: async () => ({ url }) };
    }));
    vi.stubGlobal('createImageBitmap', vi.fn(async (source: { url?: string; width?: number }, options?: { resizeWidth?: number; resizeHeight?: number }) => {
        const bitmap: FakeBitmap = options?.resizeWidth
            ? { width: options.resizeWidth, height: options.resizeHeight ?? 1, close: vi.fn() }
            : { ...NATURAL, close: vi.fn(), url: source.url };
        bitmaps.push(bitmap);
        return bitmap;
    }));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const flush = async () => {
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

function setup() {
    const manager = new ArtworkTextureManager({ topTierOnly: true });
    manager.configure(
        { ...RENDER_QUALITY_SETTINGS.high, maxTextureDim: 2048, textureBudgetBytes: Infinity },
        8192,
        () => {},
    );
    const camera = new THREE.PerspectiveCamera();
    const gl = { initTexture: vi.fn(), domElement: { height: 800 } as HTMLCanvasElement };
    let now = 0;
    const tick = async () => {
        now += 1000;
        manager.tick(camera, gl as unknown as Pick<THREE.WebGLRenderer, 'initTexture' | 'domElement'>, now);
        await flush();
        manager.tick(camera, gl as unknown as Pick<THREE.WebGLRenderer, 'initTexture' | 'domElement'>, now + 1);
    };
    const add = (id: number, path: string, thumbnailPath: string | null) => {
        const material = new THREE.MeshBasicMaterial();
        manager.register(id, { path, thumbnailPath, pixelWidth: 3000, pixelHeight: 2000, sizeM: 1, forceMax: false }, null, material);
        return material;
    };
    return { manager, gl, tick, add };
}

describe('ArtworkTextureManager, export mode', () => {
    it('loads the top tier straight away, keeps the image for the exporters and uploads nothing', async () => {
        const { manager, gl, tick, add } = setup();
        const material = add(1, '/a.jpg', '/a-thumb.webp');
        expect(manager.exportProgress).toEqual({ settled: 0, total: 1 });

        await tick();

        expect(fetched).toEqual(['/a.jpg']);
        const texture = material.map!;
        expect(texture).not.toBe(manager.placeholder);
        expect((texture.image as FakeBitmap).width).toBe(2048);
        expect(texture.flipY).toBe(true);
        expect(texture.repeat.toArray()).toEqual([1, 1]);
        expect(texture.userData.mimeType).toBe('image/jpeg');
        expect((texture.image as FakeBitmap).close).not.toHaveBeenCalled();
        expect(gl.initTexture).not.toHaveBeenCalled();
        expect(manager.exportProgress).toEqual({ settled: 1, total: 1 });
        expect(manager.exportFailedIds).toEqual([]);
    });

    it('falls back to the thumbnail when the top tier fails', async () => {
        const { manager, tick, add } = setup();
        failing.add('/b.jpg');
        const material = add(2, '/b.jpg', '/b-thumb.webp');

        await tick();
        expect(manager.exportPendingIds).toEqual([2]);
        await tick();

        expect(fetched).toEqual(['/b.jpg', '/b-thumb.webp']);
        expect(material.map).not.toBe(manager.placeholder);
        expect(manager.exportProgress).toEqual({ settled: 1, total: 1 });
        expect(manager.exportFailedIds).toEqual([]);
    });

    it('counts a work as failed (and settled) once every source failed', async () => {
        const { manager, tick, add } = setup();
        failing.add('/c.jpg');
        failing.add('/c-thumb.webp');
        add(3, '/c.jpg', '/c-thumb.webp');
        add(4, '/d.jpg', null);
        failing.add('/d.jpg');

        await tick();
        await tick();
        await tick();

        expect(manager.exportFailedIds).toEqual([3, 4]);
        expect(manager.exportPendingIds).toEqual([]);
        expect(manager.exportProgress).toEqual({ settled: 2, total: 2 });
    });
});
