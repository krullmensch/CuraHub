import { baseArtworkSize } from '@/lib/wallEditor/footprint';
import type { ArtworkInstanceData } from '@/store/editorStore';

export interface SizeCm {
  w: number;
  h: number;
}

/**
 * Picture size at scale 1 in cm, the way the editor sizes it: the artwork's cm values, otherwise
 * pixels at the file's dpi (72 when unknown). Most artworks have no cm values, so this is never empty.
 */
export function assetSizeCm(artwork: { width?: number | null; height?: number | null; asset: { width: number; height: number; dpi?: number | null } }): SizeCm {
  if (artwork.width != null && artwork.height != null && artwork.width > 0 && artwork.height > 0) {
    return { w: artwork.width, h: artwork.height };
  }
  const dpi = artwork.asset.dpi || 72;
  return { w: (artwork.asset.width / dpi) * 2.54, h: (artwork.asset.height / dpi) * 2.54 };
}

/** Instance scale that makes the picture `size` (cm) — the editor's „Size (cm)" fields do the same. */
export function scaleForSizeCm(inst: ArtworkInstanceData, size: SizeCm): { scale_x: number; scale_y: number } {
  const base = baseArtworkSize(inst);
  return { scale_x: size.w / (base.w * 100), scale_y: size.h / (base.h * 100) };
}

/** Width changed, aspect kept. */
export function sizeForWidthCm(size: SizeCm, w: number): SizeCm {
  if (!(w > 0)) return size;
  return { w, h: (size.h * w) / size.w };
}

/** Height changed, aspect kept. */
export function sizeForHeightCm(size: SizeCm, h: number): SizeCm {
  if (!(h > 0)) return size;
  return { w: (size.w * h) / size.h, h };
}
