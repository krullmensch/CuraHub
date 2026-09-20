import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SplatPreviewTileProps {
    filename?: string;
    /** `Asset.thumbnailPath` — the 512 px variant the server rasterised at upload. */
    thumbnailPath?: string | null;
    compact?: boolean;
}

/** LOAD-04 naming: the 256 px variant sits next to the 512 px one. */
function srcSet(thumbnailPath: string): string | undefined {
    if (!thumbnailPath.endsWith('-thumb-512.webp')) return undefined;
    return `${thumbnailPath.replace(/-thumb-512\.webp$/, '-thumb-256.webp')} 256w, ${thumbnailPath} 512w`;
}

/**
 * Asset card preview for Gaussian splats. The server renders a thumbnail while converting the
 * upload to `.spz` (server/src/lib/splatThumbnail.ts); captures uploaded before that fall back to
 * the format badge.
 */
export const SplatPreviewTile = ({ filename, thumbnailPath, compact = false }: SplatPreviewTileProps) => {
    const ext = filename?.split('.').pop()?.toLowerCase();

    if (thumbnailPath) {
        return (
            <img
                src={thumbnailPath}
                srcSet={srcSet(thumbnailPath)}
                sizes={compact ? '96px' : '220px'}
                alt={filename ?? 'Gaussian Splat'}
                className="h-full w-full bg-zinc-900 object-contain"
                draggable={false}
                loading="lazy"
                decoding="async"
            />
        );
    }

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
