import type { BookDragInfo } from '@/store/editorStore';

/** Minimal shape of an asset row as the asset browser lists it. */
export interface BookAssetRow {
  id: number;
  type?: string;
  thumbnailPath?: string | null;
  metadata?: { pageCount?: number } | null;
  artwork?: { title?: string; artist?: string | null; year?: string | null; depth?: number | null; publicReadable?: boolean } | null;
}

export function bookDragInfo(asset: BookAssetRow): BookDragInfo | undefined {
  if (asset.type !== 'book') return undefined;
  return {
    assetId: asset.id,
    pageCount: asset.metadata?.pageCount ?? 0,
    depth: asset.artwork?.depth ?? null,
    publicReadable: asset.artwork?.publicReadable ?? false,
    title: asset.artwork?.title ?? '',
    artist: asset.artwork?.artist ?? null,
    year: asset.artwork?.year ?? null,
    thumbnailPath: asset.thumbnailPath ?? null,
  };
}
