import * as THREE from 'three';

/**
 * Extra layer of the meshes that show an artwork's image or video. The room ambient occlusion
 * renders only this layer into a mask, so photos and videos keep their colours while the wall and
 * the frame around them get darker (spec docs/superpowers/specs/2026-11-16-raum-ao-design.md).
 * Layer 0 stays on, so these meshes render and raycast as before.
 */
export const ARTWORK_SURFACE_LAYER = 5;

/** Layers of an artwork surface (0 + ARTWORK_SURFACE_LAYER), for R3F's `layers` prop. */
export const ARTWORK_SURFACE_LAYERS = new THREE.Layers();
ARTWORK_SURFACE_LAYERS.enable(ARTWORK_SURFACE_LAYER);

export function markArtworkSurface(object: THREE.Object3D): void {
    object.layers.enable(ARTWORK_SURFACE_LAYER);
}
