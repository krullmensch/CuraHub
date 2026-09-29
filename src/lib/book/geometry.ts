import type { ArtworkInstanceData } from '@/store/editorStore';

/**
 * Sizes of a book on its pedestal, in metres. The book lies flat, cover up; the pedestal's origin
 * is the centre of its bottom face, the book group's origin the centre of the pedestal top.
 */

export const PEDESTAL_HEIGHT = 1.2;
export const PEDESTAL_MARGIN = 0.1;
export const PEDESTAL_MIN = 0.4;
export const HIT_PAD = 0.01;
export const HIT_MIN_HEIGHT = 0.05;
/** First person: books open from this distance or closer. */
export const BOOK_OPEN_DISTANCE = 2.5;

/** Page width (X), page height (Z, cover top towards −Z), thickness (Y). */
export interface BookSize {
  width: number;
  length: number;
  thickness: number;
}

export interface PedestalSize {
  width: number;
  depth: number;
  height: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** 0.1 mm per sheet (80 g/m²) plus 2 × 2 mm board, 0.3–8 cm. */
export function autoThicknessCm(pageCount: number): number {
  return clamp(Math.ceil(Math.max(0, pageCount) / 2) * 0.01 + 0.4, 0.3, 8);
}

export function bookSize(input: { widthCm?: number | null; heightCm?: number | null; depthCm?: number | null; pageCount?: number | null }): BookSize {
  const widthCm = input.widthCm && input.widthCm > 0 ? input.widthCm : 21;
  const heightCm = input.heightCm && input.heightCm > 0 ? input.heightCm : 29.7;
  const depthCm = input.depthCm ?? autoThicknessCm(input.pageCount ?? 0);
  return { width: round4(widthCm / 100), length: round4(heightCm / 100), thickness: round4(depthCm / 100) };
}

export function bookSizeOf(inst: ArtworkInstanceData): BookSize {
  return bookSize({
    widthCm: inst.artwork.width,
    heightCm: inst.artwork.height,
    depthCm: inst.artwork.depth,
    pageCount: inst.artwork.asset.metadata?.pageCount,
  });
}

export function pedestalSize(book: BookSize): PedestalSize {
  return {
    width: round4(Math.max(PEDESTAL_MIN, book.width + 2 * PEDESTAL_MARGIN)),
    depth: round4(Math.max(PEDESTAL_MIN, book.length + 2 * PEDESTAL_MARGIN)),
    height: PEDESTAL_HEIGHT,
  };
}

export function bookHitBox(book: BookSize): { min: [number, number, number]; max: [number, number, number] } {
  const hx = round4(book.width / 2 + HIT_PAD);
  const hz = round4(book.length / 2 + HIT_PAD);
  return { min: [-hx, 0, -hz], max: [hx, round4(Math.max(book.thickness, HIT_MIN_HEIGHT)), hz] };
}
