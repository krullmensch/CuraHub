import fs from 'fs';
import zlib from 'zlib';
import { promisify } from 'util';

// SPZ (Niantic) is the format every uploaded Gaussian splat is converted to: ~10x smaller than a
// raw INRIA PLY and readable by both render backends as they are (three.js' SPZLoader on WebGPU,
// Spark on WebGL). This module is the format itself — the byte layout, the quantisation and the
// file reader/writer.
//
// The encoders below are the exact inverses of three.js r186 `SPZLoader`/`GaussianSplatPLYLoader`
// (node_modules/three/examples/jsm), so a converted file renders like the source PLY would have.

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const MAGIC = 0x5053474e; // "NGSP"
const HEADER_BYTES = 16;
const VERSION = 2;

/** 1/4096 m ≈ 0.24 mm per step, and ±2048 m of range in the 24 bit fixed point positions. */
export const SPZ_FRACTIONAL_BITS = 12;

/** Coefficient vectors (of three channels each) stored per SH degree. */
export const SH_VECTORS_PER_DEGREE = [0, 3, 8, 15];

/** three.js' SH_C0 — the DC basis function. */
export const SH_C0 = 0.2820947917738781;
/** SPZ stores the DC term pre-scaled: byte = (f_dc * 0.15 + 0.5) * 255 (see SPZLoader's COLOR_LUT). */
const SPZ_COLOR_FACTOR = 0.15;

const INT24_MIN = -(1 << 23);
const INT24_MAX = (1 << 23) - 1;

/**
 * Splats in SPZ's own quantised layout. Readers fill these arrays directly instead of building
 * float arrays first: at 64 bytes per splat a two-million-splat capture stays around 130 MB.
 */
export interface SpzSplats {
    count: number;
    /** 0–3; SH bands above the source's degree are simply absent. */
    shDegree: number;
    fractionalBits: number;
    /** count * 9 — three signed 24 bit fixed point components per splat. */
    positions: Uint8Array;
    /** count — opacity after the sigmoid. */
    alphas: Uint8Array;
    /** count * 3 */
    colors: Uint8Array;
    /** count * 3 — log scales. */
    scales: Uint8Array;
    /** count * 3 — quaternion x/y/z, w implied (>= 0). */
    rotations: Uint8Array;
    /** count * SH_VECTORS_PER_DEGREE[shDegree] * 3 */
    sh: Uint8Array;
}

export function allocSpzSplats(count: number, shDegree: number, fractionalBits = SPZ_FRACTIONAL_BITS): SpzSplats {
    return {
        count,
        shDegree,
        fractionalBits,
        positions: new Uint8Array(count * 9),
        alphas: new Uint8Array(count),
        colors: new Uint8Array(count * 3),
        scales: new Uint8Array(count * 3),
        rotations: new Uint8Array(count * 3),
        sh: new Uint8Array(count * SH_VECTORS_PER_DEGREE[shDegree] * 3),
    };
}

const clampByte = (value: number) => (value < 0 ? 0 : value > 255 ? 255 : Math.round(value));

/** Writes one position component as signed 24 bit fixed point. */
export function writePositionComponent(target: Uint8Array, offset: number, value: number, fractionalBits: number): void {
    let fixed = Math.round(value * (1 << fractionalBits));
    if (fixed < INT24_MIN) fixed = INT24_MIN;
    else if (fixed > INT24_MAX) fixed = INT24_MAX;
    target[offset] = fixed & 0xff;
    target[offset + 1] = (fixed >> 8) & 0xff;
    target[offset + 2] = (fixed >> 16) & 0xff;
}

export function readPositionComponent(source: Uint8Array, offset: number, fractionalBits: number): number {
    // Shift up and arithmetic-shift back down to sign-extend the 24 bit value.
    const fixed = ((source[offset] << 8) | (source[offset + 1] << 16) | (source[offset + 2] << 24)) >> 8;
    return fixed / (1 << fractionalBits);
}

/** `logScale` is the PLY's `scale_n` (the logarithm), not the scale itself. */
export const encodeScale = (logScale: number) => clampByte((logScale + 10) * 16);
export const decodeScale = (byte: number) => Math.exp(byte / 16 - 10);

/** `dc` is a spherical harmonics DC coefficient (PLY `f_dc_n`). */
export const encodeColor = (dc: number) => clampByte((dc * SPZ_COLOR_FACTOR + 0.5) * 255);
/** The rendered colour of a DC byte, 0–255 (three's COLOR_LUT). */
export const decodeColor = (byte: number) => clampByte(((byte / 255 - 0.5) * (SH_C0 / SPZ_COLOR_FACTOR) + 0.5) * 255);

export const encodeOpacity = (alpha01: number) => clampByte(alpha01 * 255);
export const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

/** SH coefficients are stored as `value * 128 + 128`, like every three.js splat loader does. */
export const encodeShCoefficient = (value: number) => clampByte(value * 128 + 128);
export const decodeShCoefficient = (byte: number) => (byte - 128) / 128;

/**
 * Normalises the quaternion, flips it into the w >= 0 hemisphere (SPZ v2 implies w) and writes
 * x/y/z as bytes.
 */
export function writeQuaternion(target: Uint8Array, offset: number, x: number, y: number, z: number, w: number): void {
    const length = Math.hypot(x, y, z, w) || 1;
    const sign = w < 0 ? -1 : 1;
    const s = sign / length;
    target[offset] = clampByte((x * s + 1) * 127.5);
    target[offset + 1] = clampByte((y * s + 1) * 127.5);
    target[offset + 2] = clampByte((z * s + 1) * 127.5);
}

export function readQuaternion(source: Uint8Array, offset: number, out: [number, number, number, number]): void {
    const x = source[offset] / 127.5 - 1;
    const y = source[offset + 1] / 127.5 - 1;
    const z = source[offset + 2] / 127.5 - 1;
    out[0] = x;
    out[1] = y;
    out[2] = z;
    out[3] = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
}

function sectionSizes(count: number, shDegree: number) {
    return {
        positions: count * 9,
        alphas: count,
        colors: count * 3,
        scales: count * 3,
        rotations: count * 3,
        sh: count * SH_VECTORS_PER_DEGREE[shDegree] * 3,
    };
}

/** The raw (ungzipped) SPZ v2 bytes of `splats`. */
export function encodeSpz(splats: SpzSplats): Buffer {
    const sizes = sectionSizes(splats.count, splats.shDegree);
    const total = HEADER_BYTES + sizes.positions + sizes.alphas + sizes.colors + sizes.scales + sizes.rotations + sizes.sh;
    const out = Buffer.alloc(total);
    out.writeUInt32LE(MAGIC, 0);
    out.writeUInt32LE(VERSION, 4);
    out.writeUInt32LE(splats.count, 8);
    out.writeUInt8(splats.shDegree, 12);
    out.writeUInt8(splats.fractionalBits, 13);
    out.writeUInt8(0, 14); // flags
    out.writeUInt8(0, 15); // reserved

    let offset = HEADER_BYTES;
    for (const section of [splats.positions, splats.alphas, splats.colors, splats.scales, splats.rotations, splats.sh]) {
        out.set(section, offset);
        offset += section.length;
    }
    return out;
}

/** Writes `splats` as a gzipped `.spz` file and returns the file size in bytes. */
export async function writeSpzFile(splats: SpzSplats, filePath: string): Promise<number> {
    // Level 6: the payload is quantised noise, level 9 costs multiples of the time for ~1 %.
    const compressed = await gzip(encodeSpz(splats), { level: 6 });
    await fs.promises.writeFile(filePath, compressed);
    return compressed.length;
}

/** Parses raw SPZ bytes (version 1–3; v3's packed rotations are converted to v2's x/y/z). */
export function decodeSpz(bytes: Buffer): SpzSplats {
    if (bytes.length < HEADER_BYTES) throw new Error('SPZ-Datei ist zu kurz');
    if (bytes.readUInt32LE(0) !== MAGIC) throw new Error('Keine gültige SPZ-Datei');
    const version = bytes.readUInt32LE(4);
    if (version < 1 || version > 3) throw new Error(`SPZ-Version ${version} wird nicht unterstützt`);
    const count = bytes.readUInt32LE(8);
    const storedShDegree = bytes.readUInt8(12);
    if (storedShDegree > 3) throw new Error(`SPZ mit SH-Grad ${storedShDegree} wird nicht unterstützt`);
    const fractionalBits = bytes.readUInt8(13);
    const flags = bytes.readUInt8(14);

    const positionsSize = count * 3 * (version === 1 ? 2 : 3);
    const rotationsSize = count * (version === 3 ? 4 : 3);
    const shSize = count * SH_VECTORS_PER_DEGREE[storedShDegree] * 3;
    const lodSize = (flags & 0x80) !== 0 ? count * 6 : 0;
    const expected = HEADER_BYTES + positionsSize + count + count * 3 + count * 3 + rotationsSize + shSize + lodSize;
    if (bytes.length !== expected) throw new Error('SPZ-Datei hat eine unerwartete Länge');

    let offset = HEADER_BYTES;
    const take = (length: number) => {
        const view = bytes.subarray(offset, offset + length);
        offset += length;
        return new Uint8Array(view);
    };
    const rawPositions = take(positionsSize);
    const alphas = take(count);
    const colors = take(count * 3);
    const scales = take(count * 3);
    const rawRotations = take(rotationsSize);
    const sh = take(shSize);

    const splats = allocSpzSplats(0, storedShDegree, version === 1 ? SPZ_FRACTIONAL_BITS : fractionalBits);
    splats.count = count;
    splats.alphas = alphas;
    splats.colors = colors;
    splats.scales = scales;
    splats.sh = sh;
    splats.positions = version === 1 ? halfFloatPositionsToFixed(rawPositions, count) : rawPositions;
    splats.rotations = version === 3 ? packedRotationsToXyz(rawRotations, count) : rawRotations;
    return splats;
}

/** Reads a `.spz` file (gzipped, as written by every producer). */
export async function readSpzFile(filePath: string): Promise<SpzSplats> {
    const compressed = await fs.promises.readFile(filePath);
    const raw = compressed[0] === 0x1f && compressed[1] === 0x8b ? await gunzip(compressed) : compressed;
    return decodeSpz(raw);
}

function fromHalfFloat(bits: number): number {
    const exponent = (bits & 0x7c00) >> 10;
    const fraction = bits & 0x03ff;
    const sign = (bits >> 15) !== 0 ? -1 : 1;
    if (exponent === 0) return sign * 6.103515625e-5 * (fraction / 1024);
    if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
    return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}

function halfFloatPositionsToFixed(source: Uint8Array, count: number): Uint8Array {
    const out = new Uint8Array(count * 9);
    for (let i = 0; i < count * 3; i++) {
        const value = fromHalfFloat(source[i * 2] | (source[i * 2 + 1] << 8));
        writePositionComponent(out, i * 3, value, SPZ_FRACTIONAL_BITS);
    }
    return out;
}

/** SPZ v3 packs the three smallest quaternion components into 32 bits; v2 stores x/y/z. */
function packedRotationsToXyz(source: Uint8Array, count: number): Uint8Array {
    const out = new Uint8Array(count * 3);
    const quaternion: [number, number, number, number] = [0, 0, 0, 0];
    for (let i = 0; i < count; i++) {
        const packed =
            (source[i * 4] | (source[i * 4 + 1] << 8) | (source[i * 4 + 2] << 16) | (source[i * 4 + 3] << 24)) >>> 0;
        const largest = packed >>> 30;
        const component = (bits: number) => {
            const value = Math.SQRT1_2 * ((bits & 511) / 511);
            return (bits & 512) !== 0 ? -value : value;
        };
        const a = component(packed & 1023);
        const b = component((packed >>> 10) & 1023);
        const c = component((packed >>> 20) & 1023);
        quaternion[0] = quaternion[1] = quaternion[2] = quaternion[3] = 0;
        const targets = [0, 1, 2, 3].filter((index) => index !== largest);
        quaternion[targets[0]] = c;
        quaternion[targets[1]] = b;
        quaternion[targets[2]] = a;
        quaternion[largest] = Math.sqrt(Math.max(0, 1 - (a * a + b * b + c * c)));
        writeQuaternion(out, i * 3, quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
    }
    return out;
}
