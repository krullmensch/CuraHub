import type { ArArtworkSource } from './arArtwork';
import { canOfferAr } from './arArtwork';

/** An entry of GET /api/assets (asset with its artwork), as far as the phone view uses it. */
export interface PlannerAsset {
  id: number;
  type?: string;
  filename: string;
  path: string;
  width: number;
  height: number;
  dpi?: number | null;
  thumbnailPath?: string | null;
  artwork?: { id: number; title?: string | null; artist?: string | null; year?: string | null; width?: number | null; height?: number | null } | null;
}

/** Pictures whose title or file name contains the query (case-insensitive). */
export function assetSearch(assets: PlannerAsset[], query: string): PlannerAsset[] {
  const q = query.trim().toLowerCase();
  return assets.filter((asset) => {
    if (!canOfferAr(asset.type)) return false;
    if (!q) return true;
    return (asset.artwork?.title ?? '').toLowerCase().includes(q) || asset.filename.toLowerCase().includes(q);
  });
}

export function arSourceFromAsset(asset: PlannerAsset): ArArtworkSource {
  return {
    artworkId: asset.artwork?.id,
    assetId: asset.id,
    artwork: {
      id: asset.artwork?.id,
      title: asset.artwork?.title ?? asset.filename,
      artist: asset.artwork?.artist ?? null,
      year: asset.artwork?.year ?? null,
      width: asset.artwork?.width ?? null,
      height: asset.artwork?.height ?? null,
      asset: {
        id: asset.id,
        filename: asset.filename,
        path: asset.path,
        width: asset.width,
        height: asset.height,
        dpi: asset.dpi ?? null,
        type: asset.type as ArArtworkSource['artwork']['asset']['type'],
        thumbnailPath: asset.thumbnailPath ?? null,
      },
    },
  };
}
