import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Asset card preview for Gaussian splats (no rendered thumbnail yet). */
export const SplatPreviewTile = ({ filename, compact = false }: { filename?: string; compact?: boolean }) => {
    const ext = filename?.split('.').pop()?.toLowerCase();
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-zinc-800 to-zinc-900 text-zinc-300">
            <Sparkles className={cn('text-sky-300', compact ? 'h-5 w-5' : 'h-8 w-8')} />
            {!compact && (
                <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400">
                    Gaussian Splat{ext ? ` · .${ext}` : ''}
                </span>
            )}
        </div>
    );
};
