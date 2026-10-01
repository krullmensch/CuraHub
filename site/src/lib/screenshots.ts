import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/screenshots/*.png', { eager: true });

/** The screenshot with this name, or undefined while it has not been captured yet. */
export function shot(name: string): ImageMetadata | undefined {
    return files[`../assets/screenshots/${name}.png`]?.default;
}
