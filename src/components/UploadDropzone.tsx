import { useState, useRef, useEffect, useCallback } from 'react';
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
  const dragCounterRef = useRef(0);

  // ── Direct upload path (used by EditorLayout) ──────────────────────────

  const uploadFile = useCallback(async (rawFile: File, force = false) => {
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
  }, [token, projectId, folderId, onDuplicate, onUploadComplete]);

  const processFiles = useCallback(async (files: FileList | File[]) => {
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
  }, [onFilesReady, onUploadStart, onUploadComplete, onUploadError, uploadFile]);

  // ── Vanilla DOM drop overlay ──────────────────────────────────────────
  // React 19 swallows native drop events inside the React root in some
  // Firefox-based browsers (Zen Browser, etc.). Workaround: detect drags
  // via document-level dragenter, then create a vanilla DOM overlay on
  // document.body (OUTSIDE the React root) that receives the drop event.
  // Proven to work: standalone HTML drop zones on document.body receive
  // drop events even when elements inside #root do not.

  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const processFilesRef = useRef(processFiles);
  processFilesRef.current = processFiles;

  const isFileDrag = (dt: DataTransfer | null): boolean => {
    if (!dt) return true; // null in Firefox-based browsers for external drags
    const types = Array.from(dt.types);
    if (types.some(t => t === 'asset-id')) return false; // internal asset drag
    return types.some(t => t === 'Files' || t === 'files') || types.length === 0;
  };

  useEffect(() => {
    const el = dropzoneRef.current;
    if (!el) return;

    // The vanilla overlay element — lives on document.body, outside React root
    let overlay: HTMLDivElement | null = null;

    const showOverlay = () => {
      if (overlay) return;
      const rect = el.getBoundingClientRect();
      overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        overflow: hidden;
        pointer-events: auto;
      `;

      // Backdrop
      const backdrop = document.createElement('div');
      backdrop.style.cssText = `
        position: absolute; inset: 0;
        background: rgba(23, 37, 84, 0.7);
        pointer-events: none;
      `;
      overlay.appendChild(backdrop);

      // Dashed border
      const border = document.createElement('div');
      border.style.cssText = `
        position: absolute; inset: 8px;
        border: 2px dashed #60a5fa;
        border-radius: 12px;
        pointer-events: none;
      `;
      overlay.appendChild(border);

      // Centre card
      const card = document.createElement('div');
      card.style.cssText = `
        position: relative;
        display: flex; flex-direction: column; align-items: center; gap: 12px;
        padding: 24px 32px;
        border-radius: 16px;
        background: rgba(23, 37, 84, 0.8);
        border: 1px solid rgba(96, 165, 250, 0.4);
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
        pointer-events: none;
      `;
      card.innerHTML = `
        <div style="background:rgba(59,130,246,0.2);border-radius:50%;padding:16px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8"/><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m8 17 4-4 4 4"/></svg>
        </div>
        <p style="font-size:18px;font-weight:600;color:#dbeafe;margin:0;">Dateien hier ablegen</p>
        <p style="font-size:14px;color:rgba(147,197,253,0.7);margin:0;">Bilder, Videos und 3D-Modelle</p>
      `;
      overlay.appendChild(card);

      // Event handlers on the overlay itself — these work because the
      // overlay lives on document.body, outside the React root.
      overlay.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
      });

      overlay.addEventListener('dragleave', (e: DragEvent) => {
        // Only dismiss when cursor leaves the overlay entirely
        const related = e.relatedTarget as Node | null;
        if (!related || !overlay?.contains(related)) {
          removeOverlay();
        }
      });

      overlay.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        removeOverlay();
        if (disabledRef.current) return;
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
          processFilesRef.current(e.dataTransfer.files);
        }
      });

      document.body.appendChild(overlay);
      setIsDragging(true);
    };

    const removeOverlay = () => {
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
      dragCounterRef.current = 0;
      setIsDragging(false);
    };

    // Detect file drags entering our dropzone area via document-level capture
    const onDocDragEnter = (e: DragEvent) => {
      if (disabledRef.current) return;
      if (!isFileDrag(e.dataTransfer)) return;

      // Check if cursor entered our dropzone area
      const target = e.target as Node;
      if (el.contains(target) || el === target) {
        dragCounterRef.current += 1;
        if (dragCounterRef.current === 1) {
          showOverlay();
        }
      }
    };

    const onDocDragLeave = (e: DragEvent) => {
      if (disabledRef.current) return;
      const target = e.target as Node;
      if (el.contains(target) || el === target) {
        dragCounterRef.current -= 1;
        if (dragCounterRef.current <= 0) {
          removeOverlay();
        }
      }
    };

    // Prevent browser default file-open on drop anywhere
    const onDocDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDocDrop = (e: DragEvent) => {
      e.preventDefault();
      removeOverlay();
    };

    document.addEventListener('dragenter', onDocDragEnter, true);
    document.addEventListener('dragleave', onDocDragLeave, true);
    document.addEventListener('dragover', onDocDragOver);
    document.addEventListener('drop', onDocDrop);

    return () => {
      removeOverlay();
      document.removeEventListener('dragenter', onDocDragEnter, true);
      document.removeEventListener('dragleave', onDocDragLeave, true);
      document.removeEventListener('dragover', onDocDragOver);
      document.removeEventListener('drop', onDocDrop);
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
