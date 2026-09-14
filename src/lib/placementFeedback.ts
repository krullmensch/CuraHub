/**
 * Why the current drag position is not a valid placement. Written by ArtworkPlacement every frame
 * while dragging, read by EditorPage's drop handler to explain a rejected drop.
 */
export type PlacementIssue = 'no-surface' | 'not-floor' | 'not-vertical' | 'unlocked-wall';

export const placementFeedback: { issue: PlacementIssue | null } = { issue: null };

export interface PlacementResult {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
    wallId: number | null;
}

/**
 * Raycasts a drag position (NDC) and publishes ghost + valid placement. Registered by
 * ArtworkPlacement, called by EditorPage's DOM dragover/drop handlers so a drop doesn't depend on
 * a rendered frame since the last dragover (Firefox can hold back rendering during native drags).
 */
export const placementResolver: { resolve: ((ndc: { x: number; y: number }) => PlacementResult | null) | null } = { resolve: null };
