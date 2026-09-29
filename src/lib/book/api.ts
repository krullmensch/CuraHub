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

export const bookPdfUrl = (assetId: number) => `/api/books/${assetId}/pdf`;

/** Thickness field in cm: '' = automatic (null), otherwise 0.3–8. */
export function parseThickness(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) && value >= 0.3 && value <= 8 ? Math.round(value * 10) / 10 : 'invalid';
}

async function expectOk(res: Response, message: string) {
  if (!res.ok) throw new Error(message);
}

export async function saveBookSettings(
  artworkId: number,
  patch: { title?: string; artist?: string; year?: string; depth?: number | null; publicReadable?: boolean },
  token: string,
): Promise<void> {
  const res = await fetch(`/api/artworks/${artworkId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  await expectOk(res, 'Einstellungen konnten nicht gespeichert werden');
}

export async function uploadBookCover(assetId: number, file: File, token: string): Promise<void> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/api/assets/${assetId}/cover`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  await expectOk(res, 'Cover konnte nicht hochgeladen werden');
}

export async function resetBookCover(assetId: number, token: string): Promise<void> {
  const res = await fetch(`/api/assets/${assetId}/cover`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  await expectOk(res, 'Cover konnte nicht zurückgesetzt werden');
}
