import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import ExifParser from 'exif-parser';
import ffmpeg from 'fluent-ffmpeg';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, textureCompress, prune, quantize } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { authenticate, requireCurator, userCanAccessProject } from '../lib/middleware';
import { tryGenerateImageThumbnails } from '../lib/thumbnails';

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

// Hard cap on the raw upload size (multer-level), before per-type checks run.
// Overridable via env for deployments that need a different ceiling.
const UPLOAD_MAX_BYTES = (() => {
    const parsed = parseInt(process.env.UPLOAD_MAX_BYTES || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 2 * 1024 * 1024 * 1024; // default 2GB
})();

// Per-type file size limits
const SIZE_LIMITS: Record<string, number> = {
    image: 200 * 1024 * 1024,   // 200MB (increased from 10MB as client handles optimization)
    video: 2 * 1024 * 1024 * 1024, // 2GB (was Infinity — see SEC-01)
    model3d: 100 * 1024 * 1024, // 100MB (source formats are larger, output is compressed)
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
        .replace(/^-+|-+$/g, '') || 'file';

    // Unique prefix prevents different files with the same sanitized name from
    // overwriting each other on disk (SEC-04). Derived filenames (webp/mp4/thumb/glb)
    // are built from this stored filename in processImage/processVideo/processModel,
    // so they inherit the uniqueness automatically.
    const uniquePrefix = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

    cb(null, `${uniquePrefix}-${sanitizedTitle}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_MAX_BYTES }, // hard cap; per-type limits enforced in handler
  fileFilter: (req, file, cb) => {
      const type = detectAssetType(file.mimetype, file.originalname);
      if (type) {
          cb(null, true);
      } else {
          cb(new Error('Unsupported file type. Allowed: images, videos, 3D models (.glb, .fbx, .obj, .usdz, .stl, .dae, …)'));
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

uploadRouter.post('/', authenticate, requireCurator, (req, res, next) => {
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
  const folderIdRaw = req.body.folderId || req.query.folderId;
  if (projectId) {
      console.log(`[Upload] Processing upload for Project ID: ${projectId}${folderIdRaw ? `, Folder ID: ${folderIdRaw}` : ''}`);
  }

  // Resolve + validate projectId once, reused for the access check, folder
  // validation and duplicate detection below.
  let parsedProjectId: number | undefined = undefined;
  if (projectId) {
      parsedProjectId = parseInt(String(projectId), 10);
      if (isNaN(parsedProjectId)) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: 'Invalid projectId' });
      }

      // SEC-01: only owners, exhibition collaborators, or admins may upload into a project
      // (req.user is always set here — this handler runs after `authenticate`)
      const isAdmin = req.user!.role === 'admin';
      const canAccess = await userCanAccessProject(prisma, req.user!.userId, parsedProjectId, isAdmin);
      if (!canAccess) {
          fs.unlinkSync(req.file.path);
          return res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt' });
      }
  }

  // Validate folder belongs to project (if both provided)
  let folderId: number | undefined = undefined;
  if (folderIdRaw) {
      const parsed = parseInt(String(folderIdRaw), 10);
      if (isNaN(parsed)) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: 'Invalid folderId' });
      }
      const folder = await prisma.folder.findUnique({
          where: { id: parsed },
          select: { id: true, projectId: true },
      });
      if (!folder) {
          fs.unlinkSync(req.file.path);
          return res.status(404).json({ error: 'Folder not found' });
      }
      if (parsedProjectId !== undefined && folder.projectId !== parsedProjectId) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: 'Folder does not belong to this project' });
      }
      folderId = parsed;
  }

  const assetType = detectAssetType(req.file.mimetype, req.file.originalname) || 'image';

  // ── Duplicate detection (unless force=true) ──
  const force = req.body.force === 'true' || req.query.force === 'true';

  // UPL-01: optional client-computed hash/dimensions/dpi for images — validated
  // and used in place of server-side computation when present. The client now
  // uploads a resized copy, so the server can no longer derive these from the
  // uploaded file alone.
  const clientHashRaw = req.body.clientHash;
  const clientHash = typeof clientHashRaw === 'string' && /^[a-f0-9]{64}$/.test(clientHashRaw)
      ? clientHashRaw
      : undefined;

  const parsePositiveIntField = (raw: unknown, max: number): number | undefined => {
      if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
      const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
      return Number.isInteger(n) && n > 0 && n <= max ? n : undefined;
  };
  const parsePositiveNumberField = (raw: unknown, min: number, max: number): number | undefined => {
      if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
      const n = typeof raw === 'number' ? raw : parseFloat(raw);
      return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
  };

  const clientOriginalWidth = parsePositiveIntField(req.body.originalWidth, 100000);
  const clientOriginalHeight = parsePositiveIntField(req.body.originalHeight, 100000);
  const clientDpi = parsePositiveNumberField(req.body.dpi, 1, 2400);

  if (!force) {
      // UPL-02: stream the hash instead of reading the whole file into memory,
      // so large uploads don't block the event loop for other requests.
      const fileHash = clientHash ?? await streamFileHash(req.file.path);

      const existing = await prisma.asset.findFirst({
          where: {
              fileHash,
              projectId: parsedProjectId ?? null,
          },
          include: { artwork: true },
      });

      if (existing) {
          fs.unlinkSync(req.file.path);
          return res.status(409).json({
              duplicate: true,
              filename: req.file.originalname,
              existing,
          });
      }

      // Store hash on req for use in processX helpers via a side-channel
      (req as any)._fileHash = fileHash;
  } else if (clientHash) {
      // force=true skips duplicate detection but a validated client hash
      // should still be recorded as Asset.fileHash.
      (req as any)._fileHash = clientHash;
  }

  // Validate per-type size limit
  const sizeLimit = SIZE_LIMITS[assetType];
  if (req.file.size > sizeLimit) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
          error: `File too large. Max ${Math.round(sizeLimit / 1024 / 1024)}MB for ${assetType} files.`
      });
  }

  const fileHash: string | undefined = (req as any)._fileHash;

  try {
      if (assetType === 'image') {
          const asset = await processImage(req.file, projectId, folderId, fileHash, {
              width: clientOriginalWidth,
              height: clientOriginalHeight,
              dpi: clientDpi,
          });
          return res.json(asset);
      }

      if (assetType === 'video') {
          const asset = await processVideo(req.file, projectId, folderId, fileHash);
          return res.json(asset);
      }

      if (assetType === 'model3d') {
          const asset = await processModel(req.file, projectId, folderId, fileHash);
          return res.json(asset);
      }

  } catch (err) {
      console.error(`Error processing ${assetType}:`, err);
      res.status(500).json({ error: `Failed to process ${assetType} upload` });
  }
});

// ── Image processing (original pipeline) ──
interface ClientImageMeta {
    width?: number;
    height?: number;
    dpi?: number;
}

async function processImage(
    file: Express.Multer.File,
    projectId: string | undefined,
    folderId?: number,
    fileHash?: string,
    clientMeta?: ClientImageMeta,
) {
    let dimensions = { width: 0, height: 0 };
    let dpi = 72;

    const hasClientDims = clientMeta?.width !== undefined && clientMeta?.height !== undefined;

    if (hasClientDims) {
        // UPL-01: trust the client-supplied original dimensions/DPI — the
        // uploaded file itself may already be a resized copy.
        dimensions = { width: clientMeta!.width!, height: clientMeta!.height! };
        if (clientMeta?.dpi !== undefined) {
            dpi = clientMeta.dpi;
        }
    } else {
        // UPL-02: use sharp's metadata reader instead of loading the whole
        // buffer into memory just to measure it.
        const meta = await sharp(file.path).metadata();
        dimensions = { width: meta.width || 0, height: meta.height || 0 };
        if (meta.density) {
            dpi = meta.density;
        }
    }

    if (!hasClientDims || clientMeta?.dpi === undefined) {
        // Fall back to EXIF DPI when sharp density is missing / no client value given.
        try {
            const buffer = fs.readFileSync(file.path);
            const parser = ExifParser.create(buffer);
            const result = parser.parse();
            if (result && result.tags && result.tags.XResolution) {
                dpi = result.tags.XResolution;
            }
        } catch {
            // Ignore EXIF parsing errors
        }
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

    // LOAD-04: generate 256px/512px thumbnails. Best-effort — never fails the upload.
    const thumbnailPath = await tryGenerateImageThumbnails(newPath);

    return prisma.asset.create({
        data: {
            filename: path.basename(file.originalname, path.extname(file.originalname)),
            path: `/uploads/${newFilename}`,
            mimetype: 'image/webp',
            size: stats.size,
            type: 'image',
            width: dimensions.width,
            height: dimensions.height,
            dpi,
            thumbnailPath: thumbnailPath ?? undefined,
            fileHash,
            projectId: projectId ? parseInt(projectId as string, 10) : undefined,
            folderId,
            metadata: { widthCm, heightCm, projectId: projectId ? String(projectId) : undefined },
        }
    });
}

// UPL-02: stream a file's SHA-256 hash instead of reading it fully into memory.
function streamFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

// ── Video processing ──
async function processVideo(file: Express.Multer.File, projectId: string | undefined, folderId?: number, fileHash?: string) {
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
            filename: path.basename(file.originalname, path.extname(file.originalname)) + '.mp4',
            path: `/uploads/${mp4Filename}`,
            mimetype: 'video/mp4',
            size: stats.size,
            type: 'video',
            width: probe.width,
            height: probe.height,
            duration: Math.round(probe.duration * 10) / 10,
            thumbnailPath: hasThumbnail ? `/uploads/${thumbFilename}` : null,
            fileHash,
            projectId: projectId ? parseInt(projectId as string, 10) : undefined,
            folderId,
            metadata: { projectId: projectId ? String(projectId) : undefined },
        }
    });
}

// ── 3D Model processing ──

// Formats that can skip Assimp (already glTF-family)
const GLTF_FAMILY = new Set(['.glb', '.gltf']);

// Formats Assimp handles well
const ASSIMP_FORMATS = new Set([
    '.obj', '.fbx', '.dae', '.stl', '.ply', '.3ds', '.ase', '.blend',
]);

// Formats that need Blender as fallback (USDZ, or if Assimp fails)
const BLENDER_FALLBACK_FORMATS = new Set(['.usdz', '.usd']);

const execFileAsync = promisify(execFile);

/** Stage 1a: Convert non-glTF formats to raw GLB via Assimp */
async function convertWithAssimp(inputPath: string, outputPath: string): Promise<void> {
    try {
        await execFileAsync('assimp', ['export', inputPath, outputPath, '-ba', '-kac'], {
            timeout: 120_000,
        });
        console.log(`[Model] Assimp converted → ${outputPath}`);
    } catch (error: any) {
        throw new Error(`Assimp conversion failed: ${error.message}`);
    }
}

/** Stage 1b: Convert via Blender headless (fallback for USDZ, or when Assimp fails) */
async function convertWithBlender(inputPath: string, outputPath: string): Promise<void> {
    const script = `
import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
ext = "${path.extname(inputPath).toLowerCase()}"
if ext in (".usdz", ".usd"):
    bpy.ops.wm.usd_open(filepath="${inputPath.replace(/\\/g, '/')}")
elif ext == ".fbx":
    bpy.ops.import_scene.fbx(filepath="${inputPath.replace(/\\/g, '/')}")
elif ext == ".obj":
    bpy.ops.wm.obj_import(filepath="${inputPath.replace(/\\/g, '/')}")
elif ext == ".stl":
    bpy.ops.wm.stl_import(filepath="${inputPath.replace(/\\/g, '/')}")
elif ext == ".dae":
    bpy.ops.wm.collada_import(filepath="${inputPath.replace(/\\/g, '/')}")
elif ext == ".ply":
    bpy.ops.wm.ply_import(filepath="${inputPath.replace(/\\/g, '/')}")
else:
    print(f"Unsupported format: {ext}", file=sys.stderr)
    sys.exit(1)
bpy.ops.export_scene.gltf(filepath="${outputPath.replace(/\\/g, '/')}", export_format='GLB')
    `.trim();

    try {
        await execFileAsync('blender', ['--background', '--python-expr', script], {
            timeout: 180_000,
        });
        console.log(`[Model] Blender converted → ${outputPath}`);
    } catch (error: any) {
        throw new Error(`Blender conversion failed: ${error.message}`);
    }
}

/** Stage 2: Optimize GLB with gltf-transform (Draco compression, dedup, prune) */
async function optimizeGLB(inputPath: string, outputPath: string): Promise<{ before: number; after: number }> {
    const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
            'draco3d.decoder': await draco3d.createDecoderModule(),
            'draco3d.encoder': await draco3d.createEncoderModule(),
        });

    const document = await io.read(inputPath);
    const beforeSize = fs.statSync(inputPath).size;

    // Run optimization transforms
    await document.transform(
        dedup(),
        prune(),
        quantize(),
        draco(),
    );

    // Compress textures if sharp is available (already installed)
    try {
        await document.transform(
            textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80 }),
        );
    } catch (err) {
        console.warn('[Model] Texture compression skipped (no textures or error):', (err as Error).message);
    }

    await io.write(outputPath, document);
    const afterSize = fs.statSync(outputPath).size;

    console.log(`[Model] Optimized: ${(beforeSize / 1024).toFixed(0)}KB → ${(afterSize / 1024).toFixed(0)}KB (${((1 - afterSize / beforeSize) * 100).toFixed(0)}% reduction)`);
    return { before: beforeSize, after: afterSize };
}

/** Full pipeline: convert (if needed) → optimize → save */
async function processModel(file: Express.Multer.File, projectId: string | undefined, folderId?: number, fileHash?: string) {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.parse(file.filename).name;
    const isGLTF = GLTF_FAMILY.has(ext);

    console.log(`[Upload] Processing 3D model: ${file.originalname} (${ext})`);

    // ── Stage 1: Convert to raw GLB ──
    let rawGlbPath = file.path;

    if (!isGLTF) {
        const rawGlbFilename = `${baseName}-raw.glb`;
        rawGlbPath = path.join(uploadDir, rawGlbFilename);

        let converted = false;

        // Try Assimp first for supported formats
        if (ASSIMP_FORMATS.has(ext)) {
            try {
                await convertWithAssimp(file.path, rawGlbPath);
                converted = true;
            } catch (err) {
                console.warn(`[Model] Assimp failed for ${ext}, trying Blender fallback...`, (err as Error).message);
            }
        }

        // Blender fallback for USDZ or when Assimp fails
        if (!converted) {
            try {
                await convertWithBlender(file.path, rawGlbPath);
                converted = true;
            } catch (err) {
                // Clean up
                if (fs.existsSync(rawGlbPath)) fs.unlinkSync(rawGlbPath);
                throw new Error(
                    `Could not convert ${ext} file. ` +
                    (BLENDER_FALLBACK_FORMATS.has(ext)
                        ? 'Ensure Blender is installed on the server.'
                        : 'Ensure assimp and/or Blender are installed on the server.')
                );
            }
        }

        // Remove original upload
        fs.unlinkSync(file.path);
    }

    // ── Stage 2: Optimize with gltf-transform ──
    const optimizedFilename = `${baseName}.glb`;
    const optimizedPath = path.join(uploadDir, optimizedFilename);

    let compressionStats = { before: 0, after: 0 };
    try {
        compressionStats = await optimizeGLB(rawGlbPath, optimizedPath);

        // Remove raw intermediate if it's different from the optimized output
        if (rawGlbPath !== optimizedPath && fs.existsSync(rawGlbPath)) {
            fs.unlinkSync(rawGlbPath);
        }
    } catch (err) {
        console.warn('[Model] Optimization failed, using unoptimized GLB:', (err as Error).message);
        // Fall back to the raw GLB
        if (rawGlbPath !== optimizedPath) {
            fs.renameSync(rawGlbPath, optimizedPath);
        }
    }

    const stats = fs.statSync(optimizedPath);

    return prisma.asset.create({
        data: {
            filename: path.basename(file.originalname, ext) + '.glb',
            path: `/uploads/${optimizedFilename}`,
            mimetype: 'model/gltf-binary',
            size: stats.size,
            type: 'model3d',
            width: null,
            height: null,
            dpi: null,
            fileHash,
            projectId: projectId ? parseInt(projectId as string, 10) : undefined,
            folderId,
            metadata: {
                projectId: projectId ? String(projectId) : undefined,
                originalFormat: ext.slice(1),
                originalSize: compressionStats.before || undefined,
                optimizedSize: compressionStats.after || undefined,
            },
        }
    });
}
