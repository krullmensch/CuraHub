import fs from 'fs';
import path from 'path';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import {
    SH_C0,
    SH_VECTORS_PER_DEGREE,
    SPZ_FRACTIONAL_BITS,
    allocSpzSplats,
    encodeColor,
    encodeOpacity,
    encodeScale,
    encodeShCoefficient,
    readSpzFile,
    sigmoid,
    writePositionComponent,
    writeQuaternion,
    type SpzSplats,
} from './spz';

// Readers that turn an uploaded Gaussian splat file into SPZ's quantised arrays (./spz). Every
// upload goes through one of these and is then stored as `.spz`, so the browser never downloads a
// raw INRIA PLY (~236 bytes per splat) or a SOG bundle it would have to unpack itself.

/** Beyond this a capture would need gigabytes of RAM to convert; it is stored as uploaded. */
export const MAX_CONVERTIBLE_SPLATS = 12_000_000;

const PLY_HEADER_MAX_BYTES = 64 * 1024;
const SPLAT_RECORD_BYTES = 32;
/** SOG packs 64 spherical harmonics palette entries per centroid image row. */
const SOG_CENTROIDS_PER_ROW = 64;
const SOG_COEFFICIENTS_PER_BAND = [0, 3, 8, 15];

/** Extensions this module can turn into SPZ. */
export const CONVERTIBLE_EXTENSIONS = ['.ply', '.sog', '.splat', '.spz'];

/** Reads any supported splat file into SPZ arrays. `.spz` is only parsed, not re-quantised. */
export async function readSplatFile(filePath: string, ext = path.extname(filePath).toLowerCase()): Promise<SpzSplats> {
    switch (ext) {
        case '.ply': return readSplatPly(filePath);
        case '.sog': return readSplatSog(filePath);
        case '.splat': return readSplatSplat(filePath);
        case '.spz': return readSpzFile(filePath);
        default: throw new Error(`Splat-Format ${ext} kann nicht gelesen werden`);
    }
}

// ── PLY (INRIA / "3D Gaussian Splatting" training output) ──

type PlyType = 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'float32' | 'float64';

const PLY_TYPES: Record<string, { type: PlyType; size: number }> = {
    char: { type: 'int8', size: 1 }, int8: { type: 'int8', size: 1 },
    uchar: { type: 'uint8', size: 1 }, uint8: { type: 'uint8', size: 1 },
    short: { type: 'int16', size: 2 }, int16: { type: 'int16', size: 2 },
    ushort: { type: 'uint16', size: 2 }, uint16: { type: 'uint16', size: 2 },
    int: { type: 'int32', size: 4 }, int32: { type: 'int32', size: 4 },
    uint: { type: 'uint32', size: 4 }, uint32: { type: 'uint32', size: 4 },
    float: { type: 'float32', size: 4 }, float32: { type: 'float32', size: 4 },
    double: { type: 'float64', size: 8 }, float64: { type: 'float64', size: 8 },
};

interface PlyField { type: PlyType; offset: number }

interface PlyLayout {
    count: number;
    stride: number;
    dataOffset: number;
    fields: Map<string, PlyField>;
}

function parsePlyLayout(head: Buffer): PlyLayout {
    const text = head.toString('latin1');
    const end = text.indexOf('end_header');
    if (!text.startsWith('ply') || end === -1) throw new Error('Keine gültige PLY-Datei');
    const headerEnd = text.indexOf('\n', end);
    const header = text.slice(0, end);

    if (!/format\s+binary_little_endian/.test(header)) {
        throw new Error('Nur binäre PLY-Splats (binary_little_endian) werden unterstützt');
    }

    const fields = new Map<string, PlyField>();
    let count = 0;
    let stride = 0;
    let inVertex = false;
    for (const rawLine of header.split(/\r?\n/)) {
        const parts = rawLine.trim().split(/\s+/);
        if (parts[0] === 'element') {
            if (inVertex) break; // properties of later elements would shift nothing we read
            inVertex = parts[1] === 'vertex';
            if (inVertex) count = Number.parseInt(parts[2], 10);
        } else if (parts[0] === 'property' && inVertex) {
            if (parts[1] === 'list') throw new Error('PLY-Splats mit Listen-Eigenschaften werden nicht unterstützt');
            const mapped = PLY_TYPES[parts[1]];
            if (!mapped) throw new Error(`Unbekannter PLY-Datentyp: ${parts[1]}`);
            fields.set(parts[parts.length - 1], { type: mapped.type, offset: stride });
            stride += mapped.size;
        }
    }
    if (!Number.isFinite(count) || count <= 0) throw new Error('PLY-Datei enthält keine Splats');
    return { count, stride, dataOffset: headerEnd + 1, fields };
}

function readField(view: DataView, base: number, field: PlyField): number {
    const offset = base + field.offset;
    switch (field.type) {
        case 'int8': return view.getInt8(offset);
        case 'uint8': return view.getUint8(offset);
        case 'int16': return view.getInt16(offset, true);
        case 'uint16': return view.getUint16(offset, true);
        case 'int32': return view.getInt32(offset, true);
        case 'uint32': return view.getUint32(offset, true);
        case 'float32': return view.getFloat32(offset, true);
        case 'float64': return view.getFloat64(offset, true);
    }
}

/**
 * Streams a Gaussian splat PLY into SPZ arrays. Streaming, because these files run to hundreds of
 * megabytes — holding the whole buffer and the parsed result at once is what made the server run
 * out of memory on a phone capture.
 */
export async function readSplatPly(filePath: string): Promise<SpzSplats> {
    const handle = await fs.promises.open(filePath, 'r');
    let layout: PlyLayout;
    try {
        const head = Buffer.alloc(PLY_HEADER_MAX_BYTES);
        const { bytesRead } = await handle.read(head, 0, PLY_HEADER_MAX_BYTES, 0);
        layout = parsePlyLayout(head.subarray(0, bytesRead));
    } finally {
        await handle.close();
    }

    const field = (name: string) => {
        const found = layout.fields.get(name);
        if (!found) throw new Error(`PLY-Splat ohne Eigenschaft "${name}"`);
        return found;
    };
    const position = [field('x'), field('y'), field('z')];
    const scale = [field('scale_0'), field('scale_1'), field('scale_2')];
    const rotation = [field('rot_0'), field('rot_1'), field('rot_2'), field('rot_3')];
    const dc = [field('f_dc_0'), field('f_dc_1'), field('f_dc_2')];
    const opacity = field('opacity');

    const restCount = [...layout.fields.keys()].filter((name) => name.startsWith('f_rest_')).length;
    const shDegree = SH_VECTORS_PER_DEGREE.indexOf(restCount / 3);
    if (restCount % 3 !== 0 || shDegree === -1) {
        throw new Error(`PLY-Splat mit ${restCount} f_rest-Eigenschaften wird nicht unterstützt`);
    }
    const vectors = SH_VECTORS_PER_DEGREE[shDegree];
    // PLY stores f_rest channel-major (all coefficients of R, then G, then B), SPZ coefficient-major.
    const rest: PlyField[] = [];
    for (let coefficient = 0; coefficient < vectors; coefficient++) {
        for (let channel = 0; channel < 3; channel++) rest.push(field(`f_rest_${channel * vectors + coefficient}`));
    }

    if (layout.count > MAX_CONVERTIBLE_SPLATS) {
        throw new Error(`Capture mit ${layout.count.toLocaleString('de-DE')} Splats ist zu groß für die Konvertierung`);
    }

    const splats = allocSpzSplats(layout.count, shDegree);
    let index = 0;

    await new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(filePath, { start: layout.dataOffset });
        let carry: Buffer | null = null;
        stream.on('data', (chunk: string | Buffer) => {
            let buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
            if (carry) {
                buffer = Buffer.concat([carry, buffer]);
                carry = null;
            }
            const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
            let offset = 0;
            while (index < layout.count && offset + layout.stride <= buffer.byteLength) {
                writeSplatFromPly(splats, index, view, offset, {
                    position, scale, rotation, dc, opacity, rest,
                });
                offset += layout.stride;
                index++;
            }
            if (index >= layout.count) {
                stream.destroy();
                resolve();
                return;
            }
            if (offset < buffer.byteLength) carry = Buffer.from(buffer.subarray(offset));
        });
        stream.on('end', () => resolve());
        stream.on('error', reject);
    });

    if (index < layout.count) throw new Error('PLY-Datei endet vor dem letzten Splat');
    return splats;
}

interface PlyFields {
    position: PlyField[];
    scale: PlyField[];
    rotation: PlyField[];
    dc: PlyField[];
    opacity: PlyField;
    rest: PlyField[];
}

function writeSplatFromPly(splats: SpzSplats, index: number, view: DataView, base: number, fields: PlyFields): void {
    for (let axis = 0; axis < 3; axis++) {
        writePositionComponent(splats.positions, index * 9 + axis * 3, readField(view, base, fields.position[axis]), splats.fractionalBits);
        splats.scales[index * 3 + axis] = encodeScale(readField(view, base, fields.scale[axis]));
        splats.colors[index * 3 + axis] = encodeColor(readField(view, base, fields.dc[axis]));
    }
    // INRIA PLY stores the quaternion as rot_0 = w, rot_1..3 = x, y, z.
    writeQuaternion(
        splats.rotations,
        index * 3,
        readField(view, base, fields.rotation[1]),
        readField(view, base, fields.rotation[2]),
        readField(view, base, fields.rotation[3]),
        readField(view, base, fields.rotation[0]),
    );
    splats.alphas[index] = encodeOpacity(sigmoid(readField(view, base, fields.opacity)));
    const shOffset = index * fields.rest.length;
    for (let i = 0; i < fields.rest.length; i++) {
        splats.sh[shOffset + i] = encodeShCoefficient(readField(view, base, fields.rest[i]));
    }
}

// ── antimatter15 `.splat` (fixed 32 byte records, no spherical harmonics) ──

export async function readSplatSplat(filePath: string): Promise<SpzSplats> {
    const bytes = await fs.promises.readFile(filePath);
    if (bytes.length === 0 || bytes.length % SPLAT_RECORD_BYTES !== 0) throw new Error('Keine gültige SPLAT-Datei');
    const count = bytes.length / SPLAT_RECORD_BYTES;
    if (count > MAX_CONVERTIBLE_SPLATS) throw new Error('Capture ist zu groß für die Konvertierung');

    const splats = allocSpzSplats(count, 0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < count; i++) {
        const row = i * SPLAT_RECORD_BYTES;
        for (let axis = 0; axis < 3; axis++) {
            writePositionComponent(splats.positions, i * 9 + axis * 3, view.getFloat32(row + axis * 4, true), splats.fractionalBits);
            // `.splat` stores linear scales, SPZ their logarithm.
            splats.scales[i * 3 + axis] = encodeScale(Math.log(Math.max(view.getFloat32(row + 12 + axis * 4, true), 1e-9)));
            // …and the rendered colour, not the DC coefficient it came from.
            splats.colors[i * 3 + axis] = encodeColor((bytes[row + 24 + axis] / 255 - 0.5) / SH_C0);
        }
        splats.alphas[i] = bytes[row + 27];
        // Quaternion bytes are stored w, x, y, z.
        writeQuaternion(
            splats.rotations,
            i * 3,
            (bytes[row + 29] - 128) / 128,
            (bytes[row + 30] - 128) / 128,
            (bytes[row + 31] - 128) / 128,
            (bytes[row + 28] - 128) / 128,
        );
    }
    return splats;
}

// ── SOG v2 bundle (PlayCanvas/SuperSplat: a zip of meta.json + lossless WebP planes) ──

interface SogPlane {
    files: string[];
    mins?: number[];
    maxs?: number[];
    codebook?: number[];
    count?: number;
    bands?: number;
}

export interface SogMeta {
    version?: number;
    count: number;
    means: SogPlane;
    scales: SogPlane;
    quats: SogPlane;
    sh0: SogPlane;
    shN?: SogPlane;
}

interface SogImage {
    data: Buffer;
    width: number;
    height: number;
}

/** Reads the `meta.json` of a `.sog` bundle. Throws for anything that is not a SOG v2 bundle. */
export function parseSogBundle(bytes: Uint8Array): { meta: SogMeta; files: Record<string, Uint8Array>; root: string } {
    const entries = unzipSync(bytes);
    const metaName = Object.keys(entries).find((name) => name.split(/[\\/]/).pop() === 'meta.json');
    if (!metaName) throw new Error('Keine gültige SOG-Datei (meta.json fehlt)');
    const meta = JSON.parse(Buffer.from(entries[metaName]).toString('utf8')) as SogMeta;
    if (meta.version !== 2) {
        throw new Error('Nur SOG v2 wird unterstützt. Bitte mit einer aktuellen SuperSplat-Version exportieren.');
    }
    for (const key of ['means', 'scales', 'quats', 'sh0'] as const) {
        if (!meta[key]?.files?.length) throw new Error(`SOG-Datei ohne ${key}-Daten`);
    }
    if (!Number.isFinite(meta.count) || meta.count <= 0) throw new Error('SOG-Datei enthält keine Splats');
    return { meta, files: entries, root: metaName.slice(0, metaName.length - 'meta.json'.length) };
}

async function decodeSogImage(files: Record<string, Uint8Array>, root: string, name: string): Promise<SogImage> {
    const entry = files[root + name] ?? files[name];
    if (!entry) throw new Error(`SOG-Datei ohne ${name}`);
    const { data, info } = await sharp(Buffer.from(entry)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}

const unlog = (value: number) => Math.sign(value) * (Math.exp(Math.abs(value)) - 1);

export async function readSplatSog(filePath: string): Promise<SpzSplats> {
    const { meta, files, root } = parseSogBundle(await fs.promises.readFile(filePath));
    if (meta.count > MAX_CONVERTIBLE_SPLATS) throw new Error('Capture ist zu groß für die Konvertierung');

    const [meansLow, meansHigh, scales, quats, sh0] = await Promise.all([
        decodeSogImage(files, root, meta.means.files[0]),
        decodeSogImage(files, root, meta.means.files[1]),
        decodeSogImage(files, root, meta.scales.files[0]),
        decodeSogImage(files, root, meta.quats.files[0]),
        decodeSogImage(files, root, meta.sh0.files[0]),
    ]);

    const shBands = meta.shN?.bands ?? 0;
    const shDegree = shBands >= 1 && shBands <= 3 ? shBands : 0;
    const shCoefficients = SOG_COEFFICIENTS_PER_BAND[shDegree];
    const shN = shDegree > 0 && meta.shN
        ? {
            centroids: await decodeSogImage(files, root, meta.shN.files[0]),
            labels: await decodeSogImage(files, root, meta.shN.files[1]),
            codebook: meta.shN.codebook ?? [],
        }
        : null;

    const splats = allocSpzSplats(meta.count, shDegree);
    const scaleCodebook = meta.scales.codebook ?? [];
    const colorCodebook = meta.sh0.codebook ?? [];
    const mins = meta.means.mins ?? [0, 0, 0];
    const maxs = meta.means.maxs ?? [0, 0, 0];
    const quaternion = [0, 0, 0, 0];

    for (let i = 0; i < meta.count; i++) {
        const pixel = i * 4;
        for (let axis = 0; axis < 3; axis++) {
            // 16 bit per axis, split over two images, in a symmetric log domain.
            const quantised = (meansHigh.data[pixel + axis] << 8) | meansLow.data[pixel + axis];
            const normalised = mins[axis] + (maxs[axis] - mins[axis]) * (quantised / 65535);
            writePositionComponent(splats.positions, i * 9 + axis * 3, unlog(normalised), splats.fractionalBits);
            splats.scales[i * 3 + axis] = encodeScale(scaleCodebook[scales.data[pixel + axis]] ?? 0);
            splats.colors[i * 3 + axis] = encodeColor(colorCodebook[sh0.data[pixel + axis]] ?? 0);
        }
        splats.alphas[i] = sh0.data[pixel + 3];

        // Smallest-three quaternion: the alpha channel says which component was left out.
        const largest = Math.max(0, Math.min(3, quats.data[pixel + 3] - 252));
        const components = [0, 1, 2].map((channel) => (quats.data[pixel + channel] / 255 - 0.5) * 2 * Math.SQRT1_2);
        const targets = [0, 1, 2, 3].filter((slot) => slot !== largest);
        for (let slot = 0; slot < 3; slot++) quaternion[targets[slot]] = components[slot];
        quaternion[largest] = Math.sqrt(Math.max(0, 1 - components.reduce((sum, c) => sum + c * c, 0)));
        // SOG orders the quaternion w, x, y, z.
        writeQuaternion(splats.rotations, i * 3, quaternion[1], quaternion[2], quaternion[3], quaternion[0]);

        if (!shN) continue;
        const label = shN.labels.data[pixel] + (shN.labels.data[pixel + 1] << 8);
        const centroidRow = Math.floor(label / SOG_CENTROIDS_PER_ROW);
        const centroidColumn = (label % SOG_CENTROIDS_PER_ROW) * shCoefficients;
        const shOffset = i * shCoefficients * 3;
        for (let coefficient = 0; coefficient < shCoefficients; coefficient++) {
            const texel = (centroidRow * shN.centroids.width + centroidColumn + coefficient) * 4;
            for (let channel = 0; channel < 3; channel++) {
                splats.sh[shOffset + coefficient * 3 + channel] =
                    encodeShCoefficient(shN.codebook[shN.centroids.data[texel + channel]] ?? 0);
            }
        }
    }

    return splats;
}

export { SPZ_FRACTIONAL_BITS };
