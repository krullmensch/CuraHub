import { lazy, Suspense } from 'react';
import { useBookViewerStore } from '@/store/bookViewerStore';

// pdf.js lives only in this chunk; nothing PDF-related loads before a book is opened.
const BookViewerOverlay = lazy(() => import('./BookViewerOverlay'));

export function BookViewerHost() {
  const book = useBookViewerStore((s) => s.book);
  if (!book) return null;
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[1100] bg-black/85" />}>
      <BookViewerOverlay key={book.assetId} book={book} />
    </Suspense>
  );
}
