import type { TourSide } from './steps';

export interface Rect { x: number; y: number; width: number; height: number }
interface Size { width: number; height: number }

export const SPOTLIGHT_PADDING = 8;
export const POPOVER_GAP = 12;
export const VIEWPORT_MARGIN = 16;
export const SHEET_BREAKPOINT = 640;

export type PopoverPlacement =
  | { mode: 'anchored'; x: number; y: number; side: TourSide }
  | { mode: 'centered'; x: number; y: number }
  | { mode: 'sheet' };

const SIDES: TourSide[] = ['top', 'bottom', 'left', 'right'];
const OPPOSITE: Record<TourSide, TourSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

export function spotlightRect(target: Rect, padding = SPOTLIGHT_PADDING): Rect {
  return { x: target.x - padding, y: target.y - padding, width: target.width + 2 * padding, height: target.height + 2 * padding };
}

/** False for elements moved out of view (a collapsed sidebar is translated off screen). */
export function isOnScreen(r: Rect, viewport: Size): boolean {
  return r.x + r.width > 0 && r.y + r.height > 0 && r.x < viewport.width && r.y < viewport.height;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Where the tour popover goes: next to the target (preferred side first), centred, or as a bottom sheet. */
export function popoverPosition(target: Rect | null, popover: Size, viewport: Size, preferred: TourSide): PopoverPlacement {
  if (viewport.width < SHEET_BREAKPOINT) return { mode: 'sheet' };
  const centered = {
    mode: 'centered' as const,
    x: (viewport.width - popover.width) / 2,
    y: (viewport.height - popover.height) / 2,
  };
  if (!target) return centered;

  const order = [preferred, OPPOSITE[preferred], ...SIDES.filter((s) => s !== preferred && s !== OPPOSITE[preferred])];
  const maxX = viewport.width - VIEWPORT_MARGIN;
  const maxY = viewport.height - VIEWPORT_MARGIN;
  const crossX = clamp(target.x + target.width / 2 - popover.width / 2, VIEWPORT_MARGIN, maxX - popover.width);
  const crossY = clamp(target.y + target.height / 2 - popover.height / 2, VIEWPORT_MARGIN, maxY - popover.height);

  for (const side of order) {
    if (side === 'bottom') {
      const y = target.y + target.height + POPOVER_GAP;
      if (y + popover.height <= maxY) return { mode: 'anchored', side, x: crossX, y };
    } else if (side === 'top') {
      const y = target.y - POPOVER_GAP - popover.height;
      if (y >= VIEWPORT_MARGIN) return { mode: 'anchored', side, x: crossX, y };
    } else if (side === 'right') {
      const x = target.x + target.width + POPOVER_GAP;
      if (x + popover.width <= maxX) return { mode: 'anchored', side, x, y: crossY };
    } else {
      const x = target.x - POPOVER_GAP - popover.width;
      if (x >= VIEWPORT_MARGIN) return { mode: 'anchored', side, x, y: crossY };
    }
  }
  return centered;
}
