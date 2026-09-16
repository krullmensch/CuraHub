/**
 * Gaussian splat download + parse worker (WebGPU path).
 *
 * Fetches a .ply/.spz/.splat/.ksplat file, decodes it with the three.js r186 splat loaders into
 * the attribute arrays GaussianSplat expects, computes the robust frame (SplatFrame) and transfers
 * everything back. Decoding a million-splat PLY takes seconds; on the main thread that froze the
 * editor/viewer.
 */
import { GaussianSplatPLYLoader } from 'three/examples/jsm/loaders/GaussianSplatPLYLoader.js';
import { SPZLoader } from 'three/examples/jsm/loaders/SPZLoader.js';
import { SPLATLoader } from 'three/examples/jsm/loaders/SPLATLoader.js';
import { KSPLATLoader } from 'three/examples/jsm/loaders/KSPLATLoader.js';
import type { BufferGeometry } from 'three';
import { computeSplatFrame, splatFormatFromPath, type SplatFrame } from '../lib/splats';

export interface SplatParseRequest {
    reqId: number;
    url: string;
}

export interface SplatAttributeData {
    name: string;
    array: Float32Array | Uint8Array | Uint8ClampedArray | Uint32Array;
    itemSize: number;
    normalized: boolean;
}

export type SplatParseResponse =
    | { reqId: number; type: 'progress'; loaded: number; total: number }
    | { reqId: number; type: 'done'; attributes: SplatAttributeData[]; frame: SplatFrame }
    | { reqId: number; type: 'error'; message: string };

const post = (message: SplatParseResponse, transfer: Transferable[] = []) =>
    (self as unknown as Worker).postMessage(message, transfer);

async function download(reqId: number, url: string): Promise<ArrayBuffer> {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    let lastReport = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        const now = performance.now();
        if (now - lastReport > 100) {
            lastReport = now;
            post({ reqId, type: 'progress', loaded, total });
        }
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes.buffer;
}

async function parse(url: string, buffer: ArrayBuffer): Promise<BufferGeometry> {
    switch (splatFormatFromPath(url)) {
        case 'ply': return new GaussianSplatPLYLoader().parse(buffer);
        case 'spz': {
            const loader = new SPZLoader();
            return new Promise((resolve, reject) => {
                const result = loader.parse(buffer, resolve, reject);
                if (result && !(result instanceof Promise)) resolve(result);
            });
        }
        case 'splat': return new SPLATLoader().parse(buffer);
        case 'ksplat': return new KSPLATLoader().parse(buffer);
        default: throw new Error('Unbekanntes Splat-Format');
    }
}

self.onmessage = async (event: MessageEvent<SplatParseRequest>) => {
    const { reqId, url } = event.data;
    try {
        const geometry = await parse(url, await download(reqId, url));
        const position = geometry.getAttribute('position');
        const centers = position.array;
        const frame = computeSplatFrame(position.count, (i, out) => {
            out[0] = centers[i * 3];
            out[1] = centers[i * 3 + 1];
            out[2] = centers[i * 3 + 2];
        });

        const attributes: SplatAttributeData[] = [];
        const transfer = new Set<ArrayBufferLike>();
        for (const [name, attribute] of Object.entries(geometry.attributes)) {
            const array = attribute.array as SplatAttributeData['array'];
            attributes.push({ name, array, itemSize: attribute.itemSize, normalized: attribute.normalized });
            transfer.add(array.buffer);
        }
        post({ reqId, type: 'done', attributes, frame }, [...transfer] as Transferable[]);
    } catch (err) {
        post({ reqId, type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
};
