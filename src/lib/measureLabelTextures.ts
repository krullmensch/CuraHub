import * as THREE from 'three';

/**
 * Pill-shaped text labels for the wall measures in 3D, drawn once per text + colour into a canvas.
 * Textures are redrawn (and replaced) once the label font has loaded; listeners then rebuild.
 */

export interface LabelStyle {
    background: string;
    color: string;
}

export interface LabelTexture {
    texture: THREE.CanvasTexture;
    /** Size on screen in CSS pixels. */
    width: number;
    height: number;
}

const FONT = '600 12px "Albert Sans", system-ui, sans-serif';
const HEIGHT = 20;
const PAD_X = 7;
const RADIUS = 5;
// Drawn at twice the on-screen size so labels stay sharp on HiDPI screens.
const RESOLUTION = 2;

interface Entry extends LabelTexture {
    text: string;
    style: LabelStyle;
    canvas: HTMLCanvasElement;
}

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let fontRequested = false;

/** Draws the pill into `canvas` (resizing it) and returns its width in CSS pixels. */
function draw(canvas: HTMLCanvasElement, text: string, style: LabelStyle): number {
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = FONT;
    const width = Math.ceil(ctx.measureText(text).width + PAD_X * 2);
    canvas.width = width * RESOLUTION;
    canvas.height = HEIGHT * RESOLUTION;
    // Resizing the canvas resets the context state.
    ctx.scale(RESOLUTION, RESOLUTION);
    ctx.fillStyle = style.background;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, HEIGHT, RADIUS);
    ctx.fill();
    ctx.font = FONT;
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, HEIGHT / 2 + 0.5);
    return width;
}

function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
}

// Sprites switch to the new textures on their next React render, not synchronously.
const RETIRE_DELAY_MS = 1000;

function redrawAll(): void {
    const retired: THREE.CanvasTexture[] = [];
    for (const entry of cache.values()) {
        entry.width = draw(entry.canvas, entry.text, entry.style);
        // A new texture: WebGPU textures cannot change size after creation.
        retired.push(entry.texture);
        entry.texture = makeTexture(entry.canvas);
    }
    listeners.forEach((listener) => listener());
    window.setTimeout(() => retired.forEach((texture) => texture.dispose()), RETIRE_DELAY_MS);
}

function requestFont(): void {
    if (fontRequested || typeof document === 'undefined' || !document.fonts) return;
    fontRequested = true;
    document.fonts.load(FONT).then(redrawAll, () => {});
}

export function getLabelTexture(text: string, style: LabelStyle): LabelTexture {
    const key = `${style.background}|${style.color}|${text}`;
    let entry = cache.get(key);
    if (!entry) {
        requestFont();
        const canvas = document.createElement('canvas');
        const width = draw(canvas, text, style);
        entry = { text, style, canvas, width, height: HEIGHT, texture: makeTexture(canvas) };
        cache.set(key, entry);
    }
    return entry;
}

export function onLabelTexturesChanged(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
