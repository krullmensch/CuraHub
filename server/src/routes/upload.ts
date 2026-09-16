import { Router, type Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { z } from 'zod';
import ExifParser from 'exif-parser';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, textureCompress, prune, quantize } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { authenticate, requireCurator, userCanAccessProject } from '../lib/middleware';
import { tryGenerateImageThumbnails } from '../lib/thumbnails';
import { enqueueVideoJob } from '../lib/videoJobs';
import { CHUNK_MAX_BYTES, CHUNK_SIZE_BYTES, ChunkedUploadStore } from '../lib/chunkedUploads';
import { SPLAT_ONLY_EXTENSIONS, inspectSplatFile, type SplatInspection } from '../lib/splats';

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

type AssetType = 'image' | 'video' | 'model3d' | 'splat';

// `.ply` is detected as 'model3d' here; handleStoredUpload looks into the header and turns
// Gaussian splat PLYs into 'splat' (see lib/splats).
function detectAssetType(mimetype: string, filename: string): AssetType | null {
    const ext = path.extname(filename).toLowerCase();
    if (SPLAT_ONLY_EXTENSIONS.includes(ext)) return 'splat';
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
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
    splat: 1024 * 1024 * 1024, // 1GB (uncompressed PLY captures; stored as uploaded)
};

/** Size limit before the file's content is known: a `.ply` may still turn out to be a splat. */
function preliminarySizeLimit(assetType: AssetType, filename: string): number {
    const isPly = path.extname(filename).toLowerCase() === '.ply';
    return isPly ? Math.max(SIZE_LIMITS.model3d, SIZE_LIMITS.splat) : SIZE_LIMITS[assetType];
}

// Stored filename for an upload. Unique prefix prevents different files with the same
// sanitized name from overwriting each other on disk (SEC-04). Derived filenames
// (webp/mp4/thumb/glb) are built from this stored filename in processImage/processVideo/
// processModel, so they inherit the uniqueness automatically.
function makeStoredFilename(originalname: string): string {
    const ext = path.extname(originalname);
    const basename = path.basename(originalname, ext);

    // Sanitize filename: remove special chars, replace spaces with hyphens
    const sanitizedTitle = basename
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'file';
    const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, '');

    const uniquePrefix = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    return `${uniquePrefix}-${sanitizedTitle}${safeExt}`;
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, makeStoredFilename(file.originalname));
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
          cb(new Error('Unsupported file type. Allowed: images, videos, 3D models (.glb, .fbx, .obj, .usdz, .stl, .dae, …), Gaussian splats (.ply, .spz, .splat, .ksplat)'));
      }
  }
});

type UploadFields = Record<string, unknown>;

/** A file already stored in the uploads dir — from multer or an assembled chunked upload. */
type StoredFile = Pick<Express.Multer.File, 'path' | 'filename' | 'originalname' | 'mimetype' | 'size'>;

interface UploadResult {
    status: number;
    body: unknown;
}

const fieldString = (raw: unknown): string | undefined => {
    if (typeof raw === 'string' && raw !== '') return raw;
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    return undefined;
};

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
  // req.user is always set here — this handler runs after `authenticate`.
  const result = await handleStoredUpload(req.user!, req.file, {
      ...(req.query as UploadFields),
      ...(req.body as UploadFields),
  });
  res.status(result.status).json(result.body);
});

// ── Chunked uploads (VID-03) ──
// Cloudflare rejects request bodies > 100 MB. Large files are uploaded as
//   POST /upload/chunks                  → { uploadId, chunkSize }
//   PUT  /upload/chunks/:id?offset=N     (raw bytes, sequential) → { received }
//   POST /upload/chunks/:id/complete     → same response as POST /upload
//   DELETE /upload/chunks/:id            (abort)
const chunkedUploads = new ChunkedUploadStore(uploadDir);

const CHUNK_FIELD_KEYS = ['projectId', 'folderId', 'force', 'clientHash', 'originalWidth', 'originalHeight', 'dpi'] as const;

const chunkInitSchema = z.object({
    filename: z.string().min(1).max(255),
    size: z.number().int().positive(),
    mimetype: z.string().max(255).optional(),
    fields: z.record(z.string(), z.union([z.string().max(200), z.number()])).optional(),
});

uploadRouter.post('/chunks', authenticate, requireCurator, async (req: Request, res) => {
    const parsed = chunkInitSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Ungültige Upload-Anfrage' });
    }
    const { filename, size } = parsed.data;
    const mimetype = parsed.data.mimetype || 'application/octet-stream';

    const assetType = detectAssetType(mimetype, filename);
    if (!assetType) {
        return res.status(400).json({ error: 'Unsupported file type. Allowed: images, videos, 3D models (.glb, .fbx, .obj, .usdz, .stl, .dae, …), Gaussian splats (.ply, .spz, .splat, .ksplat)' });
    }
    const sizeLimit = Math.min(preliminarySizeLimit(assetType, filename), UPLOAD_MAX_BYTES);
    if (size > sizeLimit) {
        return res.status(400).json({
            error: `File too large. Max ${Math.round(sizeLimit / 1024 / 1024)}MB for ${assetType} files.`
        });
    }

    const fields: Record<string, string> = {};
    for (const key of CHUNK_FIELD_KEYS) {
        const value = fieldString(parsed.data.fields?.[key]);
        if (value !== undefined) fields[key] = value;
    }

    // Check project access before accepting gigabytes of data (checked again on complete).
    if (fields.projectId) {
        const projectId = parseInt(fields.projectId, 10);
        const canAccess = !isNaN(projectId)
            && await userCanAccessProject(prisma, req.user!.userId, projectId, req.user!.role === 'admin');
        if (!canAccess) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt' });
        }
    }

    const session = chunkedUploads.create({
        userId: req.user!.userId,
        originalname: filename,
        mimetype,
        size,
        storedFilename: makeStoredFilename(filename),
        fields,
    });
    if (!session) {
        return res.status(429).json({ error: 'Zu viele gleichzeitige Uploads' });
    }
    res.json({ uploadId: session.id, chunkSize: CHUNK_SIZE_BYTES });
});

uploadRouter.put('/chunks/:id', authenticate, requireCurator, async (req: Request, res) => {
    const session = chunkedUploads.get(String(req.params.id), req.user!.userId);
    if (!session || session.result) {
        return res.status(404).json({ error: 'Upload-Sitzung nicht gefunden' });
    }
    const offset = Number(req.query.offset);
    // offset < received: a retry of a chunk whose response got lost — rewrite from there.
    if (session.busy || !Number.isInteger(offset) || offset < 0 || offset > session.received) {
        return res.status(409).json({ error: 'Offset passt nicht', received: session.received });
    }

    session.busy = true;
    const limit = Math.min(CHUNK_MAX_BYTES, session.size - offset);
    let written = 0;
    try {
        await fs.promises.truncate(session.partialPath, offset);
        const counter = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                written += chunk.length;
                if (written > limit) callback(new Error('CHUNK_TOO_LARGE'));
                else callback(null, chunk);
            },
        });
        await pipeline(req, counter, fs.createWriteStream(session.partialPath, { flags: 'r+', start: offset }));
        if (written === 0) throw new Error('EMPTY_CHUNK');
        session.received = offset + written;
        res.json({ received: session.received });
    } catch (err) {
        // Drop whatever part of this chunk made it to disk; the client retries from `received`.
        await fs.promises.truncate(session.partialPath, offset).catch(() => undefined);
        session.received = offset;
        const message = (err as Error).message;
        if (!res.headersSent) {
            res.status(message === 'CHUNK_TOO_LARGE' ? 413 : 400).json({ error: 'Chunk konnte nicht gespeichert werden', received: session.received });
        }
    } finally {
        session.busy = false;
        session.updatedAt = Date.now();
    }
});

uploadRouter.post('/chunks/:id/complete', authenticate, requireCurator, async (req: Request, res) => {
    const session = chunkedUploads.get(String(req.params.id), req.user!.userId);
    if (!session) {
        return res.status(404).json({ error: 'Upload-Sitzung nicht gefunden' });
    }
    if (session.result) {
        return res.status(session.result.status).json(session.result.body);
    }
    if (session.busy || session.received !== session.size) {
        return res.status(409).json({ error: 'Upload unvollständig', received: session.received });
    }

    session.busy = true;
    try {
        const storedPath = path.join(uploadDir, session.storedFilename);
        await fs.promises.rename(session.partialPath, storedPath);
        session.result = await handleStoredUpload(req.user!, {
            path: storedPath,
            filename: session.storedFilename,
            originalname: session.originalname,
            mimetype: session.mimetype,
            size: session.size,
        }, session.fields);
    } catch (err) {
        console.error('[Upload] Completing chunked upload failed:', err);
        session.result = { status: 500, body: { error: 'Upload konnte nicht abgeschlossen werden' } };
    } finally {
        session.busy = false;
        session.updatedAt = Date.now();
    }
    res.status(session.result.status).json(session.result.body);
});

uploadRouter.delete('/chunks/:id', authenticate, requireCurator, (req: Request, res) => {
    const session = chunkedUploads.get(String(req.params.id), req.user!.userId);
    if (session && !session.busy && !session.result) chunkedUploads.remove(session.id);
    res.status(204).end();
});

/** Validates, de-duplicates and processes a stored upload. Removes the file when rejected. */
async function handleStoredUpload(
    user: NonNullable<Request['user']>,
    file: StoredFile,
    fields: UploadFields,
): Promise<UploadResult> {
  const discard = () => fs.rmSync(file.path, { force: true });

  const projectId = fieldString(fields.projectId);
  const folderIdRaw = fieldString(fields.folderId);
  if (projectId) {
      console.log(`[Upload] Processing upload for Project ID: ${projectId}${folderIdRaw ? `, Folder ID: ${folderIdRaw}` : ''}`);
  }

  // Resolve + validate projectId once, reused for the access check, folder
  // validation and duplicate detection below.
  let parsedProjectId: number | undefined = undefined;
  if (projectId) {
      parsedProjectId = parseInt(projectId, 10);
      if (isNaN(parsedProjectId)) {
          discard();
          return { status: 400, body: { error: 'Invalid projectId' } };
      }

      // SEC-01: only owners, exhibition collaborators, or admins may upload into a project
      const canAccess = await userCanAccessProject(prisma, user.userId, parsedProjectId, user.role === 'admin');
      if (!canAccess) {
          discard();
          return { status: 403, body: { error: 'Kein Zugriff auf dieses Projekt' } };
      }
  }

  // Validate folder belongs to project (if both provided)
  let folderId: number | undefined = undefined;
  if (folderIdRaw) {
      const parsed = parseInt(folderIdRaw, 10);
      if (isNaN(parsed)) {
          discard();
          return { status: 400, body: { error: 'Invalid folderId' } };
      }
      const folder = await prisma.folder.findUnique({
          where: { id: parsed },
          select: { id: true, projectId: true },
      });
      if (!folder) {
          discard();
          return { status: 404, body: { error: 'Folder not found' } };
      }
      if (parsedProjectId !== undefined && folder.projectId !== parsedProjectId) {
          discard();
          return { status: 400, body: { error: 'Folder does not belong to this project' } };
      }
      folderId = parsed;
  }

  let assetType: AssetType = detectAssetType(file.mimetype, file.originalname) || 'image';

  // Gaussian splats: validate the file and tell splat PLYs from mesh PLYs.
  let splat: SplatInspection | null = null;
  const ext = path.extname(file.originalname).toLowerCase();
  if (assetType === 'splat' || ext === '.ply') {
      try {
          splat = await inspectSplatFile(file.path, ext, file.size);
      } catch (err) {
          discard();
          return { status: 400, body: { error: (err as Error).message || 'Ungültige Splat-Datei' } };
      }
      if (splat) assetType = 'splat';
  }

  // Validate per-type size limit (before hashing — no point hashing a rejected file)
  const sizeLimit = SIZE_LIMITS[assetType];
  if (file.size > sizeLimit) {
      discard();
      return {
          status: 400,
          body: { error: `File too large. Max ${Math.round(sizeLimit / 1024 / 1024)}MB for ${assetType} files.` },
      };
  }

  // ── Duplicate detection (unless force=true) ──
  const force = fields.force === 'true' || fields.force === true;

  // UPL-01: optional client-computed hash/dimensions/dpi for images — validated
  // and used in place of server-side computation when present. The client now
  // uploads a resized copy, so the server can no longer derive these from the
  // uploaded file alone.
  const clientHashRaw = fields.clientHash;
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

  const clientOriginalWidth = parsePositiveIntField(fields.originalWidth, 100000);
  const clientOriginalHeight = parsePositiveIntField(fields.originalHeight, 100000);
  const clientDpi = parsePositiveNumberField(fields.dpi, 1, 2400);

  let fileHash: string | undefined;
  if (!force) {
      // UPL-02: stream the hash instead of reading the whole file into memory,
      // so large uploads don't block the event loop for other requests.
      fileHash = clientHash ?? await streamFileHash(file.path);

      const existing = await prisma.asset.findFirst({
          where: {
              fileHash,
              projectId: parsedProjectId ?? null,
          },
          include: { artwork: true },
      });

      if (existing) {
          discard();
          return {
              status: 409,
              body: { duplicate: true, filename: file.originalname, existing },
          };
      }
  } else if (clientHash) {
      // force=true skips duplicate detection but a validated client hash
      // should still be recorded as Asset.fileHash.
      fileHash = clientHash;
  }

  try {
      if (assetType === 'image') {
          const asset = await processImage(file, projectId, folderId, fileHash, {
              width: clientOriginalWidth,
              height: clientOriginalHeight,
              dpi: clientDpi,
          });
          return { status: 200, body: asset };
      }

      if (assetType === 'video') {
          const asset = await processVideo(file, projectId, folderId, fileHash);
          return { status: 200, body: asset };
      }

      if (assetType === 'splat' && splat) {
          const asset = await processSplat(file, splat, projectId, folderId, fileHash);
          return { status: 200, body: asset };
      }

      const asset = await processModel(file, projectId, folderId, fileHash);
      return { status: 200, body: asset };
  } catch (err) {
      console.error(`Error processing ${assetType}:`, err);
      discard();
      return { status: 500, body: { error: `Failed to process ${assetType} upload` } };
  }
}

// ── Gaussian splats: stored as uploaded, decoded in the browser ──
async function processSplat(file: StoredFile, splat: SplatInspection, projectId: string | undefined, folderId?: number, fileHash?: string) {
    console.log(`[Upload] Gaussian splat: ${file.originalname} (${splat.format}, ${splat.splatCount ?? '?'} splats)`);
    return prisma.asset.create({
        data: {
            filename: file.originalname,
            path: `/uploads/${file.filename}`,
            mimetype: 'application/octet-stream',
            size: file.size,
            type: 'splat',
            width: null,
            height: null,
            dpi: null,
            fileHash,
            projectId: projectId ? parseInt(projectId, 10) : undefined,
            folderId,
            metadata: {
                projectId: projectId ? String(projectId) : undefined,
                splatFormat: splat.format,
                splatCount: splat.splatCount ?? undefined,
            },
        },
    });
}

// ── Image processing (original pipeline) ──
interface ClientImageMeta {
    width?: number;
    height?: number;
    dpi?: number;
}

async function processImage(
    file: StoredFile,
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
// VID-03: transcoding happens in a background job (lib/videoJobs.ts). The asset is created
// right away with status "processing" and the target path; the original stays in the uploads
// dir (metadata.sourceFile) until the job replaced it with the web MP4.
async function processVideo(file: StoredFile, projectId: string | undefined, folderId?: number, fileHash?: string) {
    const baseName = file.filename.replace(/\.[^.]+$/, '');
    const mp4Filename = baseName + '.mp4';

    const asset = await prisma.asset.create({
        data: {
            filename: path.basename(file.originalname, path.extname(file.originalname)) + '.mp4',
            path: `/uploads/${mp4Filename}`,
            mimetype: 'video/mp4',
            size: file.size,
            type: 'video',
            width: 0,
            height: 0,
            duration: 0,
            thumbnailPath: null,
            status: 'processing',
            fileHash,
            projectId: projectId ? parseInt(projectId as string, 10) : undefined,
            folderId,
            metadata: { projectId: projectId ? String(projectId) : undefined, sourceFile: file.filename },
        }
    });

    console.log(`[Upload] Video ${file.originalname} queued for processing (asset ${asset.id})`);
    enqueueVideoJob(asset.id);
    return asset;
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
async function processModel(file: StoredFile, projectId: string | undefined, folderId?: number, fileHash?: string) {
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
