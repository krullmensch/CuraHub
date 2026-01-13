import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { imageSize } from 'image-size';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import ExifParser from 'exif-parser';

export const uploadRouter = Router();
const prisma = new PrismaClient();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

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
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphen
        .replace(/^-+|-+$/g, '');   // Trim leading/trailing hyphens (if any)
    
    // Add short unique suffix (timestamp + 4 chars of UUID) to ensure uniqueness
    const uniqueSuffix = `${Date.now().toString().slice(-6)}-${uuidv4().split('-')[0]}`;
    
    cb(null, `${sanitizedTitle}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
          cb(null, true);
      } else {
          cb(new Error('Only images are allowed'));
      }
  }
});

uploadRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Optional: Capture project context for future folder organization
  const projectId = req.body.projectId || req.query.projectId;
  if (projectId) {
      console.log(`[Upload] Processing upload for Project ID: ${projectId}`);
  }
  
  let dimensions = { width: 0, height: 0 };
  let dpi = 72; // Default if not found
  let widthCm = 0;
  let heightCm = 0;

  try {
      // Read file into buffer
      const buffer = fs.readFileSync(req.file.path);
      
      // Get pixel dimensions
      const size = imageSize(buffer);
      if (size) {
         dimensions = { width: size.width || 0, height: size.height || 0 };
      }

      // Get EXIF data for DPI
      // Get EXIF data for DPI (Only works reliably for JPEG/TIFF)
      try {
          const parser = ExifParser.create(buffer);
          const result = parser.parse();
          
          if (result && result.tags && result.tags.XResolution) {
              dpi = result.tags.XResolution;
          }
      } catch {
          // Ignore EXIF parsing errors (e.g. for PNG/WebP files)
          // console.log('No EXIF data found or unsupported format');
      }
      
      // Calculate physical size in cm
      // 1 inch = 2.54 cm
      if (dimensions.width > 0 && dimensions.height > 0) {
          widthCm = parseFloat(((dimensions.width / dpi) * 2.54).toFixed(1));
          heightCm = parseFloat(((dimensions.height / dpi) * 2.54).toFixed(1));
      }

      // Compress and Resize Image
      // We do this AFTER extracting metadata so we get the original physical specs
      
      // Changing extension to .webp
      const newFilename = req.file.filename.split('.')[0] + '.webp';
      const newPath = path.join(path.dirname(req.file.path), newFilename);
      
      // Auto-rotate based on EXIF, resize to max 2500px (to safely stay under 1MB), compress to WebP
      // 2500*2500 = 6.25MP. 1MB = 8Mb. ~1.28 bits per pixel. WebP usually looks great at 0.5-1 bpp.
      await sharp(req.file.path)
        .rotate()
        .resize({ width: 2500, height: 2500, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 }) 
        .toFile(newPath);
      
      // Remove original file
      fs.unlinkSync(req.file.path);
      
      // Update req.file properties to reflect the new file
      req.file.filename = newFilename;
      req.file.path = newPath;
      req.file.mimetype = 'image/webp';
      
      // Update file size in response
      const stats = fs.statSync(req.file.path);
      req.file.size = stats.size;
      
      // Note: We deliberately return the ORIGINAL dimensions/dpi for physical size calculation
      // even though the texture is now optimized.
      
      // Check if under 1MB warning (optional logging)
      if (req.file.size > 1024 * 1024) {
          console.warn(`Compressed file is ${req.file.size} bytes, slightly over 1MB target.`);
      }

      // --- CREATE ASSET IN DB ---
      const asset = await prisma.asset.create({
          data: {
              filename: req.file.filename,
              path: `/uploads/${req.file.filename}`,
              mimetype: req.file.mimetype,
              size: req.file.size,
              width: dimensions.width,
              height: dimensions.height,
              dpi: dpi,
              metadata: {
                   widthCm,
                   heightCm,
                   projectId: projectId ? String(projectId) : undefined
              }
          }
      });

      // Return the Asset object
      res.json(asset);

  } catch (err) {
      console.error('Error processing image:', err);
      res.status(500).json({ error: 'Failed to process upload' });
  }
});
