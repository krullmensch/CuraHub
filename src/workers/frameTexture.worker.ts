/**
 * Frame texture worker: generates the wood grain / brushing textures of a frame finish
 * (lib/frameTextures) off the main thread — ~0.5 M texels of noise per finish, 100+ ms each.
 */
import { generateFinishTextures, type FinishTextures } from '../lib/frameTextures';
import type { FrameFinishId } from '../lib/frameStyles';

export interface FrameTextureRequest {
    reqId: number;
    finishId: FrameFinishId;
}

export interface FrameTextureResponse {
    reqId: number;
    textures: FinishTextures | null;
}

self.onmessage = (event: MessageEvent<FrameTextureRequest>) => {
    const { reqId, finishId } = event.data;
    const textures = generateFinishTextures(finishId);
    const transfer = textures ? [textures.albedo.buffer, textures.roughness.buffer, textures.normal.buffer] : [];
    (self as unknown as Worker).postMessage({ reqId, textures } satisfies FrameTextureResponse, transfer);
};
