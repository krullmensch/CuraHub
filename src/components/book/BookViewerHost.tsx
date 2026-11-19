import { lazy, Suspense } from 'react';
import { useBookViewerStore } from '@/store/bookViewerStore';
import { LoadingState } from '@/components/ui/loading';

// pdf.js lives only in this chunk; nothing PDF-related loads before a book is opened.
const BookViewerOverlay = lazy(() => import('./BookViewerOverlay'));

export function BookViewerHost() {
  const book = useBookViewerStore((s) => s.book);
  if (!book) return null;
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-[#eef0f5]">
          <LoadingState label="Buch wird geöffnet …" className="text-[#2c2c2c]/70" spinnerClassName="text-[#2c2c2c]/60 h-8 w-8" />
        </div>
      }
    >
      <BookViewerOverlay key={book.assetId} book={book} />
    </Suspense>
  );
}
