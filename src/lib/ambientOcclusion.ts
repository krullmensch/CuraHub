/**
 * Room ambient occlusion (GTAO post pass, WebGPU only): when it runs and with which values.
 * The pipeline itself lives in webgpuSupport.ts, the component in components/RoomAmbientOcclusion.tsx.
 * Spec: docs/superpowers/specs/2026-11-16-raum-ao-design.md
 */

export interface AmbientOcclusionOptions {
    /** World-space sampling radius in metres (0.6 left grainy halos around the ceiling trusses). */
    radius: number;
    /** 0 = no darkening, 1 = full GTAO value. */
    strength: number;
    /** Resolution of the AO passes relative to the canvas. */
    resolutionScale: number;
    samples: number;
}

export const AO_DEFAULTS: AmbientOcclusionOptions = {
    radius: 0.3,
    strength: 1,
    resolutionScale: 0.5,
    samples: 16,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * `?ao=1|0` switches AO on/off regardless of the preset (for comparisons, no UI);
 * `aoRadius`, `aoStrength`, `aoScale`, `aoSamples` override the values.
 */
export function readAmbientOcclusionOverride(search: string): {
    enabled: boolean | null;
    options: AmbientOcclusionOptions;
} {
    const params = new URLSearchParams(search);
    const ao = params.get('ao');
    const num = (key: string, fallback: number) => {
        const raw = params.get(key);
        const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
        return Number.isFinite(value) ? value : fallback;
    };
    return {
        enabled: ao === '1' ? true : ao === '0' ? false : null,
        options: {
            radius: num('aoRadius', AO_DEFAULTS.radius),
            strength: num('aoStrength', AO_DEFAULTS.strength),
            resolutionScale: clamp(num('aoScale', AO_DEFAULTS.resolutionScale), 0.25, 1),
            samples: Math.round(clamp(num('aoSamples', AO_DEFAULTS.samples), 4, 32)),
        },
    };
}

export function shouldRunAmbientOcclusion(input: {
    /** RenderQualitySettings.ambientOcclusion of the active preset. */
    qualityEnabled: boolean;
    webgpu: boolean;
    /** From `?ao=`; null = follow the preset. */
    override: boolean | null;
    wallEditorOpen: boolean;
    exportMode: boolean;
    mobilePlanner: boolean;
}): boolean {
    if (!input.webgpu || input.wallEditorOpen || input.exportMode || input.mobilePlanner) return false;
    return input.override ?? input.qualityEnabled;
}
