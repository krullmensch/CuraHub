import { createContext } from 'react';
import type { ArtworkTextureManager } from './artworkTextureManager';

/** Provided by ArtworkTextureProvider inside the R3F tree (one manager per Canvas). */
export const ArtworkTextureContext = createContext<ArtworkTextureManager | null>(null);
