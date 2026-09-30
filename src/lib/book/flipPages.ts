/** Pure helpers for the flip viewer (BookFlipbook): page-flip size, preload window, render scale. */

/** Height page-flip lays the book out in; like the zine manifest (pages are 1800 px tall). */
export const FLIP_PAGE_HEIGHT = 1800;
/** Pages within this distance of the current one get rendered. */
export const PRELOAD_RADIUS = 6;
/** Below this page width page-flip switches to single-page mode. */
export const MIN_PAGE_WIDTH = 300;
/** Longest side of a rendered page canvas in device pixels (memory bound, ~12 MB per page). */
export const MAX_RENDER_SIDE = 2048;
/** A rendered page is only redone when its box grew by more than this factor. */
const RERENDER_GROWTH = 1.2;

const A4_RATIO = 210 / 297;

/** `width`/`height` props for page-flip from page 1's PDF viewport (A4 fallback for bad input). */
export function flipPageSize(viewportWidth: number, viewportHeight: number): { width: number; height: number } {
  const valid =
    Number.isFinite(viewportWidth) && Number.isFinite(viewportHeight) && viewportWidth > 0 && viewportHeight > 0;
  const ratio = valid ? viewportWidth / viewportHeight : A4_RATIO;
  return { width: Math.round(FLIP_PAGE_HEIGHT * ratio), height: FLIP_PAGE_HEIGHT };
}

export function isNearPage(index: number, current: number): boolean {
  return Math.abs(index - current) <= PRELOAD_RADIUS;
}

interface RenderScaleInput {
  /** PDF page size at scale 1 */
  baseWidth: number;
  baseHeight: number;
  /** Size of the page element on screen in CSS px */
  boxWidth: number;
  boxHeight: number;
  dpr: number;
}

/**
 * pdf.js scale that fills the page box (`object-fit: cover`, like the zine's images) at the
 * screen's pixel density (dpr capped at 2), never more than MAX_RENDER_SIDE px on the long side.
 */
export function pageRenderScale({ baseWidth, baseHeight, boxWidth, boxHeight, dpr }: RenderScaleInput): number {
  const ok = [baseWidth, baseHeight, boxWidth, boxHeight].every((n) => Number.isFinite(n) && n > 0);
  if (!ok) return 1;
  const ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 2) : 1;
  const cover = Math.max(boxWidth / baseWidth, boxHeight / baseHeight) * ratio;
  const cap = MAX_RENDER_SIDE / Math.max(baseWidth, baseHeight);
  return Math.min(cover, cap);
}

/** Whether a page rendered for `renderedBoxWidth` must be redone for `boxWidth`. */
export function needsRerender(renderedBoxWidth: number | null, boxWidth: number): boolean {
  return renderedBoxWidth === null || boxWidth > renderedBoxWidth * RERENDER_GROWTH;
}
