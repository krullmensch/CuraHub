// RND-11: render quality presets + hardware detection.
//
// The effective preset is either chosen manually (persisted in localStorage) or detected
// once per page load from the GPU renderer string, device memory, core count and
// MAX_TEXTURE_SIZE. Detection creates a throw-away WebGL2 context, so it only runs when a
// 3D page (editor/viewer) first asks for the quality — never on the home or login page.

export type RenderQuality = 'low' | 'medium' | 'high';
export type RenderQualitySetting = 'auto' | RenderQuality;

export interface RenderQualitySettings {
    /** Canvas device pixel ratio range [min, max]. */
    dpr: [number, number];
    /** WebGL context antialiasing. Only read when the Canvas is created. */
    antialias: boolean;
    /** Largest texture edge (px) used for artwork images. */
    maxTextureDim: number;
    /** Estimated GPU memory budget for artwork textures, in bytes. */
    textureBudgetBytes: number;
    anisotropy: number;
    /** Render photographs unlit with MeshBasicMaterial instead of MeshStandardMaterial. */
    basicMaterials: boolean;
    /** Keep the two ceiling RectAreaLights of the room model. */
    rectAreaLights: boolean;
    /** FPV artwork-info raycast frequency. */
    raycastHz: number;
    /** Main-thread time per frame spent uploading decoded textures to the GPU. */
    uploadBudgetMs: number;
    /** Parallel artwork texture downloads/decodes. */
    maxConcurrentLoads: number;
}

const MB = 1024 * 1024;

export const RENDER_QUALITY_SETTINGS: Record<RenderQuality, RenderQualitySettings> = {
    low: {
        dpr: [1, 1],
        antialias: false,
        maxTextureDim: 1024,
        textureBudgetBytes: 300 * MB,
        anisotropy: 1,
        basicMaterials: true,
        rectAreaLights: false,
        raycastHz: 5,
        uploadBudgetMs: 4,
        maxConcurrentLoads: 2,
    },
    medium: {
        dpr: [1, 1.5],
        antialias: true,
        maxTextureDim: 2048,
        textureBudgetBytes: 600 * MB,
        anisotropy: 4,
        basicMaterials: true,
        rectAreaLights: true,
        raycastHz: 10,
        uploadBudgetMs: 6,
        maxConcurrentLoads: 4,
    },
    high: {
        dpr: [1, 2],
        antialias: true,
        maxTextureDim: 4096,
        textureBudgetBytes: 800 * MB,
        anisotropy: 4,
        basicMaterials: false,
        rectAreaLights: true,
        raycastHz: 15,
        uploadBudgetMs: 8,
        maxConcurrentLoads: 4,
    },
};

export const RENDER_QUALITY_LABELS: Record<RenderQuality, string> = {
    low: 'Niedrig',
    medium: 'Mittel',
    high: 'Hoch',
};

const STORAGE_KEY = 'curahub-render-quality';

export function isRenderQualitySetting(value: unknown): value is RenderQualitySetting {
    return value === 'auto' || value === 'low' || value === 'medium' || value === 'high';
}

export function readStoredRenderQualitySetting(): RenderQualitySetting {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return isRenderQualitySetting(stored) ? stored : 'auto';
    } catch {
        return 'auto';
    }
}

export function storeRenderQualitySetting(setting: RenderQualitySetting): void {
    try {
        localStorage.setItem(STORAGE_KEY, setting);
    } catch {
        // Private mode / blocked storage: the choice just isn't remembered.
    }
}

let detectedQuality: RenderQuality | null = null;

/** Hardware heuristic, cached for the lifetime of the page. */
export function getDetectedRenderQuality(): RenderQuality {
    if (detectedQuality === null) detectedQuality = detectRenderQuality();
    return detectedQuality;
}

export function resolveRenderQuality(setting: RenderQualitySetting): RenderQuality {
    return setting === 'auto' ? getDetectedRenderQuality() : setting;
}

function detectRenderQuality(): RenderQuality {
    try {
        const nav = navigator as Navigator & { deviceMemory?: number };
        const memory = nav.deviceMemory;
        const cores = navigator.hardwareConcurrency || 4;
        const ua = navigator.userAgent;
        // iPadOS reports a desktop Safari UA but has touch points.
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return 'low';
        const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = String(
            debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        ).toLowerCase();
        gl.getExtension('WEBGL_lose_context')?.loseContext();

        if (/swiftshader|llvmpipe|software|basic render/.test(renderer)) return 'low';
        if (isMobile || maxTextureSize < 8192 || (memory !== undefined && memory <= 4) || cores <= 4) return 'low';

        if (/intel/.test(renderer)) {
            // Iris Xe and Arc are usable mid-range GPUs; UHD/HD/Iris Plus are the weak iGPUs
            // this preset system exists for.
            return /arc|iris.*xe/.test(renderer) ? 'medium' : 'low';
        }
        if (/mali|adreno|powervr|vivante/.test(renderer)) return 'low';
        // Apple Silicon (ANGLE Metal: "Apple M1/M2/…", Safari: "Apple GPU").
        if (/apple/.test(renderer)) return 'high';
        // AMD APUs report "AMD Radeon(TM) Graphics" / "Vega" without a model number.
        if (/radeon\(tm\) graphics|radeon graphics|vega/.test(renderer)) return 'medium';
        if (/nvidia|geforce|rtx|gtx|quadro|radeon|amd/.test(renderer)) {
            return memory !== undefined && memory < 8 ? 'medium' : 'high';
        }
        return 'medium';
    } catch {
        return 'medium';
    }
}
