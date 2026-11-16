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
    /**
     * Only in first person: the orbit editor draws helpers that write no depth (gizmo, measures,
     * drag ghosts) and would get the AO of the wall behind them.
     */
    firstPerson: boolean;
    wallEditorOpen: boolean;
    exportMode: boolean;
    mobilePlanner: boolean;
}): boolean {
    if (!input.webgpu || !input.firstPerson || input.wallEditorOpen || input.exportMode || input.mobilePlanner) return false;
    return input.override ?? input.qualityEnabled;
}

/**
 * Resolution of the AO passes relative to the drawing buffer. The AO is soft, so on high-density
 * displays its passes run at CSS resolution: at pixel ratio 2 that is a quarter of the pixels
 * (2026-11-16: with full-density AO about 17 % of the frames missed 60 fps on a Retina Mac).
 */
export function aoPassScales(pixelRatio: number, resolutionScale: number): { depth: number; ao: number } {
    const depth = 1 / Math.max(1, pixelRatio);
    return { depth, ao: depth * resolutionScale };
}

/**
 * `userData` for materials the room AO must leave alone: artwork photos and videos, which keep
 * their real colours (the wall and frame around them still darken). Not-tone-mapped materials are
 * left out anyway.
 */
export const NO_ROOM_AO = { noRoomAo: true } as const;

export function isRoomAoExcluded(material: { userData: Record<string, unknown> }): boolean {
    return material.userData.noRoomAo === true;
}
