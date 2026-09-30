import type { BookAssetMeta, BookDragInfo } from '@/store/editorStore';

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

export const bookPdfUrl = (assetId: number) => `/api/books/${assetId}/pdf`;

/** Thickness field in cm: '' = automatic (null), otherwise 0.3–8. */
export function parseThickness(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) && value >= 0.3 && value <= 8 ? Math.round(value * 10) / 10 : 'invalid';
}

/** The artwork/asset fields the client keeps on a placed instance. */
export interface BookAssetFields {
  path: string;
  thumbnailPath: string | null;
  width: number;
  height: number;
  metadata: BookAssetMeta | null;
}
export interface BookArtworkFields {
  title: string;
  artist: string | null;
  year: string | null;
  depth: number | null;
  publicReadable: boolean;
  width: number | null;
  height: number | null;
}
export interface BookUpdate {
  artworkId: number;
  artwork: BookArtworkFields;
  asset?: BookAssetFields;
}

async function expectOk(res: Response, message: string) {
  if (!res.ok) throw new Error(message);
}

const pickAsset = (a: BookAssetFields): BookAssetFields => ({
  path: a.path, thumbnailPath: a.thumbnailPath ?? null, width: a.width, height: a.height, metadata: a.metadata ?? null,
});
const pickArtwork = (a: BookArtworkFields): BookArtworkFields => ({
  title: a.title, artist: a.artist ?? null, year: a.year ?? null, depth: a.depth ?? null,
  publicReadable: a.publicReadable ?? false, width: a.width ?? null, height: a.height ?? null,
});

/** PUT /artworks/:id answers with the artwork including its asset. */
export function bookUpdateFromArtwork(json: BookArtworkFields & { id: number; asset?: BookAssetFields | null }): BookUpdate {
  return { artworkId: json.id, artwork: pickArtwork(json), asset: json.asset ? pickAsset(json.asset) : undefined };
}

/** Cover routes answer with the asset including its artwork; null when the asset has none. */
export function bookUpdateFromAsset(json: BookAssetFields & { artwork?: (BookArtworkFields & { id: number }) | null }): BookUpdate | null {
  if (!json.artwork) return null;
  return { artworkId: json.artwork.id, artwork: pickArtwork(json.artwork), asset: pickAsset(json) };
}

export async function saveBookSettings(
  artworkId: number,
  patch: { title?: string; artist?: string; year?: string; depth?: number | null; publicReadable?: boolean },
  token: string,
): Promise<BookUpdate> {
  const res = await fetch(`/api/artworks/${artworkId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  await expectOk(res, 'Einstellungen konnten nicht gespeichert werden');
  return bookUpdateFromArtwork(await res.json());
}

export async function uploadBookCover(assetId: number, file: File, token: string): Promise<BookUpdate | null> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/api/assets/${assetId}/cover`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  await expectOk(res, 'Cover konnte nicht hochgeladen werden');
  return bookUpdateFromAsset(await res.json());
}

export async function resetBookCover(assetId: number, token: string): Promise<BookUpdate | null> {
  const res = await fetch(`/api/assets/${assetId}/cover`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  await expectOk(res, 'Cover konnte nicht zurückgesetzt werden');
  return bookUpdateFromAsset(await res.json());
}
