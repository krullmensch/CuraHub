/** Colours and sizes of the 2D wall editor overlay. */
export const WE_COLORS = {
    select: '#3b82f6',
    hover: '#60a5fa',
    measure: '#f43f5e',
    spacing: '#ec4899',
    guide: '#22d3ee',
    hanging: '#f59e0b',
    warning: '#f97316',
    overlap: '#ef4444',
    wallEdge: 'rgba(255,255,255,0.55)',
    floor: 'rgba(255,255,255,0.45)',
    rulerBg: 'rgba(24,24,27,0.94)',
    rulerTick: 'rgba(255,255,255,0.28)',
    rulerText: 'rgba(255,255,255,0.55)',
} as const;

export const WE_FONT = '"Albert Sans", system-ui, sans-serif';
export const PILL_FONT_SIZE = 10.5;
export const PILL_HEIGHT = 16;

/** Pixel distance within which dragged artworks snap. */
export const SNAP_PX = 6;
/** Pixel distance within which a guide can be grabbed. */
export const GUIDE_HIT_PX = 4;
