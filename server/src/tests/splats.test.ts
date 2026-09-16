import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { classifySplatPly, inspectSplatFile, parsePlyHeader } from '../lib/splats';

const SPLAT_PLY_PROPERTIES = [
    'x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
    'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3',
];

let dir: string;

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curahub-splats-'));
});

afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

function write(name: string, data: Buffer | string): { filePath: string; size: number } {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, data);
    return { filePath, size: fs.statSync(filePath).size };
}

function plyHeader(count: number, properties: string[]): string {
    return `ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n${properties.map((p) => `property float ${p}\n`).join('')}end_header\n`;
}

function spzHeader(version: number, count: number): Buffer {
    const header = Buffer.alloc(16);
    header.writeUInt32LE(0x5053474e, 0);
    header.writeUInt32LE(version, 4);
    header.writeUInt32LE(count, 8);
    return header;
}

describe('parsePlyHeader / classifySplatPly', () => {
    it('reads the vertex count and the vertex properties only', () => {
        const header = parsePlyHeader(Buffer.from(
            'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n',
        ));
        expect(header).toEqual({ vertexCount: 3, vertexProperties: ['x', 'y'] });
    });

    it('returns null for files that are no PLY', () => {
        expect(parsePlyHeader(Buffer.from('glTF binary'))).toBeNull();
    });

    it('tells splat PLYs, compressed splat PLYs and meshes apart', () => {
        expect(classifySplatPly(SPLAT_PLY_PROPERTIES)).toBe('standard');
        expect(classifySplatPly(['packed_position', 'packed_rotation', 'packed_scale', 'packed_color'])).toBe('compressed');
        expect(classifySplatPly(['x', 'y', 'z', 'nx', 'ny', 'nz', 'red', 'green', 'blue'])).toBeNull();
    });
});

describe('inspectSplatFile', () => {
    it('detects a Gaussian splat PLY', async () => {
        const { filePath, size } = write('capture.ply', plyHeader(42, SPLAT_PLY_PROPERTIES));
        await expect(inspectSplatFile(filePath, '.ply', size)).resolves.toEqual({ format: 'ply', splatCount: 42 });
    });

    it('leaves mesh PLYs to the 3D model pipeline', async () => {
        const { filePath, size } = write('mesh.ply', 'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n');
        await expect(inspectSplatFile(filePath, '.ply', size)).resolves.toBeNull();
    });

    it('rejects compressed splat PLYs with a German hint', async () => {
        const { filePath, size } = write('compressed.ply', plyHeader(10, ['packed_position', 'packed_rotation']));
        await expect(inspectSplatFile(filePath, '.ply', size)).rejects.toThrow(/Komprimierte PLY-Splats/);
    });

    it('reads the splat count of gzipped (v1–3) and raw (v4) SPZ files', async () => {
        const gzipped = write('v2.spz', zlib.gzipSync(Buffer.concat([spzHeader(2, 1234), Buffer.alloc(64)])));
        await expect(inspectSplatFile(gzipped.filePath, '.spz', gzipped.size)).resolves.toEqual({ format: 'spz', splatCount: 1234 });
        const raw = write('v4.spz', Buffer.concat([spzHeader(4, 99), Buffer.alloc(64)]));
        await expect(inspectSplatFile(raw.filePath, '.spz', raw.size)).resolves.toEqual({ format: 'spz', splatCount: 99 });
    });

    it('rejects SPZ files without the NGSP magic', async () => {
        const { filePath, size } = write('fake.spz', zlib.gzipSync(Buffer.from('not a splat at all')));
        await expect(inspectSplatFile(filePath, '.spz', size)).rejects.toThrow('Keine gültige SPZ-Datei');
    });

    it('counts .splat records and rejects truncated files', async () => {
        const ok = write('ok.splat', Buffer.alloc(32 * 5));
        await expect(inspectSplatFile(ok.filePath, '.splat', ok.size)).resolves.toEqual({ format: 'splat', splatCount: 5 });
        const broken = write('broken.splat', Buffer.alloc(33));
        await expect(inspectSplatFile(broken.filePath, '.splat', broken.size)).rejects.toThrow('Keine gültige SPLAT-Datei');
    });

    it('reads the splat count of a KSPLAT header', async () => {
        const header = Buffer.alloc(64);
        header[0] = 0;
        header[1] = 1;
        header.writeUInt32LE(777, 16);
        const { filePath, size } = write('scene.ksplat', header);
        await expect(inspectSplatFile(filePath, '.ksplat', size)).resolves.toEqual({ format: 'ksplat', splatCount: 777 });
    });
});
