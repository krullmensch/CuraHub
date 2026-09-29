import { displayArtworkTitle } from '@/lib/artworkTitle';

/** Werkschild on the pedestal: title on top, „artist, year" below. */

const MAX = 42;
const clip = (s: string) => (s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s);
// Artworks created on placement get the artist 'Unknown' (server/src/routes/instances.ts).
const PLACEHOLDER_ARTISTS = new Set(['unknown', '']);

export function labelPlateLines(input: { title?: string | null; artist?: string | null; year?: string | null }) {
  const title = clip(displayArtworkTitle(input.title ?? '').trim() || 'Ohne Titel');
  const artist = input.artist?.trim() ?? '';
  const parts = [PLACEHOLDER_ARTISTS.has(artist.toLowerCase()) ? '' : artist, input.year?.trim() ?? ''].filter(Boolean);
  return { title, byline: clip(parts.join(', ')) };
}

export const LABEL_PLATE_SIZE = { width: 0.24, height: 0.08 };
const PX_PER_M = 2000;

export function drawLabelPlate(canvas: HTMLCanvasElement, lines: { title: string; byline: string }): void {
  canvas.width = LABEL_PLATE_SIZE.width * PX_PER_M;
  canvas.height = LABEL_PLATE_SIZE.height * PX_PER_M;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#f4f4f2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1c1c1c';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 34px "Albert Sans", system-ui, sans-serif';
  ctx.fillText(lines.title, 24, 62, canvas.width - 48);
  if (lines.byline) {
    ctx.font = '400 26px "Albert Sans", system-ui, sans-serif';
    ctx.fillStyle = '#4a4a4a';
    ctx.fillText(lines.byline, 24, 110, canvas.width - 48);
  }
}
