/** Extensions of files that can become an artwork (see server/src/lib/artworkTitle.ts). */
const MEDIA_EXTENSION_RE = /\.(webp|jpe?g|png|tiff?|gif|avif|heic|mp4|m4v|mov|webm|glb|gltf|obj|fbx|ply|spz|splat|ksplat)$/i;

/**
 * Artworks created by dropping an asset are titled after the file. Older ones kept the
 * extension (`Foto-9.webp`), which reads like a filename and never belongs on a wall label,
 * so it is dropped when a title is shown. Titles the curator typed are left alone.
 */
export function displayArtworkTitle(title: string): string {
    return title.replace(MEDIA_EXTENSION_RE, '');
}
