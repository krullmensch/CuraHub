import path from 'path';
import { SPLAT_ONLY_EXTENSIONS } from './splats';

/** Kind of asset an upload becomes. Mirrored by src/lib/uploadFiles.ts on the client. */
export type AssetType = 'image' | 'video' | 'model3d' | 'splat' | 'book';

// Supported 3D model formats
export const MODEL_EXTENSIONS = [
    '.glb', '.gltf',                    // glTF (recommended)
    '.obj', '.mtl',                     // Wavefront OBJ
    '.fbx',                             // Autodesk FBX
    '.dae',                             // COLLADA
    '.stl',                             // STL (stereolithography)
    '.ply',                             // Stanford Polygon Library
    '.3ds',                             // 3DS Max
    '.ase',                             // ASCII Scene Export
    '.blend',                           // Blender (via Assimp)
    '.usdz', '.usd',                    // USD/USDZ
    '.glb2', '.gltf2',                  // glTF 2.0 variants
];

// Video containers ffmpeg transcodes to MP4. Matched by extension: browsers send an empty type or
// application/octet-stream for Matroska (.mkv) and sometimes for others.
export const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi'];

// `.ply` is detected as 'model3d' here; handleStoredUpload looks into the header and turns
// Gaussian splat PLYs into 'splat' (see lib/splats).
export function detectAssetType(mimetype: string, filename: string): AssetType | null {
    const ext = path.extname(filename).toLowerCase();
    // Books: the upload handler also checks the %PDF- signature (lib/pdfGeometry).
    if (ext === '.pdf') return 'book';
    if (SPLAT_ONLY_EXTENSIONS.includes(ext)) return 'splat';
    if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (MODEL_EXTENSIONS.includes(ext)) return 'model3d';
    // Browsers often send application/octet-stream for binary formats
    if (mimetype === 'application/octet-stream' && MODEL_EXTENSIONS.includes(ext)) return 'model3d';
    return null;
}
