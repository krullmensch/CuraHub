import * as THREE from 'three';
import { CubeRenderTarget, MeshBasicNodeMaterial, MeshStandardNodeMaterial, RectAreaLightNode, RenderPipeline, WebGPURenderer, type Node } from 'three/webgpu';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js';
import {
    abs, cameraPosition, clamp, distance, dot, float, fract, fwidth, getNormalFromDepth, luminance, materialColor, max, min, mix,
    modelPosition, normalView, output, pass, pmremTexture, sample, screenUV, positionViewDirection, positionWorld, pow, reflectVector, smoothstep, sRGBTransferEOTF,
    texture, toneMapping, toneMappingExposure, uniform, vec3, vec4,
} from 'three/tsl';
import { RectAreaLightTexturesLib } from 'three/examples/jsm/lights/RectAreaLightTexturesLib.js';
import { GaussianSplat } from 'three/examples/jsm/objects/GaussianSplat.js';
import type { SplatAttributeData, SplatParseRequest, SplatParseResponse } from '../workers/splatParse.worker';
import type { SplatFrame, SplatHandle } from './splats';
import { aoPassScales, isRoomAoExcluded, type AmbientOcclusionOptions } from './ambientOcclusion';

// WebGPU-only code, loaded on demand by ./rendererBackend once WebGPU is chosen. The WebGL
// fallback never downloads three/webgpu, TSL or the splat addon.

type WebGPUDevice = NonNullable<ConstructorParameters<typeof WebGPURenderer>[0]>['device'];

/** `device` comes from rendererBackend.prepareRenderer, so init() doesn't wait for the GPU. */
export async function createWebGPURenderer(canvas: HTMLCanvasElement, antialias: boolean, device: unknown): Promise<THREE.WebGLRenderer> {
    const renderer = new WebGPURenderer({ canvas, antialias, powerPreference: 'high-performance', device: device as WebGPUDevice });
    // No silent switch to WebGPURenderer's WebGL2 backend: when WebGPU fails, init() throws and
    // rendererBackend falls back to the classic WebGLRenderer.
    (renderer as unknown as { _getFallback: null })._getFallback = null;
    await renderer.init();
    RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
    enablePerMaterialToneMapping(renderer);
    // R3F types its renderer as WebGLRenderer; everything CuraHub calls on it exists on both.
    return renderer as unknown as THREE.WebGLRenderer;
}

// ── Tone mapping per material ────────────────────────────────────────────────

/**
 * WebGPURenderer tone-maps the whole frame in its output pass and ignores `material.toneMapped`.
 * CuraHub relies on that flag: artwork photos, videos and the street view are shown with their
 * real colours, only the lit room gets ACES. So the renderer's own tone mapping stays off (R3F's
 * setting is kept for the materials) and every converted material with `toneMapped: true` tone-maps
 * its own output. Unlike WebGLRenderer this also applies inside render targets (the window glass
 * reflection capture), which only makes that reflection a little flatter.
 */
function enablePerMaterialToneMapping(renderer: WebGPURenderer): void {
    let sceneToneMapping: THREE.ToneMapping = renderer.toneMapping;
    Object.defineProperty(renderer, 'toneMapping', {
        configurable: true,
        get: () => THREE.NoToneMapping,
        // RenderPipeline.render() sets toneMapping to NoToneMapping and restores what it read (also
        // NoToneMapping, from the getter above). Without this guard the scene tone mapping would be
        // off for good after the first post-processed frame (room AO: ceiling clipped to white).
        set: (value: THREE.ToneMapping) => { if (pipelineRenders === 0) sceneToneMapping = value; },
    });

    const library = renderer.library;
    const fromMaterial = library.fromMaterial.bind(library);
    library.fromMaterial = (material) => {
        const nodeMaterial = fromMaterial(material);
        if (nodeMaterial && !(material as { isNodeMaterial?: boolean }).isNodeMaterial && material.toneMapped) {
            // Room AO (createAmbientOcclusionPipeline) only on opaque room surfaces, not on artworks.
            const roomAo = !material.transparent && !isRoomAoExcluded(material);
            const setupOutput = nodeMaterial.setupOutput.bind(nodeMaterial);
            nodeMaterial.setupOutput = (builder, outputNode) => {
                const color = applySceneToneMapping(setupOutput(builder, outputNode) as Node<'vec4'>, sceneToneMapping);
                return roomAo ? applyRoomAmbientOcclusion(color) : color;
            };
        }
        return nodeMaterial;
    };
    webGPUSceneToneMapping.get = () => sceneToneMapping;
}

/** > 0 while a RenderPipeline renders (see enablePerMaterialToneMapping). */
let pipelineRenders = 0;

const webGPUSceneToneMapping = { get: (): THREE.ToneMapping => THREE.ACESFilmicToneMapping };

function applySceneToneMapping(color: Node<'vec4'>, mapping: THREE.ToneMapping = webGPUSceneToneMapping.get()): Node<'vec4'> {
    if (mapping === THREE.NoToneMapping) return color;
    // ToneMappingNode reads .rgb/.a of its input itself, so it gets the whole vec4.
    return vec4((toneMapping(mapping, toneMappingExposure, color) as unknown as Node<'vec4'>).rgb, color.a);
}

// ── Room: tinted window glass ────────────────────────────────────────────────

/**
 * WebGPU version of Satellit's clear window glass (the WebGL one patches the shader with
 * onBeforeCompile). Same idea: grey-green tint, dirt from the modelled glass texture's alpha, a
 * reflection of the room that gets stronger at grazing angles.
 */
export function createClearGlassMaterial(modelledGlass: THREE.MeshStandardMaterial, reflectionSize: number) {
    const reflection = new CubeRenderTarget(reflectionSize, { type: THREE.HalfFloatType });
    reflection.texture.needsPMREMUpdate = true;

    const material = new MeshStandardNodeMaterial({
        color: '#6f837f',
        metalness: 0,
        roughness: 0.12,
        map: modelledGlass.map,
        roughnessMap: modelledGlass.roughnessMap,
        normalMap: modelledGlass.normalMap,
        normalScale: modelledGlass.normalScale.clone().multiplyScalar(0.3),
        envMap: reflection.texture,
        // Matches the WebGL version's envMapIntensity (3); a lower value looked visually
        // duller here in side-by-side testing, so it stays at parity rather than "matched down".
        envMapIntensity: 3,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
    });

    const dirt = modelledGlass.map ? smoothstep(0.51, 0.6, texture(modelledGlass.map).a) : float(0);
    const facing = abs(dot(normalView, positionViewDirection));
    // The GLSL version reads the lighting's diffuse/specular split, which TSL's output doesn't
    // expose. Irradiance ≈ lit colour / albedo; reflection ≈ the room capture × Fresnel × intensity.
    // Capped: the lit colour also holds the (bright) reflection, which the GLSL version leaves out.
    const irradiance = min(output.rgb.div(max(materialColor.rgb, vec3(0.01))), vec3(1));
    const fresnel = float(0.04).add(float(0.96).mul(pow(float(1).sub(facing), 5)));
    const reflectionAmount = clamp(luminance(pmremTexture(reflection.texture, reflectVector, float(0.12)).rgb).mul(3).mul(fresnel), 0, 1);
    // Dust scatters the room light: lighter, warm grey wherever the pane is dirty.
    const rgb = mix(output.rgb, vec3(0.62, 0.6, 0.55).mul(irradiance), dirt.mul(0.35));
    const alpha = float(0.2).add(dirt.mul(0.13)).add(reflectionAmount.mul(0.7));
    // A custom outputNode skips setupOutput, so the scene tone mapping is added here.
    material.outputNode = applySceneToneMapping(vec4(rgb, clamp(mix(alpha, 0.8, pow(float(1).sub(facing), 5)), 0, 0.92)));

    return { material: material as unknown as THREE.MeshStandardMaterial, reflection: reflection as unknown as THREE.WebGLCubeRenderTarget };
}

// ── Editor grid ──────────────────────────────────────────────────────────────

export interface GridMaterialOptions {
    cellSize: number;
    sectionSize: number;
    cellThickness: number;
    sectionThickness: number;
    cellColor: THREE.ColorRepresentation;
    sectionColor: THREE.ColorRepresentation;
    fadeDistance: number;
    fadeStrength: number;
}

/** TSL port of drei's <Grid> shader (drei's is a GLSL ShaderMaterial, which WebGPURenderer can't draw). */
export function createGridMaterial(options: GridMaterialOptions): THREE.Material {
    const lines = (size: number, thickness: number) => {
        const r = positionWorld.xz.div(size);
        const grid = abs(fract(r.sub(0.5)).sub(0.5)).div(fwidth(r));
        return float(1).sub(min(min(grid.x, grid.y).add(1).sub(thickness), 1));
    };
    const cell = lines(options.cellSize, options.cellThickness);
    const section = lines(options.sectionSize, options.sectionThickness);

    // Fade around the camera projected onto the grid plane.
    const fade = float(1).sub(min(distance(vec3(cameraPosition.x, modelPosition.y, cameraPosition.z), positionWorld).div(options.fadeDistance), 1));
    const alpha = cell.add(section).mul(pow(fade, options.fadeStrength));

    const material = new MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide });
    material.colorNode = mix(
        uniform(new THREE.Color(options.cellColor)),
        uniform(new THREE.Color(options.sectionColor)),
        min(1, section.mul(options.sectionThickness)),
    );
    material.opacityNode = mix(alpha.mul(0.75), alpha, section);
    material.alphaTest = 0.001;
    const setupOutput = material.setupOutput.bind(material);
    material.setupOutput = (builder, outputNode) => applySceneToneMapping(setupOutput(builder, outputNode) as Node<'vec4'>);
    return material as unknown as THREE.Material;
}

// ── Gaussian splats ──────────────────────────────────────────────────────────

interface GeometryEntry {
    promise: Promise<{ geometry: THREE.BufferGeometry; frame: SplatFrame }>;
    refs: number;
    releaseTimer: number | null;
}

/** Parsed geometry stays cached this long after its last instance unmounted (undo, StrictMode, re-entering). */
const UNUSED_GEOMETRY_TTL_MS = 30_000;
const geometries = new Map<string, GeometryEntry>();

let worker: Worker | null = null;
let nextReqId = 0;
const pending = new Map<number, { resolve: (value: { geometry: THREE.BufferGeometry; frame: SplatFrame }) => void; reject: (err: Error) => void }>();

function getWorker(): Worker {
    if (!worker) {
        worker = new Worker(new URL('../workers/splatParse.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<SplatParseResponse>) => {
            const message = event.data;
            const request = pending.get(message.reqId);
            if (!request || message.type === 'progress') return;
            pending.delete(message.reqId);
            if (message.type === 'error') request.reject(new Error(message.message));
            else request.resolve({ geometry: buildGeometry(message.attributes), frame: message.frame });
        };
        worker.onerror = (event) => {
            for (const request of pending.values()) request.reject(new Error(event.message || 'Splat-Worker abgestürzt'));
            pending.clear();
            worker?.terminate();
            worker = null;
        };
    }
    return worker;
}

function buildGeometry(attributes: SplatAttributeData[]): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    for (const { name, array, itemSize, normalized } of attributes) {
        geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize, normalized));
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

function acquireGeometry(url: string) {
    let entry = geometries.get(url);
    if (!entry) {
        const reqId = nextReqId++;
        const promise = new Promise<{ geometry: THREE.BufferGeometry; frame: SplatFrame }>((resolve, reject) => {
            pending.set(reqId, { resolve, reject });
            getWorker().postMessage({ reqId, url } satisfies SplatParseRequest);
        });
        entry = { promise, refs: 0, releaseTimer: null };
        geometries.set(url, entry);
        promise.catch(() => geometries.delete(url));
    }
    entry.refs++;
    if (entry.releaseTimer !== null) {
        window.clearTimeout(entry.releaseTimer);
        entry.releaseTimer = null;
    }
    const current = entry;
    let released = false;
    return {
        promise: current.promise,
        release() {
            if (released) return;
            released = true;
            current.refs--;
            if (current.refs > 0) return;
            current.releaseTimer = window.setTimeout(() => {
                if (geometries.get(url) === current && current.refs === 0) geometries.delete(url);
            }, UNUSED_GEOMETRY_TTL_MS);
        },
    };
}

export async function loadGaussianSplat(url: string): Promise<SplatHandle> {
    const lease = acquireGeometry(url);
    try {
        const { geometry, frame } = await lease.promise;
        const splat = new GaussianSplat(geometry);
        // Splat colors are display-referred (sRGB) photo colors: undo the renderer's linear → sRGB
        // output conversion. Not a converted material, so no scene tone mapping (like Spark on WebGL).
        const color = splat.material.colorNode as Node<'vec4'>;
        splat.material.colorNode = vec4(sRGBTransferEOTF(color.rgb) as Node<'vec3'>, color.a);
        return {
            object: splat,
            frame,
            dispose() {
                // Frees the storage buffers the splat's render object uses; the parsed source
                // geometry stays cached for other instances of the same asset.
                splat.geometry.dispose();
                splat.material.dispose();
                lease.release();
            },
        };
    } catch (err) {
        lease.release();
        throw err;
    }
}

// ── Room ambient occlusion (GTAO) ────────────────────────────────────────────

/**
 * The room AO of the current frame, sampled in screen space by every converted, tone-mapped,
 * opaque material (see enablePerMaterialToneMapping). Active only during the AO frame's main
 * render, so other renders (glass reflection capture, shader warmup) never see it.
 */
const roomAoMap = texture(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
const roomAoActive = uniform(0);

function applyRoomAmbientOcclusion(color: Node<'vec4'>): Node<'vec4'> {
    const occlusion = mix(float(1), roomAoMap.sample(screenUV).r, roomAoActive);
    return vec4(color.rgb.mul(occlusion), color.a);
}

export interface AmbientOcclusionPipeline {
    /** Renders the AO texture and then the frame (replaces R3F's own render call). */
    render(): void;
    dispose(): void;
}

/**
 * Soft corner darkening (spec docs/superpowers/specs/2026-11-16-raum-ao-design.md), in two steps:
 * 1. AO texture: a non-multisampled depth-only pass of the opaque scene (GTAO cannot read
 *    multisampled depth), normals reconstructed from it, GTAO at `resolutionScale` and a depth-aware
 *    denoise. Depth and AO run at CSS resolution on high-density displays (`aoPassScales`). The
 *    result, mix(1, ao, strength), goes into a small render target.
 * 2. The frame: the scene renders straight to the canvas as without AO (MSAA, no full-size
 *    intermediate target); converted materials multiply their output by the AO texture. Photos and
 *    videos are left out by their material (`NO_ROOM_AO`, or not tone-mapped).
 */
export function createAmbientOcclusionPipeline(
    gl: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: AmbientOcclusionOptions,
): AmbientOcclusionPipeline {
    const renderer = gl as unknown as WebGPURenderer;

    const depthPass = pass(scene, camera, { samples: 0 });
    // Depth only: opaque objects with a cheap double-sided material (room walls are seen from inside).
    // Transparent ones (glass, splats, sprites) write no depth in the frame either.
    depthPass.transparent = false;
    depthPass.overrideMaterial = new MeshBasicNodeMaterial({ colorWrite: false, side: THREE.DoubleSide });
    const depth = depthPass.getTextureNode('depth');
    const projectionInverse = uniform(camera.projectionMatrixInverse);
    const normal = sample((uv) => getNormalFromDepth(uv, depth.value as unknown as Node, projectionInverse));

    const aoPass = ao(depth, normal, camera);
    aoPass.radius.value = options.radius;
    aoPass.samples.value = options.samples;
    const denoised = denoise(aoPass.getTextureNode(), depth, normal, camera);
    const occlusion = mix(float(1), (denoised as unknown as Node<'vec4'>).r, float(options.strength));

    const aoPipeline = new RenderPipeline(renderer, vec4(occlusion, occlusion, occlusion, 1));
    aoPipeline.outputColorTransform = false; // linear occlusion values, not a displayed colour
    const aoTarget = new THREE.RenderTarget(1, 1, { depthBuffer: false });
    const size = new THREE.Vector2();

    return {
        render() {
            const scales = aoPassScales(renderer.getPixelRatio(), options.resolutionScale);
            if (depthPass.getResolutionScale() !== scales.depth) depthPass.setResolutionScale(scales.depth);
            aoPass.resolutionScale = scales.ao;
            renderer.getDrawingBufferSize(size);
            const width = Math.max(1, Math.round(size.x * scales.depth));
            const height = Math.max(1, Math.round(size.y * scales.depth));
            if (aoTarget.width !== width || aoTarget.height !== height) aoTarget.setSize(width, height);

            const previousTarget = renderer.getRenderTarget();
            renderer.setRenderTarget(aoTarget);
            pipelineRenders++;
            try {
                aoPipeline.render();
            } finally {
                pipelineRenders--;
                renderer.setRenderTarget(previousTarget);
            }

            roomAoMap.value = aoTarget.texture;
            roomAoActive.value = 1;
            try {
                renderer.render(scene, camera);
            } finally {
                roomAoActive.value = 0;
            }
        },
        dispose() {
            aoPipeline.dispose();
            aoTarget.dispose();
            denoised.dispose();
            aoPass.dispose();
            depthPass.overrideMaterial?.dispose();
            depthPass.dispose();
        },
    };
}
