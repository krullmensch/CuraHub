import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Button } from "@/components/ui/button";
import { CloudUpload } from "lucide-react";

interface DuplicateInfo {
  filename: string;
  existing: Record<string, unknown>;
  retry: () => Promise<void>;
}

interface UploadDropzoneProps {
  /** Called with collected files instead of uploading — used by AssetLibrary to show the preview modal */
  onFilesReady?: (files: File[]) => void;
  onUploadStart?: () => void;
  onUploadComplete?: (fileData: unknown) => void;
  onUploadError?: (error: string) => void;
  onDuplicate?: (info: DuplicateInfo) => void;
  projectId?: number | null;
  folderId?: number | null;
  children?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const UploadDropzone = ({
    onFilesReady,
    onUploadStart = () => {},
    onUploadComplete = () => {},
    onUploadError = (e) => console.error(e),
    onDuplicate,
    projectId = null,
    folderId = null,
    children,
    disabled = false,
    className = ""
}: UploadDropzoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const token = useAuthStore((state) => state.token);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  // Counter avoids false drag-leave events when the pointer moves over child elements
  const dragCounterRef = useRef(0);

  // ── Direct upload path (used by EditorLayout) ──────────────────────────

  const uploadFile = async (rawFile: File, force = false) => {
      const formData = new FormData();
      formData.append('file', rawFile);
      if (projectId) formData.append('projectId', projectId.toString());
      if (folderId) formData.append('folderId', folderId.toString());
      if (force) formData.append('force', 'true');

      const response = await fetch('/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
      });

      if (response.status === 409) {
          const body = await response.json();
          if (body.duplicate && onDuplicate) {
              onDuplicate({
                  filename: body.filename,
                  existing: body.existing,
                  retry: () => uploadFile(rawFile, true).then((data) => onUploadComplete(data)),
              });
              return null;
          }
      }

      if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error || `Upload failed for ${rawFile.name}`);
      }

      return response.json();
  };

  const processFiles = async (files: FileList | File[]) => {
      const MODEL_EXTENSIONS = [
          '.glb', '.gltf', '.obj', '.fbx', '.dae', '.stl',
          '.ply', '.3ds', '.ase', '.blend', '.usdz', '.usd',
      ];

      const validFiles = Array.from(files).filter(file => {
          if (file.type.startsWith('image/')) return true;
          if (file.type.startsWith('video/')) return true;
          const ext = file.name.toLowerCase();
          if (MODEL_EXTENSIONS.some(m => ext.endsWith(m))) return true;
          return false;
      });

      if (validFiles.length === 0) {
          if (files.length > 0) {
             onUploadError('Nicht unterstütztes Dateiformat. Erlaubt: Bilder, Videos, 3D-Modelle (.glb, .fbx, .obj, .usdz, .stl, …)');
          }
          return;
      }

      // If a preview-modal handler is registered, hand files off there
      if (onFilesReady) {
          onFilesReady(validFiles);
          return;
      }

      // Legacy: upload directly (used by EditorLayout)
      setProcessing(true);
      onUploadStart();

      try {
          for (const rawFile of validFiles) {
              try {
                  const data = await uploadFile(rawFile);
                  if (data) onUploadComplete(data);
              } catch (error) {
                  onUploadError(error instanceof Error ? error.message : `Error uploading ${rawFile.name}`);
              }
          }
      } finally {
        setProcessing(false);
      }
  };

  // ── Native drag event listeners ────────────────────────────────────────
  // React 19 synthetic drag events deliver e.dataTransfer === null in Firefox
  // for external OS file drags. Native DOM listeners always receive the real
  // DataTransfer object, so we use those instead of React event props.

  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const processFilesRef = useRef(processFiles);
  processFilesRef.current = processFiles;

  const isFileDrag = (dt: DataTransfer | null): boolean => {
    if (!dt) return true; // null → assume external file drag
    const types = Array.from(dt.types);
    if (types.some(t => t === 'asset-id')) return false; // internal asset drag
    return types.some(t => t === 'Files' || t === 'files') || types.length === 0;
  };

  useEffect(() => {
    const el = dropzoneRef.current;
    if (!el) return;

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      console.log('[DZ] dragenter — disabled:', disabledRef.current, 'dt:', e.dataTransfer, 'types:', e.dataTransfer ? Array.from(e.dataTransfer.types) : 'null', 'isFile:', isFileDrag(e.dataTransfer));
      if (disabledRef.current) return;
      if (!isFileDrag(e.dataTransfer)) return;
      dragCounterRef.current += 1;
      setIsDragging(true);
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (disabledRef.current) return;
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    };

    let dragOverCount = 0;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      dragOverCount++;
      if (dragOverCount <= 3) console.log('[DZ] dragover #' + dragOverCount, 'target:', (e.target as HTMLElement)?.tagName, (e.target as HTMLElement)?.className?.substring(0, 40));
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);
      console.log('[DZ] drop — disabled:', disabledRef.current, 'dt:', e.dataTransfer, 'files:', e.dataTransfer?.files?.length, 'target:', (e.target as HTMLElement)?.className?.substring(0, 60));
      if (disabledRef.current) return;
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        console.log('[DZ] calling processFiles with', e.dataTransfer.files.length, 'files');
        processFilesRef.current(e.dataTransfer.files);
      } else {
        console.log('[DZ] NO files in dataTransfer');
      }
    };

    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);

    // CAPTURE-phase document listeners — fires before ANY other handler.
    // Guarantees preventDefault on dragover so browser allows drop.
    // Also serves as fallback drop handler if element listener misses it.
    const onDocDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDocDrop = (e: DragEvent) => {
      e.preventDefault();
      console.log('[DZ-DOC] CAPTURE drop — target:', (e.target as HTMLElement)?.tagName, (e.target as HTMLElement)?.className?.substring(0, 60), 'files:', e.dataTransfer?.files?.length);
      // Fallback: if the drop is inside our dropzone and we're in drag state, process files
      if (el.contains(e.target as Node) && !disabledRef.current) {
        dragCounterRef.current = 0;
        setIsDragging(false);
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
          console.log('[DZ-DOC] processing files via capture fallback');
          processFilesRef.current(e.dataTransfer.files);
        }
      }
    };
    document.addEventListener('dragover', onDocDragOver, true);  // capture
    document.addEventListener('drop', onDocDrop, true);          // capture

    return () => {
      el.removeEventListener('dragenter', onDragEnter);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
      document.removeEventListener('dragover', onDocDragOver, true);
      document.removeEventListener('drop', onDocDrop, true);
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          processFiles(e.target.files);
      }
      if (fileInputRef.current) {
          fileInputRef.current.value = '';
      }
  };

  const handleZoneClick = () => {
    if (disabled || processing) return;
    fileInputRef.current?.click();
  };

  return (
    <div
        ref={dropzoneRef}
        className={className}
        style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {/* Drop overlay — pointer-events-none so drops pass through to the
           dropzone div underneath. No backdrop-blur (breaks pointer-events-none
           hit-testing in Firefox). */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-lg overflow-hidden">
          {/* Backdrop — no backdrop-blur-sm, it breaks pointer-events-none in Firefox */}
          <div className="absolute inset-0 bg-blue-950/70" />
          {/* Animated border */}
          <div className="absolute inset-2 rounded-xl border-2 border-dashed border-blue-400 animate-pulse" />
          {/* Centre card */}
          <div className="relative flex flex-col items-center gap-3 px-8 py-6 rounded-2xl bg-blue-950/80 border border-blue-500/40 shadow-2xl">
            <div className="rounded-full bg-blue-500/20 p-4">
              <CloudUpload className="h-10 w-10 text-blue-300" />
            </div>
            <p className="text-lg font-semibold text-blue-100">Dateien hier ablegen</p>
            <p className="text-sm text-blue-300/70">Bilder, Videos und 3D-Modelle</p>
          </div>
        </div>
      )}

      {children ? children : (
          <div
              onClick={handleZoneClick}
              className={`flex flex-col items-center justify-center w-full h-full border-2 border-dashed rounded-lg cursor-pointer bg-zinc-950/50 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-600 transition-all ${isDragging ? 'opacity-0' : ''}`}
          >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <CloudUpload className="h-10 w-10 text-muted-foreground mb-4" />
                  <p className="mb-2 text-sm text-gray-400 font-medium">
                      {processing ? 'Optimierung & Upload läuft…' : 'Klicken oder Dateien hierher ziehen'}
                  </p>
                  <p className="text-xs text-gray-500">
                      Bilder, Videos und 3D-Modelle (.glb) unterstützt
                  </p>
                  <Button variant="outline" size="sm" className="mt-4 pointer-events-none" disabled={processing}>
                      {processing ? 'Verarbeitung…' : 'Dateien auswählen'}
                  </Button>
              </div>
          </div>
      )}

      {!children && (
        <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,video/*,.glb,.gltf,.obj,.fbx,.dae,.stl,.ply,.3ds,.ase,.blend,.usdz,.usd"
            multiple
            disabled={processing}
        />
      )}
    </div>
  );
};
