import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { ProgressBar, Spinner } from '@/components/ui/loading';
import { formatLoadedBytes, progressPercent, readBlobWithProgress } from '@/lib/loading/progress';

interface ArQuickLookSheetProps {
  /** Same-origin URL of the published version's USDZ. */
  usdzUrl: string;
  title: string;
  onClose: () => void;
}

type LoadState =
  | { phase: 'loading'; fraction: number | null; loaded: number; total: number | null }
  | { phase: 'ready'; objectUrl: string }
  | { phase: 'failed' };

/** Quick Look needs a real click on an <a rel="ar"> with an <img> child, inside the user's tap. */
function openQuickLook(href: string) {
  const a = document.createElement('a');
  a.rel = 'ar';
  a.href = href;
  a.appendChild(document.createElement('img'));
  a.click();
}

/**
 * iOS AR for the whole exhibition. A plain `<a rel="ar">` gives no feedback while Safari downloads
 * the USDZ (often tens of MB), so the sheet downloads it itself with a progress bar and hands the
 * finished file to Quick Look on the next tap (Quick Look needs a fresh user gesture).
 */
export default function ArQuickLookSheet({ usdzUrl, title, onClose }: ArQuickLookSheetProps) {
  const [state, setState] = useState<LoadState>({ phase: 'loading', fraction: null, loaded: 0, total: null });
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let lastPercent = -1;
    (async () => {
      try {
        const res = await fetch(usdzUrl, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await readBlobWithProgress(res, (fraction, loaded, total) => {
          // At most ~100 re-renders per download.
          const percent = fraction == null ? Math.floor(loaded / (512 * 1024)) : progressPercent(fraction);
          if (percent === lastPercent) return;
          lastPercent = percent;
          setState({ phase: 'loading', fraction, loaded, total });
        }, 'model/vnd.usdz+zip');
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        objectUrl.current = url;
        setState({ phase: 'ready', objectUrl: url });
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('AR-Modell konnte nicht geladen werden', err);
        setState({ phase: 'failed' });
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    };
  }, [usdzUrl]);

  // Locks the viewer's controls (sticks, keys) while the sheet is open.
  useEffect(() => {
    useEditorStore.getState().setDialogOpen(true);
    return () => useEditorStore.getState().setDialogOpen(false);
  }, []);

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col bg-zinc-950 text-white" style={{ height: '100dvh' }}>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <div className="min-w-0 truncate font-semibold" style={{ fontFamily: '"Funnel Display", sans-serif' }}>{title}</div>
        <button type="button" aria-label="Schließen" onClick={onClose} className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800">
          <X size={20} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        {state.phase === 'loading' && (
          <div role="status" aria-live="polite" className="flex w-full max-w-xs flex-col items-center gap-4">
            <Spinner className="h-8 w-8 text-white/80" />
            <p className="text-sm text-zinc-200">AR-Modell wird geladen …</p>
            <ProgressBar value={state.fraction} label="AR-Modell wird geladen" />
            {state.loaded > 0 && (
              <p className="text-xs tabular-nums text-zinc-400">
                {state.fraction != null ? `${progressPercent(state.fraction)} % · ` : ''}
                {formatLoadedBytes(state.loaded, state.total)}
              </p>
            )}
          </div>
        )}
        {state.phase === 'ready' && (
          <p className="text-sm text-zinc-300">Das AR-Modell ist geladen.</p>
        )}
        {state.phase === 'failed' && (
          <p className="text-sm text-zinc-400">AR-Modell konnte nicht geladen werden.</p>
        )}
      </div>

      <div className="border-t border-zinc-800 px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {state.phase === 'failed' ? (
          // Fallback: let Safari load it itself (no progress, but it may still work).
          <button
            type="button"
            onClick={() => openQuickLook(usdzUrl)}
            className="w-full rounded-lg bg-zinc-800 py-3 text-sm font-semibold"
          >
            Trotzdem in AR öffnen
          </button>
        ) : (
          <button
            type="button"
            disabled={state.phase !== 'ready'}
            onClick={() => { if (state.phase === 'ready') openQuickLook(state.objectUrl); }}
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold disabled:opacity-50"
          >
            {state.phase === 'ready' ? 'In AR starten' : 'Ausstellung wird geladen…'}
          </button>
        )}
      </div>
    </div>
  );
}
