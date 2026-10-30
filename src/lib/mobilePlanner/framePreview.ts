import type { FramedArtworkLayout } from '@/lib/frameStyles';

/** A rectangle as fractions of the framed artwork's outer box (origin top left). */
export interface PreviewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FramePreviewBoxes {
  /** Outer width / height, frame included. */
  aspect: number;
  /** Frame opening: the passepartout board, or the picture without one. */
  opening: PreviewRect;
  picture: PreviewRect;
}

/**
 * Where frame, passepartout and picture go in a flat preview, from the same layout the 3D scene
 * uses (`framedArtworkLayout`), so the preview shows the real proportions (optical centre included).
 */
export function framePreviewBoxes(layout: FramedArtworkLayout, pictureW: number, pictureH: number): FramePreviewBoxes {
  const outerW = layout.right - layout.left;
  const outerH = layout.top - layout.bottom;
  const rect = (centreY: number, w: number, h: number): PreviewRect => ({
    x: (-w / 2 - layout.left) / outerW,
    y: (layout.top - (centreY + h / 2)) / outerH,
    w: w / outerW,
    h: h / outerH,
  });
  return {
    aspect: outerW / outerH,
    opening: rect(layout.openingOffsetY, layout.openingWidth, layout.openingHeight),
    picture: rect(0, pictureW, pictureH),
  };
}
