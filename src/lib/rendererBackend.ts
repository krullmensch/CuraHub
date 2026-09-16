import * as THREE from 'three';

// Render backend selection. WebGPU (three.js WebGPURenderer) is the primary renderer; browsers
// without a usable WebGPU adapter get the classic WebGLRenderer, NOT WebGPURenderer's WebGL2
// backend (less mature, and Gaussian splats then need the CPU sort path). Everything WebGPU-only
// (three/webgpu, TSL, the splat addon) lives in ./webgpuSupport and is loaded only on that path.

export type RendererBackend = 'webgpu' | 'webgl';
export type RendererBackendSetting = 'auto' | RendererBackend;

/** The renderer R3F hands out as `state.gl`: a WebGLRenderer, or a WebGPURenderer typed as one. */
export type AnyRenderer = THREE.WebGLRenderer;

const STORAGE_KEY = 'curahub-renderer';

/**
 * Canvas `shadows` prop. R3F's default (false) also sets PCFSoftShadowMap, which WebGPURenderer
 * no longer has (it warns on every render) and WebGLRenderer deprecates. CuraHub casts no shadows.
 */
export const CANVAS_SHADOWS = { enabled: false, type: THREE.PCFShadowMap };

export function isRendererBackendSetting(value: unknown): value is RendererBackendSetting {
    return value === 'auto' || value === 'webgpu' || value === 'webgl';
}

/** `?renderer=webgl|webgpu` wins over the stored choice (handy for comparing both on one device). */
export function readRendererBackendSetting(): RendererBackendSetting {
    try {
        const fromUrl = new URLSearchParams(window.location.search).get('renderer');
        if (isRendererBackendSetting(fromUrl)) return fromUrl;
        const stored = localStorage.getItem(STORAGE_KEY);
        return isRendererBackendSetting(stored) ? stored : 'auto';
    } catch {
        return 'auto';
    }
}

export function storeRendererBackendSetting(setting: RendererBackendSetting): void {
    try {
        if (setting === 'auto') localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, setting);
    } catch {
        // Blocked storage: the choice just isn't remembered.
    }
}

interface GPUDeviceLike {
    destroy(): void;
}
interface GPUAdapterLike {
    features: Iterable<string>;
    info?: { isFallbackAdapter?: boolean };
    requestDevice(descriptor?: { requiredFeatures?: string[] }): Promise<GPUDeviceLike>;
}
interface NavigatorWithGPU extends Navigator {
    gpu?: { requestAdapter(options?: { powerPreference?: 'high-performance' | 'low-power'; featureLevel?: string }): Promise<GPUAdapterLike | null> };
}

type WebGPUSupport = typeof import('./webgpuSupport');

/**
 * What a Canvas renders with, decided and set up before the Canvas mounts: for WebGPU the helper
 * module and a GPU device. R3F's `gl` factory then resolves without waiting for the GPU — R3F
 * re-runs its async configure() on every Canvas render and, after awaiting a slow factory, works
 * on a stale store snapshot (it created a second, never sized camera with aspect 0: black canvas).
 */
export type PreparedRenderer =
    | { backend: 'webgl' }
    | { backend: 'webgpu'; support: WebGPUSupport; device: GPUDeviceLike };

/** Picks the backend and, for WebGPU, creates the device. Never rejects — anything failing means WebGL. */
export async function prepareRenderer(setting: RendererBackendSetting = readRendererBackendSetting()): Promise<PreparedRenderer> {
    const gpu = (navigator as NavigatorWithGPU).gpu;
    if (setting === 'webgl' || !gpu) return { backend: 'webgl' };
    try {
        // Same adapter/device request as three's WebGPUBackend.init() (compatibility adapter, all features).
        const [support, adapter] = await Promise.all([
            import('./webgpuSupport'),
            gpu.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' }),
        ]);
        // Software adapters (SwiftShader etc.) are slower than WebGL on the same machine.
        if (!adapter || adapter.info?.isFallbackAdapter) return { backend: 'webgl' };
        const device = await adapter.requestDevice({ requiredFeatures: [...adapter.features] });
        return { backend: 'webgpu', support, device };
    } catch (err) {
        console.warn('WebGPU nicht verfügbar, verwende WebGL:', err);
        return { backend: 'webgl' };
    }
}

/** Frees a prepared WebGPU device that never got a renderer (Canvas unmounted before). */
export function releasePreparedRenderer(prepared: PreparedRenderer): void {
    if (prepared.backend === 'webgpu') prepared.device.destroy();
}

let activeBackend: RendererBackend | null = null;

/** Backend of the most recently created scene renderer (null before the first Canvas). */
export function getActiveRendererBackend(): RendererBackend | null {
    return activeBackend;
}

/** Where createRendererFactory keeps the WebGPU helpers (on the renderer, so it survives HMR). */
const WEBGPU_SUPPORT = Symbol.for('curahub.webgpuSupport');

/**
 * The WebGPU-only helpers for a WebGPURenderer, synchronously. They are loaded before the
 * renderer is created, so they always exist when `isWebGPURenderer(gl)` is true.
 */
export function getWebGPUSupport(gl: AnyRenderer): WebGPUSupport {
    const support = (gl as unknown as Record<symbol, WebGPUSupport | undefined>)[WEBGPU_SUPPORT];
    if (!support) throw new Error('WebGPU-Unterstützung ist nicht geladen');
    return support;
}

export interface RendererOptions {
    antialias: boolean;
    toneMappingExposure?: number;
}

/** The part of R3F's default renderer props used here (R3F always passes its <canvas>). */
interface DefaultGLProps {
    canvas: unknown;
}

/**
 * R3F `gl` factory for a prepared backend: the WebGPURenderer on the prepared device, otherwise
 * (or when its initialisation fails) the classic WebGLRenderer. R3F sets tone mapping and output
 * colour space on whatever this returns.
 */
export function createRendererFactory(prepared: PreparedRenderer, { antialias, toneMappingExposure = 1 }: RendererOptions) {
    let created: Promise<AnyRenderer> | null = null;
    return (defaults: DefaultGLProps): Promise<AnyRenderer> => {
        // One renderer per factory, even if R3F asks again before the first call resolved.
        created ??= (async () => {
            const canvas = defaults.canvas as HTMLCanvasElement;
            let renderer: AnyRenderer | null = null;

            if (prepared.backend === 'webgpu') {
                try {
                    renderer = await prepared.support.createWebGPURenderer(canvas, antialias, prepared.device);
                    (renderer as unknown as Record<symbol, WebGPUSupport>)[WEBGPU_SUPPORT] = prepared.support;
                    activeBackend = 'webgpu';
                } catch (err) {
                    console.warn('WebGPU konnte nicht gestartet werden, verwende WebGL:', err);
                }
            }

            if (!renderer) {
                renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });
                activeBackend = 'webgl';
            }

            renderer.toneMappingExposure = toneMappingExposure;
            return renderer;
        })();
        return created;
    };
}

export function isWebGPURenderer(gl: unknown): boolean {
    return !!gl && (gl as { isWebGPURenderer?: boolean }).isWebGPURenderer === true;
}

/** Largest 2D texture edge the renderer's device supports. */
export function getMaxTextureSize(gl: AnyRenderer): number {
    if (isWebGPURenderer(gl)) {
        const device = (gl as unknown as { backend?: { device?: { limits?: { maxTextureDimension2D?: number } } } }).backend?.device;
        return device?.limits?.maxTextureDimension2D ?? 8192;
    }
    return gl.capabilities.maxTextureSize;
}

export function getMaxAnisotropy(gl: AnyRenderer): number {
    // WebGLRenderer.capabilities vs. Renderer.getMaxAnisotropy() on WebGPURenderer.
    if (isWebGPURenderer(gl)) return (gl as unknown as { getMaxAnisotropy(): number }).getMaxAnisotropy();
    return gl.capabilities.getMaxAnisotropy();
}

/**
 * Calls `onRestored` after the GPU resources were lost and the renderer can draw again
 * (WebGL context restore). WebGPU has no restore — a lost device needs a reload, so this only
 * logs it there.
 */
export function onRendererContextRestored(gl: AnyRenderer, onRestored: () => void): () => void {
    if (isWebGPURenderer(gl)) {
        const renderer = gl as unknown as { onDeviceLost: (info: { message?: string }) => void };
        const previous = renderer.onDeviceLost;
        renderer.onDeviceLost = (info) => {
            console.error('WebGPU-Gerät verloren. Bitte Seite neu laden.', info?.message ?? '');
        };
        return () => {
            renderer.onDeviceLost = previous;
        };
    }
    const canvas = gl.domElement;
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => canvas.removeEventListener('webglcontextrestored', onRestored);
}
