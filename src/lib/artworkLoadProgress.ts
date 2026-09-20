import { useSyncExternalStore } from 'react';

/**
 * How many artworks already show a picture (their first, lowest texture tier), published by
 * ArtworkTextureProvider once per frame. The viewer keeps its entry overlay up until every
 * artwork is there, so nobody walks into a room of empty frames.
 */
export interface ArtworkLoadProgress {
    /** Artworks with a texture, or with no source left to try. */
    settled: number;
    total: number;
}

const EMPTY: ArtworkLoadProgress = { settled: 0, total: 0 };

let progress: ArtworkLoadProgress = EMPTY;
const listeners = new Set<() => void>();

export function setArtworkLoadProgress(next: ArtworkLoadProgress): void {
    if (next.settled === progress.settled && next.total === progress.total) return;
    progress = next;
    for (const listener of listeners) listener();
}

/** Call when a Canvas with artworks unmounts, so a later one starts from zero. */
export function resetArtworkLoadProgress(): void {
    setArtworkLoadProgress(EMPTY);
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useArtworkLoadProgress(): ArtworkLoadProgress {
    return useSyncExternalStore(subscribe, () => progress, () => EMPTY);
}
