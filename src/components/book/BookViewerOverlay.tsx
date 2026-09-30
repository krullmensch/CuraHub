import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/store/authStore';
import type { OpenBook } from '@/store/bookViewerStore';
import { closeBook } from '@/lib/book/viewerActions';
import { bookPdfUrl } from '@/lib/book/api';
import { flipPageSize } from '@/lib/book/flipPages';
import BookFlipbook from './BookFlipbook';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface LoadedBook {
  doc: pdfjs.PDFDocumentProxy;
  pageSize: { width: number; height: number };
}

export default function BookViewerOverlay({ book }: { book: OpenBook }) {
  const token = useAuthStore((s) => s.token);
  const [loaded, setLoaded] = useState<LoadedBook | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const task = pdfjs.getDocument({
      url: bookPdfUrl(book.assetId),
      httpHeaders: token && !book.publicView ? { Authorization: `Bearer ${token}` } : undefined,
      disableAutoFetch: true,
      disableStream: true,
      rangeChunkSize: 1 << 20,
    });
    let cancelled = false;
    // page-flip lays every page out at the size of page 1
    task.promise
      .then(async (doc) => {
        const first = await doc.getPage(1);
        const view = first.getViewport({ scale: 1 });
        if (!cancelled) setLoaded({ doc, pageSize: flipPageSize(view.width, view.height) });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [book.assetId, book.publicView, token]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) closeBook('escape'); }}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-[1100] bg-[#eef0f5]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[1101] flex flex-col px-[clamp(16px,3vw,40px)] pb-[clamp(12px,2vw,28px)] pt-16 text-[#2c2c2c] outline-none"
          onEscapeKeyDown={(e) => {
            // Radix listens on document in the capture phase: stop here so EditorPage's window keydown (escape branch) never sees this ESC.
            e.stopPropagation();
            e.preventDefault();
            closeBook('escape');
          }}
        >
          <DialogTitle className="absolute left-6 top-5 max-w-[60vw] truncate text-sm font-medium text-[#2c2c2c]">{book.title}</DialogTitle>
          <button
            type="button"
            onClick={() => closeBook('button')}
            className="absolute right-5 top-4 flex items-center gap-2 rounded-full border-[1.25px] border-[#2c2c2c] px-4 py-1.5 text-sm text-[#2c2c2c] transition-colors hover:bg-[#2c2c2c] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2c2c2c]"
          >
            <X className="h-4 w-4" /> Schließen
          </button>

          {failed ? (
            <p className="m-auto text-sm">Buch konnte nicht geladen werden</p>
          ) : !loaded ? (
            <Loader2 className="m-auto h-8 w-8 animate-spin text-[#2c2c2c]/60" />
          ) : (
            <div className="min-h-0 flex-1">
              <BookFlipbook doc={loaded.doc} pageSize={loaded.pageSize} />
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
