/** Extensions of files that can become an artwork (mirrors src/lib/artworkTitle.ts). */
const MEDIA_EXTENSION_RE = /\.(webp|jpe?g|png|tiff?|gif|avif|heic|mp4|m4v|mov|webm|glb|gltf|obj|fbx|ply|sog|spz|splat|ksplat)$/i;

/** Title for an artwork created from a file: the filename without its extension. */
export function artworkTitleFromFilename(filename: string): string {
    return filename.replace(MEDIA_EXTENSION_RE, '') || filename;
}
