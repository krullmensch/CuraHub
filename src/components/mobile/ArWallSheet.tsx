import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Grid } from 'ldrs/react';
import 'ldrs/react/Grid.css';
import { ArtworkArBuilder } from './ArtworkArBuilder';
import { ArRequests } from '@/lib/mobilePlanner/arRequest';
import { useEditorStore, type ArtworkInstanceData } from '@/store/editorStore';
import { toast } from '@/hooks/use-toast';
import type { ModelViewerElement } from '@/types/model-viewer';

interface ArWallSheetProps {
  instance: ArtworkInstanceData;
  title: string;
  sizeLabel: string;
  onClose: () => void;
}

/**
 * Full-screen sheet: builds the artwork's GLB in the browser and shows it in `<model-viewer>`, which
 * places it on a wall at real size (WebXR on Android, Quick Look on iOS — model-viewer makes the
 * USDZ itself). Nothing is uploaded; the object URL dies with the sheet.
 */
export default function ArWallSheet({ instance, title, sizeLabel, onClose }: ArWallSheetProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [arSupported, setArSupported] = useState(true);
  const requests = useRef(new ArRequests());
  const [token] = useState(() => requests.current.start());
  const viewer = useRef<ModelViewerElement>(null);

  // model-viewer is ~1 MB with its own three.js — only loaded when AR is actually opened.
  useEffect(() => {
    let cancelled = false;
    import('@google/model-viewer/dist/model-viewer.min.js')
      .then(() => { if (!cancelled) setViewerReady(true); })
      .catch((err) => {
        console.error('model-viewer konnte nicht geladen werden', err);
        toast.error('AR-Modell konnte nicht erstellt werden.');
        onClose();
      });
    return () => { cancelled = true; };
  }, [onClose]);

  // Locks the editor's controls and keys while the sheet is open.
  useEffect(() => {
    useEditorStore.getState().setDialogOpen(true);
    const reqs = requests.current;
    return () => {
      useEditorStore.getState().setDialogOpen(false);
      reqs.cancel();
    };
  }, []);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const onDone = useCallback((glb: Blob) => {
    if (!requests.current.isCurrent(token)) return;
    setUrl(URL.createObjectURL(glb));
  }, [token]);

  const onError = useCallback((err: unknown) => {
    if (!requests.current.isCurrent(token)) return;
    console.error('AR-Modell', err);
    toast.error('AR-Modell konnte nicht erstellt werden.');
    onClose();
  }, [token, onClose]);

  useEffect(() => {
    const el = viewer.current;
    if (!el || !url) return;
    const onLoad = () => setArSupported(el.canActivateAR);
    el.addEventListener('load', onLoad);
    return () => el.removeEventListener('load', onLoad);
  }, [url, viewerReady]);

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col bg-zinc-950 text-white" style={{ height: '100dvh' }}>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <div className="min-w-0">
          <div className="truncate font-semibold" style={{ fontFamily: '"Funnel Display", sans-serif' }}>{title}</div>
          <div className="text-xs text-zinc-400">{sizeLabel}</div>
        </div>
        <button type="button" aria-label="Schließen" onClick={onClose} className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800">
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1">
        {!url && <ArtworkArBuilder instance={instance} onDone={onDone} onError={onError} />}
        {(!url || !viewerReady) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Grid size="48" speed="1.5" color="white" />
          </div>
        )}
        {url && viewerReady && (
          <model-viewer
            ref={viewer}
            src={url}
            alt={title}
            ar
            ar-modes="webxr quick-look"
            ar-placement="wall"
            ar-scale="fixed"
            camera-controls
            touch-action="none"
            shadow-intensity="0.6"
            style={{ width: '100%', height: '100%', background: '#18181b' }}
          />
        )}
      </div>

      <div className="border-t border-zinc-800 px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {arSupported ? (
          <button
            type="button"
            disabled={!url || !viewerReady}
            onClick={() => { void viewer.current?.activateAR(); }}
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold disabled:opacity-50"
          >
            In AR an Wand starten
          </button>
        ) : (
          <p className="text-center text-sm text-zinc-400">AR wird auf diesem Gerät nicht unterstützt</p>
        )}
      </div>
    </div>
  );
}
