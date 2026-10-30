import type { FrameStyleId } from '@/lib/frameStyles';
import type { PassepartoutValue } from '@/lib/passepartout';
import type { ArtworkInstanceData } from '@/store/editorStore';
import { scaleForSizeCm, type SizeCm } from './arSize';

/** Pictures go to the wall; videos (no frame, still not at real size), models, splats and books don't. */
export function canOfferAr(assetType: string | undefined): boolean {
  return assetType === 'image';
}

/** An artwork from the asset list, not hung yet. */
export interface ArArtworkSource {
  artworkId?: number;
  assetId?: number;
  artwork: ArtworkInstanceData['artwork'];
}

/**
 * The one artwork the AR model is built from: at the origin, facing +Z, with the chosen frame and
 * passepartout. A placed artwork keeps its hung size (its scale, exactly as in the editor); one from
 * the asset list goes at `sizeCm` (picked in the sheet) or at scale 1. Never part of the editor's
 * instance list.
 */
export function arArtworkInstance(
  base: ArtworkInstanceData | ArArtworkSource,
  frame: { frameStyle: FrameStyleId; passepartout: PassepartoutValue },
  sizeCm?: SizeCm,
): ArtworkInstanceData {
  const placed = 'scale_x' in base ? base : null;
  const inst: ArtworkInstanceData = {
    id: -1,
    artworkId: base.artworkId,
    assetId: base.assetId,
    wallId: null,
    medium: 'frame',
    frameStyle: frame.frameStyle,
    passepartoutWidth: frame.passepartout.width,
    passepartoutPlacement: frame.passepartout.placement,
    artwork: base.artwork,
    position_x: 0,
    position_y: 0,
    position_z: 0,
    rotation_x: 0,
    rotation_y: 0,
    rotation_z: 0,
    scale_x: placed ? Math.abs(placed.scale_x) || 1 : 1,
    scale_y: placed ? Math.abs(placed.scale_y) || 1 : 1,
    scale_z: 1,
  };
  return sizeCm ? { ...inst, ...scaleForSizeCm(inst, sizeCm) } : inst;
}
