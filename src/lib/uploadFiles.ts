import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';

/**
 * Collects the files of an upload — single files, whole folders (drag & drop or folder picker) —
 * and splits them into what the server accepts and what it doesn't. Mirrors `detectAssetType`
 * in server/src/routes/upload.ts.
 */

export const MODEL_EXTENSIONS = [
  '.glb', '.gltf', '.obj', '.fbx', '.dae', '.stl',
  '.ply', '.3ds', '.ase', '.blend', '.usdz', '.usd',
];

/**
 * Videos (transcoded to MP4 on the server). Matched by extension because browsers send an empty
 * or odd MIME type for Matroska and some containers (Safari: '' for .mkv).
 */
export const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi'];

/** Gaussian splats (.ply is either — the server tells them apart by the header). */
export const SPLAT_EXTENSIONS = ['.sog', '.spz', '.splat', '.ksplat'];

/** `accept` attribute for file inputs. */
export const UPLOAD_ACCEPT = ['image/*', 'video/*', ...VIDEO_EXTENSIONS, ...MODEL_EXTENSIONS, ...SPLAT_EXTENSIONS].join(',');

export const SUPPORTED_FORMATS_HINT =
  'Bilder, Videos (.mp4, .mov, .webm, .mkv, …), 3D-Modelle (.glb, .fbx, .obj, .usdz, .stl, …) und Gaussian Splats (.ply, .sog, .spz, .splat, .ksplat)';

/** A file of an upload with its path relative to the dropped/picked folder ('' for loose files). */
export interface UploadEntry {
  file: File;
  /** e.g. "Ausstellung/Raum 1/bild.jpg"; just the file name for loose files. */
  path: string;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface UploadSelection {
  files: File[];
  skipped: SkippedFile[];
}

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
};

/** A video by MIME type or, when the browser sends none (Matroska), by extension. */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_EXTENSIONS.includes(extensionOf(file.name));
}

export function isSupportedUploadFile(file: File): boolean {
  if (file.type.startsWith('image/') || file.type.startsWith('video/')) return true;
  const ext = extensionOf(file.name);
  return VIDEO_EXTENSIONS.includes(ext) || MODEL_EXTENSIONS.includes(ext) || SPLAT_EXTENSIONS.includes(ext);
}

/** OS clutter in folders (Finder, Explorer, zip tools) — skipped without a hint. */
function isSystemFile(path: string): boolean {
  return path.split('/').some((segment) =>
    segment.startsWith('.') ||
    segment === '__MACOSX' ||
    segment === 'Thumbs.db' ||
    segment === 'desktop.ini' ||
    segment === 'Icon\r',
  );
}

// ── Collecting ─────────────────────────────────────────────────────────────

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    // readEntries returns batches (Chrome: 100) until it returns an empty one.
    const next = () => reader.readEntries((batch) => {
      if (batch.length === 0) resolve(all);
      else { all.push(...batch); next(); }
    }, reject);
    next();
  });
}

async function walkEntry(entry: FileSystemEntry, out: UploadEntry[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ file, path: entry.fullPath.replace(/^\/+/, '') });
  } else if (entry.isDirectory) {
    const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
    for (const child of children) await walkEntry(child, out);
  }
}

/**
 * Files of a drop, including the contents of dropped folders. The entries are taken from the
 * DataTransfer synchronously — it is emptied once the drop handler returns.
 */
export function collectDroppedFiles(dataTransfer: DataTransfer): Promise<UploadEntry[]> {
  const entries = Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() ?? null);
  if (entries.length === 0 || entries.some((entry) => entry === null)) {
    return Promise.resolve(Array.from(dataTransfer.files).map((file) => ({ file, path: file.name })));
  }
  return (async () => {
    const out: UploadEntry[] = [];
    for (const entry of entries) await walkEntry(entry!, out);
    return out;
  })();
}

/** Files of an `<input type="file">` — with `webkitdirectory` they carry their folder path. */
export function entriesFromFileList(files: FileList | File[]): UploadEntry[] {
  return Array.from(files).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

// ── Unbundled SOG ──────────────────────────────────────────────────────────

const SOG_PLANES = ['means', 'scales', 'quats', 'sh0', 'shN'] as const;

/** The image files a SOG `meta.json` refers to, or null if it is no SOG meta file. */
function sogImageFiles(meta: unknown): string[] | null {
  if (!meta || typeof meta !== 'object') return null;
  const record = meta as Record<string, unknown>;
  const files: string[] = [];
  for (const key of SOG_PLANES) {
    const plane = record[key];
    if (plane === undefined && key === 'shN') continue;
    if (!plane || typeof plane !== 'object') return null;
    const planeFiles = (plane as { files?: unknown }).files;
    if (!Array.isArray(planeFiles) || !planeFiles.every((f) => typeof f === 'string')) return null;
    files.push(...planeFiles);
  }
  return files;
}

const dirOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
const baseOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/**
 * SuperSplat / splat-transform can export SOG "unbundled": a folder of `meta.json` plus WebP
 * planes. Each such folder is zipped into the `.sog` bundle the server reads; its WebPs are
 * consumed and not uploaded as images.
 */
async function bundleUnbundledSogs(entries: UploadEntry[], skipped: SkippedFile[]): Promise<UploadEntry[]> {
  const metas = entries.filter((entry) => baseOf(entry.path).toLowerCase() === 'meta.json');
  if (metas.length === 0) return entries;

  const consumed = new Set<UploadEntry>();
  const bundles: UploadEntry[] = [];
  for (const metaEntry of metas) {
    const dir = dirOf(metaEntry.path);
    let meta: unknown;
    try {
      meta = JSON.parse(await metaEntry.file.text());
    } catch {
      continue; // no JSON — reported as unsupported below
    }
    const imageNames = sogImageFiles(meta);
    if (!imageNames) continue;

    const siblings = new Map(entries
      .filter((entry) => dirOf(entry.path) === dir)
      .map((entry) => [baseOf(entry.path), entry]));
    const missing = imageNames.filter((name) => !siblings.has(name));
    consumed.add(metaEntry);
    imageNames.forEach((name) => { const e = siblings.get(name); if (e) consumed.add(e); });
    const label = dir ? `${dir}/` : 'meta.json';
    if (missing.length > 0) {
      skipped.push({ path: label, reason: `Gaussian Splat (SOG) unvollständig — es fehlt ${missing.join(', ')}` });
      continue;
    }

    const zipInput: Record<string, Uint8Array> = {
      'meta.json': new Uint8Array(await metaEntry.file.arrayBuffer()),
    };
    for (const name of imageNames) {
      zipInput[name] = new Uint8Array(await siblings.get(name)!.file.arrayBuffer());
    }
    // WebP is already compressed — store only.
    const zipped = zipSync(zipInput, { level: 0 });
    const name = `${baseOf(dir) || 'gaussian-splat'}.sog`;
    bundles.push({
      file: new File([zipped as Uint8Array<ArrayBuffer>], name, { type: 'application/octet-stream' }),
      path: dir ? `${dir}.sog` : name,
    });
  }
  return [...entries.filter((entry) => !consumed.has(entry)), ...bundles];
}

// ── Selection ──────────────────────────────────────────────────────────────

/** Splits collected files into uploadable ones and a list of skipped files for the hint. */
export async function selectUploadFiles(entries: UploadEntry[]): Promise<UploadSelection> {
  const skipped: SkippedFile[] = [];
  const visible = entries.filter((entry) => !isSystemFile(entry.path));
  const withBundles = await bundleUnbundledSogs(visible, skipped);

  const files: File[] = [];
  for (const entry of withBundles) {
    if (isSupportedUploadFile(entry.file)) {
      files.push(entry.file);
    } else {
      const ext = extensionOf(entry.file.name);
      skipped.push({ path: entry.path, reason: ext ? `Format ${ext} wird nicht unterstützt` : 'Unbekanntes Format' });
    }
  }
  return { files, skipped };
}

/** One-line German summary of skipped files, e.g. for a toast. */
export function describeSkippedFiles(skipped: SkippedFile[], max = 3): string {
  const names = skipped.slice(0, max).map((s) => baseOf(s.path.replace(/\/$/, '')) || s.path);
  const more = skipped.length > max ? ` und ${skipped.length - max} weitere` : '';
  return `${names.join(', ')}${more}`;
}
