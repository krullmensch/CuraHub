import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookPreviewTileProps {
  filename: string;
  thumbnailPath?: string | null;
  pageCount?: number;
  compact?: boolean;
}

/** Asset tile of a PDF book: the cover thumbnail with a page-count badge. */
export function BookPreviewTile({ filename, thumbnailPath, pageCount, compact }: BookPreviewTileProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-zinc-800">
      {thumbnailPath
        ? <img src={thumbnailPath} alt={filename} className="h-full w-full object-contain" draggable={false} loading="lazy" decoding="async" />
        : <BookOpen className={cn('text-zinc-500', compact ? 'h-6 w-6' : 'h-10 w-10')} />}
      <div className="pointer-events-none absolute left-1 top-1 flex items-center gap-1 rounded bg-black/60 px-1 py-0.5 text-[9px] leading-none text-white">
        <BookOpen className="h-2.5 w-2.5" />
        {pageCount ? `${pageCount} S.` : 'PDF'}
      </div>
    </div>
  );
}
