import { useState, useRef, useEffect } from 'react';
import { Box, Loader2, AlertTriangle } from 'lucide-react';
import { getModelThumbnail } from '@/lib/modelThumbnailRenderer';

interface ModelPreviewCardProps {
    url: string;
    compact?: boolean;
}

function FallbackSpinner() {
    return (
        <div className="flex items-center justify-center w-full h-full">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
        </div>
    );
}

// RND-09: previously mounted one <Canvas> (= one WebGL context) per card and
// never unmounted it, exhausting Chrome's ~16-context budget and knocking
// out the main editor canvas. Now renders through the single shared
// offscreen renderer in `src/lib/modelThumbnailRenderer.ts` and just shows
// the resulting cached image.
export function ModelPreviewCard({ url, compact = false }: ModelPreviewCardProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);

    // IntersectionObserver — only request a thumbnail once the card scrolls into view.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => setIsVisible(entry.isIntersecting),
            { threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isVisible || thumbnailUrl || hasError) return;
        let cancelled = false;
        getModelThumbnail(url, compact ? 256 : 512)
            .then((blobUrl) => {
                if (!cancelled) setThumbnailUrl(blobUrl);
            })
            .catch(() => {
                if (!cancelled) setHasError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [isVisible, url, compact, thumbnailUrl, hasError]);

    const iconSize = compact ? 'h-8 w-8' : 'h-12 w-12';

    return (
        <div
            ref={containerRef}
            className="flex flex-col items-center justify-center gap-1 w-full h-full"
        >
            {thumbnailUrl ? (
                <img
                    src={thumbnailUrl}
                    alt="3D-Modell-Vorschau"
                    className="w-full h-full object-contain"
                />
            ) : hasError ? (
                <div className="flex flex-col items-center gap-1 text-red-400">
                    <AlertTriangle className={iconSize} />
                    <span className="text-[10px] text-center">Vorschau nicht verfügbar</span>
                </div>
            ) : isVisible ? (
                <FallbackSpinner />
            ) : (
                <Box className={`${iconSize} text-purple-400`} />
            )}
        </div>
    );
}
