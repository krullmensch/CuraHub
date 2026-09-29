import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/store/authStore';
import type { OpenBook } from '@/store/bookViewerStore';
import { closeBook } from '@/lib/book/viewerActions';
import { bookPdfUrl } from '@/lib/book/api';
import { buildSpreads, spreadLabel, type Spread } from '@/lib/book/spread';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const SINGLE_BELOW_PX = 900;

function PageCanvas({ doc, page, maxHeight, maxWidth }: { doc: pdfjs.PDFDocumentProxy; page: number; maxHeight: number; maxWidth: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: pdfjs.RenderTask | null = null;
    doc.getPage(page).then((p) => {
      if (cancelled || !canvasRef.current) return;
      const base = p.getViewport({ scale: 1 });
      const fit = Math.min(maxHeight / base.height, maxWidth / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = p.getViewport({ scale: fit * dpr });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      task = p.render({ canvas, viewport });
      task.promise.catch(() => undefined);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, maxHeight, maxWidth]);
  return <canvas ref={canvasRef} className="block bg-white shadow-2xl" />;
}

export default function BookViewerOverlay({ book }: { book: OpenBook }) {
  const token = useAuthStore((s) => s.token);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState<'next' | 'prev' | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const task = pdfjs.getDocument({
      url: bookPdfUrl(book.assetId),
      httpHeaders: token && !book.publicView ? { Authorization: `Bearer ${token}` } : undefined,
      disableAutoFetch: true,
      disableStream: true,
      rangeChunkSize: 1 << 20,
    });
    task.promise.then(setDoc, () => setFailed(true));
    return () => { void task.destroy(); };
  }, [book.assetId, book.publicView, token]);

  const pageCount = doc?.numPages ?? book.pageCount;
  const single = viewport.w < SINGLE_BELOW_PX;
  const spreads = useMemo(() => buildSpreads(pageCount, single), [pageCount, single]);
  const current: Spread | undefined = spreads[Math.min(index, spreads.length - 1)];

  const go = useCallback((delta: 1 | -1) => {
    setIndex((i) => {
      const next = Math.max(0, Math.min(spreads.length - 1, i + delta));
      if (next !== i) setTurn(delta > 0 ? 'next' : 'prev');
      return next;
    });
  }, [spreads.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const pageMaxH = viewport.h - 140;
  const pageMaxW = single ? viewport.w - 120 : (viewport.w - 160) / 2;
  // Neighbouring spreads are rendered hidden so turning shows a finished page.
  const neighbours = [spreads[index - 1], spreads[index + 1]].filter(Boolean) as Spread[];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) closeBook('escape'); }}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-[1100] bg-black/85" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[1101] flex flex-col items-center justify-center outline-none"
          onEscapeKeyDown={(e) => {
            // Radix listens on document in the capture phase: stop here so EditorPage's window keydown (escape branch) never sees this ESC.
            e.stopPropagation();
            e.preventDefault();
            closeBook('escape');
          }}
        >
          <DialogTitle className="absolute left-6 top-5 text-sm font-medium text-white/80">{book.title}</DialogTitle>
          <button
            type="button"
            onClick={() => closeBook('button')}
            className="absolute right-5 top-4 flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" /> Schließen
          </button>

          {failed ? (
            <p className="text-sm text-white/80">Buch konnte nicht geladen werden</p>
          ) : !doc || !current ? (
            <Loader2 className="h-8 w-8 animate-spin text-white/70" />
          ) : (
            <>
              <div className="flex items-center gap-0" key={index}>
                {!single && (
                  <div className={turn === 'prev' ? 'book-turn-prev' : ''} style={{ minWidth: 1 }} onClick={() => go(-1)}>
                    {current.left !== null && <PageCanvas doc={doc} page={current.left} maxHeight={pageMaxH} maxWidth={pageMaxW} />}
                  </div>
                )}
                <div className={turn === 'next' ? 'book-turn-next' : ''} onClick={() => go(1)}>
                  {current.right !== null && <PageCanvas doc={doc} page={current.right} maxHeight={pageMaxH} maxWidth={pageMaxW} />}
                </div>
              </div>
              <div className="hidden" aria-hidden>
                {neighbours.flatMap((s) => [s.left, s.right]).filter((p): p is number => p !== null).map((p) => (
                  <PageCanvas key={p} doc={doc} page={p} maxHeight={pageMaxH} maxWidth={pageMaxW} />
                ))}
              </div>
              <div className="mt-4 flex items-center gap-4 text-sm text-white/80">
                <button type="button" onClick={() => go(-1)} disabled={index === 0} className="rounded p-2 hover:bg-white/10 disabled:opacity-30" aria-label="Zurückblättern">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="tabular-nums">{spreadLabel(current, pageCount)}</span>
                <button type="button" onClick={() => go(1)} disabled={index >= spreads.length - 1} className="rounded p-2 hover:bg-white/10 disabled:opacity-30" aria-label="Weiterblättern">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
