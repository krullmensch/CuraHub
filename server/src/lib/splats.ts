import fs from 'fs';
import zlib from 'zlib';

// Gaussian splat uploads (3D Gaussian Splatting captures). Files are stored unchanged; the
// browser decodes them (three.js GaussianSplat on WebGPU, Spark on WebGL). The checks here only
// make sure a file really is a splat file of the claimed format and read the splat count.

export type SplatFormat = 'ply' | 'spz' | 'splat' | 'ksplat';

/** Extensions that are always splats. `.ply` can also be a mesh — see inspectSplatFile. */
export const SPLAT_ONLY_EXTENSIONS = ['.spz', '.splat', '.ksplat'];

export interface SplatInspection {
    format: SplatFormat;
    splatCount: number | null;
}

const SPZ_MAGIC = 0x5053474e; // "NGSP"
const SPLAT_RECORD_BYTES = 32; // antimatter15 .splat: position, scale, rgba, rotation
const PLY_HEADER_MAX_BYTES = 64 * 1024;

async function readHead(filePath: string, bytes: number): Promise<Buffer> {
    const handle = await fs.promises.open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(bytes);
        const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
}

/** First `bytes` decompressed bytes of a gzip file, without inflating the rest. */
function readGunzippedHead(filePath: string, bytes: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let length = 0;
        const input = fs.createReadStream(filePath);
        const gunzip = zlib.createGunzip();
        const finish = () => {
            input.destroy();
            gunzip.destroy();
            resolve(Buffer.concat(chunks).subarray(0, bytes));
        };
        gunzip.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            length += chunk.length;
            if (length >= bytes) finish();
        });
        gunzip.on('end', finish);
        gunzip.on('error', reject);
        input.on('error', reject);
        input.pipe(gunzip);
    });
}

/** Parses a PLY header. Returns null when the file is no PLY. */
export function parsePlyHeader(head: Buffer): { vertexCount: number | null; vertexProperties: string[] } | null {
    const text = head.toString('latin1');
    if (!text.startsWith('ply')) return null;
    const end = text.indexOf('end_header');
    if (end === -1) return null;
    let vertexCount: number | null = null;
    const vertexProperties: string[] = [];
    let inVertexElement = false;
    for (const rawLine of text.slice(0, end).split(/\r?\n/)) {
        const parts = rawLine.trim().split(/\s+/);
        if (parts[0] === 'element') {
            inVertexElement = parts[1] === 'vertex';
            if (inVertexElement) vertexCount = Number.parseInt(parts[2], 10);
        } else if (parts[0] === 'property' && inVertexElement) {
            vertexProperties.push(parts[parts.length - 1]);
        }
    }
    return { vertexCount: Number.isFinite(vertexCount) ? vertexCount : null, vertexProperties };
}

/** Properties three.js' GaussianSplatPLYLoader requires (the WebGPU renderer can't show anything else). */
const REQUIRED_SPLAT_PLY_PROPERTIES = [
    'x', 'y', 'z', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
];

/**
 * 'standard': INRIA-style Gaussian splat PLY. 'compressed': PlayCanvas/SuperSplat compressed PLY
 * (chunked, packed) — a splat, but not readable by three.js. null: an ordinary mesh PLY.
 */
export function classifySplatPly(vertexProperties: string[]): 'standard' | 'compressed' | null {
    if (vertexProperties.includes('packed_position')) return 'compressed';
    return REQUIRED_SPLAT_PLY_PROPERTIES.every((name) => vertexProperties.includes(name)) ? 'standard' : null;
}

/**
 * Identifies a splat file. Returns null for a `.ply` mesh (handled by the 3D model pipeline)
 * and throws when a splat-only extension holds something else.
 */
export async function inspectSplatFile(filePath: string, ext: string, size: number): Promise<SplatInspection | null> {
    switch (ext) {
        case '.ply': {
            const header = parsePlyHeader(await readHead(filePath, PLY_HEADER_MAX_BYTES));
            const kind = header ? classifySplatPly(header.vertexProperties) : null;
            if (!header || !kind) return null;
            if (kind === 'compressed') {
                throw new Error('Komprimierte PLY-Splats werden nicht unterstützt. Bitte als .spz oder unkomprimierte .ply exportieren.');
            }
            return { format: 'ply', splatCount: header.vertexCount };
        }
        case '.spz': {
            const head = await readHead(filePath, 16);
            const isGzip = head[0] === 0x1f && head[1] === 0x8b;
            const header = isGzip ? await readGunzippedHead(filePath, 16) : head;
            if (header.length < 12 || header.readUInt32LE(0) !== SPZ_MAGIC) throw new Error('Keine gültige SPZ-Datei');
            return { format: 'spz', splatCount: header.readUInt32LE(8) };
        }
        case '.splat': {
            if (size === 0 || size % SPLAT_RECORD_BYTES !== 0) throw new Error('Keine gültige SPLAT-Datei');
            return { format: 'splat', splatCount: size / SPLAT_RECORD_BYTES };
        }
        case '.ksplat': {
            const head = await readHead(filePath, 20);
            if (head.length < 20 || head[0] !== 0 || head[1] < 1) throw new Error('Keine gültige KSPLAT-Datei');
            return { format: 'ksplat', splatCount: head.readUInt32LE(16) };
        }
        default:
            return null;
    }
}
