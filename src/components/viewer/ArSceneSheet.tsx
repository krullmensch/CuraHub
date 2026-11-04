import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Grid } from 'ldrs/react';
import 'ldrs/react/Grid.css';
import { useEditorStore } from '@/store/editorStore';
import type { ModelViewerElement } from '@/types/model-viewer';

interface ArSceneSheetProps {
  /** Absolute or same-origin URL of the published version's GLB. */
  glbUrl: string;
  title: string;
  onClose: () => void;
}

/**
 * Android AR for the whole exhibition: `<model-viewer>` with WebXR in Chrome itself. Google's Scene
 * Viewer rejects files over 15 MB and drops most material extensions, so it is only model-viewer's
 * fallback when WebXR is missing. AR needs a tap after the model has loaded.
 */
export default function ArSceneSheet({ glbUrl, title, onClose }: ArSceneSheetProps) {
  const [viewerReady, setViewerReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [arSupported, setArSupported] = useState(true);
  const [failed, setFailed] = useState(false);
  const viewer = useRef<ModelViewerElement>(null);

  // model-viewer is ~1 MB with its own three.js — only loaded when AR is actually opened.
  useEffect(() => {
    let cancelled = false;
    import('@google/model-viewer/dist/model-viewer.min.js')
      .then(() => { if (!cancelled) setViewerReady(true); })
      .catch((err) => {
        console.error('model-viewer konnte nicht geladen werden', err);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Locks the viewer's controls (sticks, keys) while the sheet is open.
  useEffect(() => {
    useEditorStore.getState().setDialogOpen(true);
    return () => useEditorStore.getState().setDialogOpen(false);
  }, []);

  useEffect(() => {
    const el = viewer.current;
    if (!el) return;
    const onProgress = (e: Event) => {
      const total = (e as CustomEvent<{ totalProgress?: number }>).detail?.totalProgress;
      if (typeof total === 'number') setProgress(total);
    };
    const onLoad = () => {
      setLoaded(true);
      setArSupported(el.canActivateAR);
    };
    const onError = (e: Event) => {
      console.error('AR-Modell konnte nicht geladen werden', e);
      setFailed(true);
    };
    el.addEventListener('progress', onProgress);
    el.addEventListener('load', onLoad);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('progress', onProgress);
      el.removeEventListener('load', onLoad);
      el.removeEventListener('error', onError);
    };
  }, [viewerReady]);

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col bg-zinc-950 text-white" style={{ height: '100dvh' }}>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <div className="min-w-0 truncate font-semibold" style={{ fontFamily: '"Funnel Display", sans-serif' }}>{title}</div>
        <button type="button" aria-label="Schließen" onClick={onClose} className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800">
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1">
        {viewerReady && (
          <model-viewer
            ref={viewer}
            src={glbUrl}
            alt={title}
            ar
            ar-modes="webxr scene-viewer"
            ar-placement="floor"
            camera-controls
            touch-action="none"
            shadow-intensity="0.6"
            style={{ width: '100%', height: '100%', background: '#18181b' }}
          />
        )}
        {!loaded && !failed && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Grid size="48" speed="1.5" color="white" />
            <span className="text-sm text-zinc-300">{Math.round(progress * 100)} %</span>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {failed ? (
          <p className="text-center text-sm text-zinc-400">AR-Modell konnte nicht geladen werden</p>
        ) : arSupported ? (
          <button
            type="button"
            disabled={!loaded}
            onClick={() => { void viewer.current?.activateAR(); }}
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold disabled:opacity-50"
          >
            {loaded ? 'In AR starten' : 'Ausstellung wird geladen…'}
          </button>
        ) : (
          <p className="text-center text-sm text-zinc-400">AR wird auf diesem Gerät nicht unterstützt</p>
        )}
      </div>
    </div>
  );
}
