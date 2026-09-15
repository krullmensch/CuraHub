import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  AlertCircle,
  Box,
  Play,
  Loader2,
  Upload,
  RotateCcw,
  ArrowRight,
  Copy,
  X,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { cn } from '@/lib/utils';
import { preprocessImageForUpload, type PreprocessResult } from '@/lib/imageUtils';
import { CHUNKED_UPLOAD_THRESHOLD, uploadFileInChunks } from '@/lib/chunkedUpload';

// ── Types ──────────────────────────────────────────────────────────────────

type FileStatus = 'pending' | 'optimizing' | 'uploading' | 'processing' | 'done' | 'error' | 'duplicate';

interface UploadFileItem {
  id: string;
  file: File;
  preview: string | null;
  name: string;         // editable — displayed name without extension
  ext: string;          // e.g. ".jpg"
  originalSize: number;
  status: FileStatus;
  progress: number;     // 0–100, upload phase only
  compressedSize?: number;
  errorMsg?: string;
  existingAsset?: Record<string, unknown>; // for duplicates
  /** Result of client-side preprocessing (images only) — computed once, reused on force-retry. */
  preprocessed?: PreprocessResult;
  /** Aborts the running upload (multipart XHR or chunked upload). */
  cancel?: () => void;
  /** VID-03: the server accepted the file and processes it in the background. */
  backgroundProcessing?: boolean;
}

interface UploadPreviewModalProps {
  files: File[];
  projectId: number | null;
  folderId: number | null;
  open: boolean;
  onClose: () => void;
  onAssetUploaded: (asset: Record<string, unknown>) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

interface UploadXHROpts {
  projectId: number | null;
  folderId: number | null;
  token: string;
  force?: boolean;
  clientHash?: string;
  originalWidth?: number;
  originalHeight?: number;
  dpi?: number;
}

function uploadXHR(
  file: File,
  opts: UploadXHROpts,
  onProgress: (pct: number) => void,
  onXhrReady: (xhr: XMLHttpRequest) => void,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onXhrReady(xhr);
    const form = new FormData();
    form.append('file', file);
    if (opts.projectId) form.append('projectId', opts.projectId.toString());
    if (opts.folderId) form.append('folderId', opts.folderId.toString());
    if (opts.force) form.append('force', 'true');
    if (opts.clientHash) form.append('clientHash', opts.clientHash);
    if (opts.originalWidth) form.append('originalWidth', opts.originalWidth.toString());
    if (opts.originalHeight) form.append('originalHeight', opts.originalHeight.toString());
    if (opts.dpi) form.append('dpi', opts.dpi.toString());

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 90));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as Record<string, unknown>;
        resolve({ status: xhr.status, body });
      } catch {
        // Server returned non-JSON — likely an nginx proxy error page (413, 502, 504)
        const isHtml = xhr.responseText.trimStart().startsWith('<');
        const statusHint = xhr.status ? ` (HTTP ${xhr.status})` : '';
        if (isHtml && xhr.status === 413) {
          reject(new Error(`Datei zu groß — Serverlimit überschritten${statusHint}`));
        } else if (isHtml && (xhr.status === 502 || xhr.status === 504)) {
          reject(new Error(`Server-Timeout — Video-Verarbeitung dauerte zu lange${statusHint}`));
        } else {
          reject(new Error(`Ungültige Serverantwort${statusHint}`));
        }
      }
    };
    xhr.onerror = () => reject(new Error('Netzwerkfehler beim Upload'));
    xhr.onabort = () => reject(new Error('Abgebrochen'));
    xhr.open('POST', '/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${opts.token}`);
    xhr.send(form);
  });
}

/** Form fields of a multipart upload, reused by the chunked upload. */
function uploadFields(opts: UploadXHROpts): Record<string, string> {
  const fields: Record<string, string> = {};
  if (opts.projectId) fields.projectId = opts.projectId.toString();
  if (opts.folderId) fields.folderId = opts.folderId.toString();
  if (opts.force) fields.force = 'true';
  if (opts.clientHash) fields.clientHash = opts.clientHash;
  if (opts.originalWidth) fields.originalWidth = opts.originalWidth.toString();
  if (opts.originalHeight) fields.originalHeight = opts.originalHeight.toString();
  if (opts.dpi) fields.dpi = opts.dpi.toString();
  return fields;
}

const UPLOAD_CONCURRENCY = 3;

/** Runs `worker` over `items` with at most `limit` in flight at once. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  isAborted: () => boolean,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      if (isAborted()) return;
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// ── Component ──────────────────────────────────────────────────────────────

export const UploadPreviewModal = ({
  files,
  projectId,
  folderId,
  open,
  onClose,
  onAssetUploaded,
}: UploadPreviewModalProps) => {
  const token = useAuthStore((s) => s.token);
  const abortRef = useRef(false);
  // Confirmation step before aborting running uploads.
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Build initial items from `files` once on mount.
  // The parent passes a changing `key` prop so this component remounts when files change.
  const initialItems = useMemo<UploadFileItem[]>(() => {
    return files.map((file) => {
      const dot = file.name.lastIndexOf('.');
      const name = dot > 0 ? file.name.slice(0, dot) : file.name;
      const ext = dot > 0 ? file.name.slice(dot) : '';
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      return {
        id: crypto.randomUUID(),
        file,
        preview,
        name,
        ext,
        originalSize: file.size,
        status: 'pending' as FileStatus,
        progress: 0,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — initialises once per mount

  const [items, setItems] = useState<UploadFileItem[]>(initialItems);
  const [phase, setPhase] = useState<'preview' | 'uploading' | 'done'>('preview');

  // Revoke preview object URLs when the component unmounts
  useEffect(() => {
    return () => {
      initialItems.forEach((it) => { if (it.preview) URL.revokeObjectURL(it.preview); });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchItem = useCallback((id: string, patch: Partial<UploadFileItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  // ── Upload logic ────────────────────────────────────────────────────────

  const uploadOne = async (item: UploadFileItem, force = false) => {
    if (!token) return;
    if (abortRef.current) return;

    // Preprocess images once (resize + hash + dims); reuse on force-retry.
    let preprocessed = item.preprocessed;
    const isImage = item.file.type.startsWith('image/');
    if (isImage && !preprocessed) {
      patchItem(item.id, { status: 'optimizing', progress: 0, errorMsg: undefined });
      try {
        preprocessed = await preprocessImageForUpload(item.file);
      } catch {
        preprocessed = { file: item.file };
      }
      if (abortRef.current) return;
      patchItem(item.id, { preprocessed });
    }

    const baseFile = preprocessed?.file ?? item.file;

    // Build a File with the (possibly renamed) name, preserving the (possibly changed) extension
    const dot = baseFile.name.lastIndexOf('.');
    const processedExt = dot > 0 ? baseFile.name.slice(dot) : item.ext;
    const desiredName = item.name + processedExt;
    const uploadFile =
      desiredName !== baseFile.name
        ? new File([baseFile], desiredName, { type: baseFile.type })
        : baseFile;

    patchItem(item.id, { status: 'uploading', progress: 0, errorMsg: undefined });

    try {
      const uploadOpts: UploadXHROpts = {
        projectId,
        folderId,
        token,
        force,
        clientHash: preprocessed?.clientHash,
        originalWidth: preprocessed?.originalWidth,
        originalHeight: preprocessed?.originalHeight,
        dpi: preprocessed?.dpi,
      };
      // VID-03: Cloudflare rejects bodies > 100 MB — large files go up in chunks.
      const { status, body } = uploadFile.size > CHUNKED_UPLOAD_THRESHOLD
        ? await uploadFileInChunks(uploadFile, {
            token,
            fields: uploadFields(uploadOpts),
            onProgress: (fraction) => patchItem(item.id, { progress: Math.round(fraction * 90) }),
            onCancelReady: (cancel) => patchItem(item.id, { cancel }),
          })
        : await uploadXHR(
            uploadFile,
            uploadOpts,
            (pct) => patchItem(item.id, { progress: pct }),
            (xhr) => patchItem(item.id, { cancel: () => xhr.abort() }),
          );

      if (status === 409 && body.duplicate) {
        patchItem(item.id, {
          status: 'duplicate',
          progress: 0,
          errorMsg: 'Bereits vorhanden',
          existingAsset: body.existing as Record<string, unknown>,
        });
        return;
      }

      if (status < 200 || status >= 300) {
        patchItem(item.id, {
          status: 'error',
          errorMsg: (body.error as string) || 'Upload fehlgeschlagen',
        });
        return;
      }

      const backgroundProcessing = body.status === 'processing';
      patchItem(item.id, {
        status: 'done',
        progress: 100,
        compressedSize: backgroundProcessing ? undefined : (body.size as number),
        backgroundProcessing,
      });
      onAssetUploaded(body);
    } catch (err) {
      if (abortRef.current) {
        patchItem(item.id, { status: 'error', errorMsg: 'Abgebrochen' });
        return;
      }
      patchItem(item.id, {
        status: 'error',
        errorMsg: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    }
  };

  const handleUpload = async () => {
    setPhase('uploading');
    const pending = items.filter((it) => it.status === 'pending');
    await runWithConcurrency(
      pending,
      UPLOAD_CONCURRENCY,
      (item) => uploadOne(item),
      () => abortRef.current,
    );
    setPhase('done');
  };

  // ── Derived stats ───────────────────────────────────────────────────────

  const doneCount = items.filter((it) => it.status === 'done').length;
  const errorCount = items.filter((it) => it.status === 'error').length;
  const duplicateCount = items.filter((it) => it.status === 'duplicate').length;
  const regularItems = items.filter((it) => it.status !== 'duplicate');
  const duplicateItems = items.filter((it) => it.status === 'duplicate');

  const handleClose = () => {
    abortRef.current = true;
    // Abort any in-flight uploads so the browser stops sending bytes.
    items.forEach((it) => {
      if (it.status === 'uploading' && it.cancel) {
        it.cancel();
      }
    });
    onClose();
  };

  /** Aborts running uploads after confirmation; finished files stay in the library. */
  const cancelUploads = () => {
    abortRef.current = true;
    items.forEach((it) => {
      if (it.status === 'uploading' && it.cancel) it.cancel();
    });
    setItems((prev) => prev.map((it) =>
      it.status === 'pending' || it.status === 'optimizing' || it.status === 'uploading'
        ? { ...it, status: 'error', progress: 0, errorMsg: 'Abgebrochen', cancel: undefined }
        : it
    ));
    setConfirmCancel(false);
    setPhase('done');
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const dialogTitle =
    phase === 'preview'
      ? `${items.length} Datei${items.length !== 1 ? 'en' : ''} hochladen`
      : phase === 'uploading'
      ? `Wird hochgeladen … (${doneCount} / ${items.length})`
      : [
          doneCount > 0 && `${doneCount} erfolgreich`,
          duplicateCount > 0 && `${duplicateCount} Duplikat${duplicateCount !== 1 ? 'e' : ''}`,
          errorCount > 0 && `${errorCount} fehlgeschlagen`,
        ].filter(Boolean).join(' · ') || 'Upload abgeschlossen';

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) return;
        // Closing while uploading would abort silently — ask first.
        if (phase === 'uploading') setConfirmCancel(true);
        else handleClose();
      }}
    >
      <DialogContent className="max-w-2xl gap-4">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">{dialogTitle}</DialogTitle>
          {phase === 'preview' && (
            <p className="text-xs text-zinc-500 mt-1">
              Namen bearbeiten: auf den Namen unter dem Vorschaubild klicken.
            </p>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4 max-h-[30rem] overflow-y-auto pr-1">
          {/* Regular file grid */}
          {regularItems.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {regularItems.map((item) => (
                <FileCard
                  key={item.id}
                  item={item}
                  phase={phase}
                  onNameChange={(name) => patchItem(item.id, { name })}
                />
              ))}
            </div>
          )}

          {/* Duplicate section */}
          {duplicateItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <Copy className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  {duplicateItems.length === 1
                    ? 'Datei bereits vorhanden'
                    : `${duplicateItems.length} Dateien bereits vorhanden`}
                </span>
                <span className="text-xs text-zinc-500">
                  — Diese Dateien wurden in diesem Projekt bereits hochgeladen.
                </span>
              </div>
              {duplicateItems.map((item) => (
                <DuplicateRow
                  key={item.id}
                  item={item}
                  onForceUpload={() => uploadOne(item, true)}
                  onSkip={() => patchItem(item.id, { status: 'error', errorMsg: 'Übersprungen' })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
          {phase === 'preview' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Abbrechen
              </Button>
              <Button
                onClick={handleUpload}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Upload className="h-4 w-4 mr-2" />
                Hochladen
              </Button>
            </>
          )}
          {phase === 'uploading' && (
            <>
              <Button variant="outline" onClick={() => setConfirmCancel(true)}>
                <X className="h-4 w-4 mr-2" />
                Upload abbrechen
              </Button>
              <Button disabled className="bg-blue-600 text-white opacity-60 cursor-not-allowed">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Lädt hoch…
              </Button>
            </>
          )}
          {phase === 'done' && duplicateCount > 0 && (
            <Button
              variant="outline"
              className="border-amber-700 text-amber-300 hover:bg-amber-900/30 hover:text-amber-100"
              onClick={async () => {
                setPhase('uploading');
                await runWithConcurrency(
                  duplicateItems,
                  UPLOAD_CONCURRENCY,
                  (it) => uploadOne(it, true),
                  () => abortRef.current,
                );
                setPhase('done');
              }}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Alle Duplikate trotzdem hochladen
            </Button>
          )}
          {phase === 'done' && (
            <Button
              onClick={handleClose}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Schließen
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Abort confirmation */}
    <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Upload abbrechen?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-zinc-400">
          Laufende und wartende Uploads werden abgebrochen, bereits übertragene Daten dieser Dateien
          gehen verloren. Vollständig hochgeladene Dateien bleiben in der Bibliothek.
        </p>
        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
          <Button variant="outline" onClick={() => setConfirmCancel(false)}>
            Weiter hochladen
          </Button>
          <Button variant="destructive" onClick={cancelUploads}>
            Ja, abbrechen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

// ── FileCard sub-component ─────────────────────────────────────────────────

function FileCard({
  item,
  phase,
  onNameChange,
}: {
  item: UploadFileItem;
  phase: 'preview' | 'uploading' | 'done';
  onNameChange: (name: string) => void;
}) {
  const isImage = !!item.preview;
  const isVideo = item.file.type.startsWith('video/');
  const saving = item.originalSize > 0 &&
    item.compressedSize !== undefined &&
    item.compressedSize < item.originalSize;
  const savingPct = saving
    ? Math.round((1 - item.compressedSize! / item.originalSize) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Thumbnail */}
      <div className="aspect-square rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 relative flex items-center justify-center">
        {isImage ? (
          <img src={item.preview!} alt={item.name} className="w-full h-full object-cover" />
        ) : isVideo ? (
          <div className="flex flex-col items-center gap-1.5 text-zinc-500">
            <Play className="h-9 w-9" />
            <span className="text-[11px] uppercase tracking-wide">Video</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-zinc-500">
            <Box className="h-9 w-9" />
            <span className="text-[11px] uppercase tracking-wide">
              {item.ext ? item.ext.slice(1) : '3D'}
            </span>
          </div>
        )}

        {/* Status overlay */}
        {item.status === 'done' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
            <CheckCircle2 className="h-9 w-9 text-green-400 drop-shadow" />
          </div>
        )}
        {(item.status === 'error' || item.status === 'duplicate') && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
            <AlertCircle className="h-9 w-9 text-amber-400 drop-shadow" />
          </div>
        )}
        {(item.status === 'processing' || item.status === 'optimizing') && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
            <Loader2 className="h-9 w-9 text-blue-400 animate-spin" />
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full overflow-hidden bg-zinc-800">
        {item.status === 'optimizing' && (
          <div className="h-full bg-blue-400/60 w-1/3 animate-pulse rounded-full" />
        )}
        {item.status === 'uploading' && (
          <div
            className="h-full bg-blue-500 transition-all duration-200 rounded-full"
            style={{ width: `${item.progress}%` }}
          />
        )}
        {item.status === 'done' && (
          <div className="h-full bg-green-500 w-full rounded-full" />
        )}
        {(item.status === 'error' || item.status === 'duplicate') && (
          <div className="h-full bg-amber-500 w-full rounded-full" />
        )}
      </div>

      {/* Editable name */}
      {phase === 'preview' ? (
        <input
          value={item.name}
          onChange={(e) => onNameChange(e.target.value)}
          className={cn(
            'text-[11px] bg-transparent border-b border-zinc-700 focus:border-blue-500 outline-none',
            'text-zinc-200 px-0.5 py-0.5 truncate w-full transition-colors',
          )}
          title={item.name + item.ext}
          spellCheck={false}
        />
      ) : (
        <p
          className="text-[11px] text-zinc-400 truncate px-0.5 leading-tight"
          title={item.name + item.ext}
        >
          {item.name}{item.ext}
        </p>
      )}

      {/* Size / status line */}
      <div className="text-[10px] text-zinc-500 px-0.5 leading-tight min-h-[14px]">
        {item.status === 'done' && item.backgroundProcessing ? (
          <span className="text-blue-400">Wird im Hintergrund verarbeitet …</span>
        ) : item.status === 'done' && item.compressedSize !== undefined ? (
          <span className="flex items-center gap-1">
            <span className="line-through text-zinc-600">{formatBytes(item.originalSize)}</span>
            <span className="text-green-400">{formatBytes(item.compressedSize)}</span>
            {saving && (
              <span className="text-green-500 font-medium">−{savingPct}%</span>
            )}
          </span>
        ) : item.status === 'error' ? (
          <span className="text-red-400">{item.errorMsg}</span>
        ) : item.status === 'optimizing' ? (
          <span className="text-blue-400">Wird optimiert …</span>
        ) : item.status === 'uploading' ? (
          <span>{formatBytes(item.originalSize)} · {item.progress}%</span>
        ) : (
          <span>{formatBytes(item.originalSize)}</span>
        )}
      </div>
    </div>
  );
}

// ── DuplicateRow sub-component ─────────────────────────────────────────────

function DuplicateRow({
  item,
  onForceUpload,
  onSkip,
}: {
  item: UploadFileItem;
  onForceUpload: () => void;
  onSkip: () => void;
}) {
  const existing = item.existingAsset;
  const existingThumb = existing
    ? ((existing.type === 'video' ? existing.thumbnailPath : existing.path) as string | undefined)
    : undefined;
  const existingName = existing?.filename as string | undefined;
  const existingSize = existing?.size as number | undefined;
  const existingDate = existing?.createdAt as string | undefined;

  const uploadedAgo = existingDate
    ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(
        new Date(existingDate),
      )
    : null;

  return (
    <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3 flex gap-3 items-start">
      {/* New file thumbnail */}
      <div className="shrink-0 flex flex-col items-center gap-1">
        <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-medium">Neu</span>
        <div className="w-16 h-16 rounded-md overflow-hidden bg-zinc-900 border border-zinc-700 flex items-center justify-center">
          {item.preview ? (
            <img src={item.preview} alt={item.name} className="w-full h-full object-cover" />
          ) : item.file.type.startsWith('video/') ? (
            <Play className="h-6 w-6 text-zinc-500" />
          ) : (
            <Box className="h-6 w-6 text-zinc-500" />
          )}
        </div>
        <span className="text-[9px] text-zinc-500">{formatBytes(item.originalSize)}</span>
      </div>

      {/* Arrow */}
      <div className="flex items-center self-center mt-3">
        <ArrowRight className="h-4 w-4 text-amber-600" />
      </div>

      {/* Existing file thumbnail */}
      <div className="shrink-0 flex flex-col items-center gap-1">
        <span className="text-[9px] text-amber-500 uppercase tracking-wider font-medium">Vorhanden</span>
        <div className="w-16 h-16 rounded-md overflow-hidden bg-zinc-900 border border-amber-800/60 flex items-center justify-center relative">
          {existingThumb ? (
            <img src={existingThumb} alt={existingName} className="w-full h-full object-cover" />
          ) : (
            <Box className="h-6 w-6 text-zinc-500" />
          )}
          {/* Amber tint overlay to visually mark it as the "existing" one */}
          <div className="absolute inset-0 bg-amber-500/10 rounded-md" />
        </div>
        {existingSize !== undefined && (
          <span className="text-[9px] text-zinc-500">{formatBytes(existingSize)}</span>
        )}
      </div>

      {/* Info + actions */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0 pt-4">
        <p className="text-xs font-medium text-zinc-200 truncate" title={item.name + item.ext}>
          {item.name}{item.ext}
        </p>
        {existingName && existingName !== item.name + item.ext && (
          <p className="text-[10px] text-zinc-500 truncate">
            Gespeichert als <span className="text-zinc-400">{existingName}</span>
          </p>
        )}
        {uploadedAgo && (
          <p className="text-[10px] text-zinc-500">Hochgeladen am {uploadedAgo}</p>
        )}

        <div className="flex gap-1.5 mt-auto pt-1">
          <button
            onClick={onSkip}
            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="h-3 w-3" />
            Überspringen
          </button>
          <span className="text-zinc-700">·</span>
          <button
            onClick={onForceUpload}
            className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 transition-colors font-medium"
          >
            <RotateCcw className="h-3 w-3" />
            Trotzdem hochladen
          </button>
        </div>
      </div>
    </div>
  );
}
