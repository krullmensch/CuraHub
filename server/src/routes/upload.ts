import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { imageSize } from 'image-size';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import ExifParser from 'exif-parser';
import ffmpeg from 'fluent-ffmpeg';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const uploadRouter = Router();
const prisma = new PrismaClient();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Detect asset type from mimetype + extension
// Supported 3D model formats
const MODEL_EXTENSIONS = [
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

function detectAssetType(mimetype: string, filename: string): 'image' | 'video' | 'model3d' | null {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    const ext = path.extname(filename).toLowerCase();
    if (MODEL_EXTENSIONS.includes(ext)) return 'model3d';
    // Browsers often send application/octet-stream for binary formats
    if (mimetype === 'application/octet-stream' && MODEL_EXTENSIONS.includes(ext)) return 'model3d';
    return null;
}

// Per-type file size limits
const SIZE_LIMITS: Record<string, number> = {
    image: 200 * 1024 * 1024,   // 200MB (increased from 10MB as client handles optimization)
    video: 200 * 1024 * 1024,   // 200MB
    model3d: 50 * 1024 * 1024,  // 50MB
};

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);

    // Sanitize filename: remove special chars, replace spaces with hyphens
    const sanitizedTitle = basename
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const uniqueSuffix = `${Date.now().toString().slice(-6)}-${uuidv4().split('-')[0]}`;

    cb(null, `${sanitizedTitle}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max (validated per-type in handler)
  fileFilter: (req, file, cb) => {
      const type = detectAssetType(file.mimetype, file.originalname);
      if (type) {
          cb(null, true);
      } else {
          cb(new Error('Unsupported file type. Allowed: images, videos, 3D models (.glb/.gltf)'));
      }
  }
});

// Helper: probe video metadata with ffprobe
function probeVideo(filePath: string): Promise<{ width: number; height: number; duration: number }> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            resolve({
                width: videoStream?.width || 0,
                height: videoStream?.height || 0,
                duration: metadata.format.duration || 0,
            });
        });
    });
}

// Helper: transcode video to H.264 MP4
function transcodeVideo(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-c:v libx264',
                '-preset fast',
                '-crf 23',
                '-c:a aac',
                '-b:a 128k',
                '-movflags +faststart',
            ])
            .output(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
    });
}

// Helper: extract poster frame from video
function extractThumbnail(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .screenshots({
                count: 1,
                timestamps: ['00:00:00.500'],
                filename: path.basename(outputPath),
                folder: path.dirname(outputPath),
                size: '640x?',
            })
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });
}

uploadRouter.post('/', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ error: `Upload error: ${err.message}` });
            }
            return res.status(400).json({ error: err.message || 'Upload failed' });
        }
        next();
    });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const projectId = req.body.projectId || req.query.projectId;
  if (projectId) {
      console.log(`[Upload] Processing upload for Project ID: ${projectId}`);
  }

  const assetType = detectAssetType(req.file.mimetype, req.file.originalname) || 'image';

  // Validate per-type size limit
  const sizeLimit = SIZE_LIMITS[assetType];
  if (req.file.size > sizeLimit) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
          error: `File too large. Max ${Math.round(sizeLimit / 1024 / 1024)}MB for ${assetType} files.`
      });
  }

  try {
      if (assetType === 'image') {
          // ── IMAGE PROCESSING (existing pipeline, unchanged) ──
          const asset = await processImage(req.file, projectId);
          return res.json(asset);
      }

      if (assetType === 'video') {
          // ── VIDEO PROCESSING ──
          const asset = await processVideo(req.file, projectId);
          return res.json(asset);
      }

      if (assetType === 'model3d') {
          // ── 3D MODEL (store as-is) ──
          const asset = await processModel(req.file, projectId);
          return res.json(asset);
      }

  } catch (err) {
      console.error(`Error processing ${assetType}:`, err);
      res.status(500).json({ error: `Failed to process ${assetType} upload` });
  }
});

// ── Image processing (original pipeline) ──
async function processImage(file: Express.Multer.File, projectId: string | undefined) {
    const buffer = fs.readFileSync(file.path);

    let dimensions = { width: 0, height: 0 };
    let dpi = 72;

    const size = imageSize(buffer);
    if (size) {
        dimensions = { width: size.width || 0, height: size.height || 0 };
    }

    try {
        const parser = ExifParser.create(buffer);
        const result = parser.parse();
        if (result && result.tags && result.tags.XResolution) {
            dpi = result.tags.XResolution;
        }
    } catch {
        // Ignore EXIF parsing errors
    }

    const widthCm = dimensions.width > 0 ? parseFloat(((dimensions.width / dpi) * 2.54).toFixed(1)) : 0;
    const heightCm = dimensions.height > 0 ? parseFloat(((dimensions.height / dpi) * 2.54).toFixed(1)) : 0;

    // Convert to WebP
    const newFilename = file.filename.split('.')[0] + '.webp';
    const newPath = path.join(path.dirname(file.path), newFilename);

    await sharp(file.path)
        .rotate()
        .resize({ width: 2500, height: 2500, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(newPath);

    fs.unlinkSync(file.path);

    const stats = fs.statSync(newPath);

    return prisma.asset.create({
        data: {
            filename: newFilename,
            path: `/uploads/${newFilename}`,
            mimetype: 'image/webp',
            size: stats.size,
            type: 'image',
            width: dimensions.width,
            height: dimensions.height,
            dpi,
            projectId: projectId ? parseInt(projectId as string, 10) : undefined,
            metadata: { widthCm, heightCm, projectId: projectId ? String(projectId) : undefined },
        }
    });
}

// ── Video processing ──
async function processVideo(file: Express.Multer.File, projectId: string | undefined) {
    console.log(`[Upload] Transcoding video: ${file.originalname}`);

    // Probe original for metadata
    const probe = await probeVideo(file.path);

    // Transcode to H.264 MP4
    const baseName = file.filename.replace(/\.[^.]+$/, '');
    const mp4Filename = baseName + '.mp4';
    const mp4Path = path.join(uploadDir, mp4Filename);

    // Only transcode if not already MP4
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.mp4') {
        // Already MP4 — just ensure it's at the right path
        if (file.path !== mp4Path) {
            fs.renameSync(file.path, mp4Path);
        }
    } else {
        await transcodeVideo(file.path, mp4Path);
        fs.unlinkSync(file.path);
    }

    // Extract poster thumbnail
    const thumbFilename = file.filename.split('.')[0] + '-thumb.jpg';
    const thumbPath = path.join(uploadDir, thumbFilename);
    try {
        await extractThumbnail(mp4Path, thumbPath);
    } catch (err) {
        console.warn('[Upload] Thumbnail extraction failed, continuing without:', err);
    }

    const stats = fs.statSync(mp4Path);
    const hasThumbnail = fs.existsSync(thumbPath);

    return prisma.asset.create({
        data: {
            filename: mp4Filename,
            path: `/uploads/${mp4Filename}`,
            mimetype: 'video/mp4',
            size: stats.size,
            type: 'video',
            width: probe.width,
            height: probe.height,
            duration: Math.round(probe.duration * 10) / 10,
            thumbnailPath: hasThumbnail ? `/uploads/${thumbFilename}` : null,
            projectId: projectId ? parseInt(projectId as string, 10) : undefined,
            metadata: { projectId: projectId ? String(projectId) : undefined },
        }
    });
}

// ── 3D Model processing ──
async function convertModelToGLB(inputPath: string, outputPath: string): Promise<void> {
    const execFileAsync = promisify(execFile);
    try {
        // Use assimp to convert to GLB
        // -ai_config=FBX_PRESERVE_PIVOTS 0 helps with FBX pivot issues
        // FbxExportMode=0 for FBX exports
        await execFileAsync('assimp', ['export', inputPath, outputPath, '-ba', '-kac']);
        console.log(`[Model] Converted to GLB: ${outputPath}`);
    } catch (error: any) {
        console.error(`[Model] Conversion failed:`, error.message);
        throw new Error(`Failed to convert 3D model: ${error.message}. Ensure 'assimp' is installed on your system.`);
    }
}

async function processModel(file: Express.Multer.File, projectId: string | undefined) {
    const ext = path.extname(file.originalname).toLowerCase();
    const isGLB = ext === '.glb';

    console.log(`[Upload] Processing 3D model: ${file.originalname}`);

    let finalFilename = file.filename;
    let finalPath = file.path;

    // Convert to GLB if not already
    if (!isGLB) {
        const glbFilename = `${path.parse(file.filename).name}.glb`;
        const glbPath = path.join(uploadDir, glbFilename);

        try {
            await convertModelToGLB(file.path, glbPath);
            finalFilename = glbFilename;
            finalPath = glbPath;

            // Delete original file to save space
            fs.unlinkSync(file.path);
            console.log(`[Upload] Deleted original model file: ${file.path}`);
        } catch (error) {
            // Clean up converted file on error
            if (fs.existsSync(glbPath)) {
                fs.unlinkSync(glbPath);
            }
            throw error;
        }
    }

    const stats = fs.statSync(finalPath);

    return prisma.asset.create({
        data: {
            filename: finalFilename,
            path: `/uploads/${finalFilename}`,
            mimetype: 'model/gltf-binary',
            size: stats.size,
            type: 'model3d',
            width: null,
            height: null,
            dpi: null,
            projectId: projectId ? parseInt(projectId as string, 10) : undefined,
            metadata: {
                projectId: projectId ? String(projectId) : undefined,
                originalFormat: ext.slice(1),
            },
        }
    });
}
