import fs from 'fs';
import os from 'os';
import path from 'path';
import { zipSync } from 'fflate';
import sharp from 'sharp';
import { readSplatPly, readSplatSog, readSplatSplat } from '../lib/splatReaders';
import { rasterizeSplats } from '../lib/splatThumbnail';
import {
    SH_VECTORS_PER_DEGREE,
    decodeScale,
    decodeSpz,
    encodeSpz,
    readPositionComponent,
    readQuaternion,
    readSpzFile,
    writeSpzFile,
    type SpzSplats,
} from '../lib/spz';

// The encoders in lib/spz are the inverse of three.js r186's SPZLoader. These tests pin both the
// byte layout that loader validates (it rejects a file whose length is off by one) and the values
// that come back out of each reader.

let dir: string;

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curahub-splat-convert-'));
});

afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

interface SourceSplat {
    position: [number, number, number];
    logScale: [number, number, number];
    /** w, x, y, z */
    rotation: [number, number, number, number];
    dc: [number, number, number];
    opacity: number;
}

const SOURCE: SourceSplat[] = [
    { position: [0, 0.5, -1.25], logScale: [-3, -3.5, -4], rotation: [1, 0, 0, 0], dc: [1.2, -0.4, 0.15], opacity: 2.5 },
    { position: [-2.75, 1.125, 3], logScale: [-2, -2.25, -2.5], rotation: [0.7071068, 0.7071068, 0, 0], dc: [-0.8, 0.9, 0.35], opacity: -1 },
    { position: [4.5, -0.25, 0.75], logScale: [-5, -4.75, -6], rotation: [0.5, 0.5, 0.5, 0.5], dc: [0.1, 0.2, 0.3], opacity: 0 },
];

const PLY_PROPERTIES = [
    'x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
    'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3',
];

function writeSplatPly(name: string, splats: SourceSplat[], shDegree = 0): string {
    const vectors = SH_VECTORS_PER_DEGREE[shDegree];
    const rest = Array.from({ length: vectors * 3 }, (_, i) => `f_rest_${i}`);
    const properties = [...PLY_PROPERTIES, ...rest];
    const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${splats.length}\n`
        + properties.map((p) => `property float ${p}\n`).join('')
        + 'end_header\n';
    const body = Buffer.alloc(splats.length * properties.length * 4);
    splats.forEach((splat, index) => {
        const values = [
            ...splat.position, 0, 0, 0, ...splat.dc, splat.opacity, ...splat.logScale, ...splat.rotation,
            // f_rest is channel-major: all coefficients of R, then G, then B.
            ...Array.from({ length: vectors * 3 }, (_, i) => (i % 7) / 10 - 0.3),
        ];
        values.forEach((value, i) => body.writeFloatLE(value, (index * properties.length + i) * 4));
    });
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, Buffer.concat([Buffer.from(header, 'latin1'), body]));
    return filePath;
}

const position = (splats: SpzSplats, index: number, axis: number) =>
    readPositionComponent(splats.positions, index * 9 + axis * 3, splats.fractionalBits);

describe('readSplatPly', () => {
    it('reads positions, scales, rotations, colours and opacity', async () => {
        const splats = await readSplatPly(writeSplatPly('basic.ply', SOURCE));

        expect(splats.count).toBe(SOURCE.length);
        expect(splats.shDegree).toBe(0);
        SOURCE.forEach((source, index) => {
            for (let axis = 0; axis < 3; axis++) {
                // 1/4096 m quantisation
                expect(position(splats, index, axis)).toBeCloseTo(source.position[axis], 3);
                expect(Math.log(decodeScale(splats.scales[index * 3 + axis]))).toBeCloseTo(source.logScale[axis], 1);
            }
            const expectedAlpha = Math.round((1 / (1 + Math.exp(-source.opacity))) * 255);
            expect(splats.alphas[index]).toBe(expectedAlpha);
        });
    });

    it('keeps the quaternion orientation (PLY stores w first)', async () => {
        const splats = await readSplatPly(writeSplatPly('rotation.ply', SOURCE));
        const quaternion: [number, number, number, number] = [0, 0, 0, 0];

        SOURCE.forEach((source, index) => {
            readQuaternion(splats.rotations, index * 3, quaternion);
            const [w, x, y, z] = source.rotation;
            // The w >= 0 hemisphere is implied, so compare the rotation, not the raw signs.
            const sign = w < 0 ? -1 : 1;
            expect(quaternion[0]).toBeCloseTo(x * sign, 1);
            expect(quaternion[1]).toBeCloseTo(y * sign, 1);
            expect(quaternion[2]).toBeCloseTo(z * sign, 1);
            expect(quaternion[3]).toBeCloseTo(Math.abs(w), 1);
        });
    });

    it('reorders spherical harmonics from channel-major to coefficient-major', async () => {
        const splats = await readSplatPly(writeSplatPly('sh.ply', SOURCE, 3), );

        expect(splats.shDegree).toBe(3);
        expect(splats.sh.length).toBe(SOURCE.length * 15 * 3);
        // Source coefficient i (channel-major) = (i % 7) / 10 - 0.3, encoded as value * 128 + 128.
        const expected = (channel: number, coefficient: number) => {
            const sourceIndex = channel * 15 + coefficient;
            return Math.round(((sourceIndex % 7) / 10 - 0.3) * 128 + 128);
        };
        for (let coefficient = 0; coefficient < 15; coefficient++) {
            for (let channel = 0; channel < 3; channel++) {
                expect(splats.sh[coefficient * 3 + channel]).toBe(expected(channel, coefficient));
            }
        }
    });
});

describe('spz file layout', () => {
    it('writes the header and section sizes three.js SPZLoader expects', async () => {
        const splats = await readSplatPly(writeSplatPly('layout.ply', SOURCE, 1));
        const raw = encodeSpz(splats);

        expect(raw.readUInt32LE(0)).toBe(0x5053474e);
        expect(raw.readUInt32LE(4)).toBe(2);
        expect(raw.readUInt32LE(8)).toBe(SOURCE.length);
        expect(raw.readUInt8(12)).toBe(1);
        expect(raw.readUInt8(14)).toBe(0); // no LOD flag
        const count = SOURCE.length;
        expect(raw.length).toBe(16 + count * 9 + count + count * 3 + count * 3 + count * 3 + count * 3 * 3);
    });

    it('round-trips through a gzipped file', async () => {
        const splats = await readSplatPly(writeSplatPly('roundtrip.ply', SOURCE, 2));
        const filePath = path.join(dir, 'roundtrip.spz');
        const size = await writeSpzFile(splats, filePath);

        expect(size).toBeGreaterThan(0);
        const parsed = await readSpzFile(filePath);
        expect(parsed.count).toBe(splats.count);
        expect(parsed.shDegree).toBe(2);
        expect(Buffer.from(parsed.positions)).toEqual(Buffer.from(splats.positions));
        expect(Buffer.from(parsed.colors)).toEqual(Buffer.from(splats.colors));
        expect(Buffer.from(parsed.sh)).toEqual(Buffer.from(splats.sh));
    });

    it('rejects a file whose length does not match its header', () => {
        const truncated = Buffer.alloc(20);
        truncated.writeUInt32LE(0x5053474e, 0);
        truncated.writeUInt32LE(2, 4);
        truncated.writeUInt32LE(1, 8); // one splat, but no splat data follows

        expect(() => decodeSpz(truncated)).toThrow(/Länge/);
    });
});

describe('readSplatSplat', () => {
    it('reads the 32 byte records of an antimatter15 .splat', async () => {
        const count = 2;
        const bytes = Buffer.alloc(count * 32);
        for (let i = 0; i < count; i++) {
            const row = i * 32;
            bytes.writeFloatLE(i + 0.5, row);
            bytes.writeFloatLE(-i, row + 4);
            bytes.writeFloatLE(2, row + 8);
            bytes.writeFloatLE(0.05, row + 12);
            bytes.writeFloatLE(0.05, row + 16);
            bytes.writeFloatLE(0.05, row + 20);
            bytes[row + 24] = 200;
            bytes[row + 25] = 100;
            bytes[row + 26] = 50;
            bytes[row + 27] = 255;
            bytes[row + 28] = 255; // w = 1
            bytes[row + 29] = 128;
            bytes[row + 30] = 128;
            bytes[row + 31] = 128;
        }
        const filePath = path.join(dir, 'capture.splat');
        fs.writeFileSync(filePath, bytes);

        const splats = await readSplatSplat(filePath);

        expect(splats.count).toBe(count);
        expect(position(splats, 1, 0)).toBeCloseTo(1.5, 3);
        expect(decodeScale(splats.scales[0])).toBeCloseTo(0.05, 2);
        expect(splats.alphas[0]).toBe(255);
    });
});

describe('readSplatSog', () => {
    /** Builds a minimal SOG v2 bundle: one splat per pixel of a 2x1 grid. */
    async function writeSogBundle(name: string): Promise<string> {
        const width = 2;
        const height = 1;
        const plane = async (pixels: number[][]) => {
            const data = Buffer.from(pixels.flat());
            return new Uint8Array(await sharp(data, { raw: { width, height, channels: 4 } }).webp({ lossless: true }).toBuffer());
        };
        // Position 0 stays at the log-domain minimum, position 1 at the maximum.
        const meansLow = await plane([[0, 0, 0, 255], [255, 255, 255, 255]]);
        const meansHigh = await plane([[0, 0, 0, 255], [255, 255, 255, 255]]);
        const scales = await plane([[0, 0, 0, 255], [1, 1, 1, 255]]);
        // Identity quaternion: w is the largest component (mode 0), the rest are zero (128).
        const quats = await plane([[128, 128, 128, 252], [128, 128, 128, 252]]);
        const sh0 = await plane([[0, 1, 0, 255], [1, 0, 1, 128]]);
        const meta = {
            version: 2,
            count: 2,
            means: { mins: [0, 0, 0], maxs: [Math.log(2), Math.log(3), Math.log(4)], files: ['means_l.webp', 'means_u.webp'] },
            scales: { codebook: [-4, -2, ...Array(254).fill(0)], files: ['scales.webp'] },
            quats: { files: ['quats.webp'] },
            sh0: { codebook: [0.5, -0.5, ...Array(254).fill(0)], files: ['sh0.webp'] },
        };
        const zipped = zipSync({
            'meta.json': new Uint8Array(Buffer.from(JSON.stringify(meta))),
            'means_l.webp': meansLow,
            'means_u.webp': meansHigh,
            'scales.webp': scales,
            'quats.webp': quats,
            'sh0.webp': sh0,
        });
        const filePath = path.join(dir, name);
        fs.writeFileSync(filePath, Buffer.from(zipped));
        return filePath;
    }

    it('decodes positions, scales, opacity and the implied quaternion', async () => {
        const splats = await readSplatSog(await writeSogBundle('capture.sog'));

        expect(splats.count).toBe(2);
        expect(splats.shDegree).toBe(0);
        expect(position(splats, 0, 0)).toBeCloseTo(0, 3);
        // The maximum decodes as exp(log(n)) - 1 of each axis range.
        expect(position(splats, 1, 0)).toBeCloseTo(1, 2);
        expect(position(splats, 1, 1)).toBeCloseTo(2, 2);
        expect(position(splats, 1, 2)).toBeCloseTo(3, 2);
        expect(Math.log(decodeScale(splats.scales[0]))).toBeCloseTo(-4, 1);
        expect(Math.log(decodeScale(splats.scales[3]))).toBeCloseTo(-2, 1);
        expect(splats.alphas[0]).toBe(255);
        expect(splats.alphas[1]).toBe(128);

        const quaternion: [number, number, number, number] = [0, 0, 0, 0];
        readQuaternion(splats.rotations, 0, quaternion);
        expect(quaternion[3]).toBeCloseTo(1, 2);
    });
});

describe('rasterizeSplats', () => {
    it('draws opaque splats into the thumbnail', async () => {
        const splats = await readSplatPly(writeSplatPly('thumbnail.ply', SOURCE));
        const size = 64;

        const pixels = rasterizeSplats(splats, size);

        expect(pixels.length).toBe(size * size * 4);
        let covered = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) covered++;
        expect(covered).toBeGreaterThan(0);
    });
});
