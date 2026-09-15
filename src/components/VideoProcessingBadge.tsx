import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { isVideoWorkPending, useVideoProcessing, VIDEO_PHASE_LABELS } from '../hooks/use-video-processing';
import { cn } from '@/lib/utils';

interface VideoProcessingBadgeProps {
    assetId: number;
    /** true while the video itself is processed (covers the tile); false while only proxies are created. */
    blocking: boolean;
    size?: 'sm' | 'md';
    /** Called once all work finished, so the asset list can reload the final asset. */
    onSettled: () => void;
}

/** VID-03/VID-04: processing progress on an asset tile. */
export function VideoProcessingBadge({ assetId, blocking, size = 'sm', onSettled }: VideoProcessingBadgeProps) {
    const { state } = useVideoProcessing(assetId);
    const onSettledRef = useRef(onSettled);
    useEffect(() => {
        onSettledRef.current = onSettled;
    }, [onSettled]);

    const settled = state !== null && !isVideoWorkPending(state);
    useEffect(() => {
        if (settled) onSettledRef.current();
    }, [settled]);

    const job = state?.job;
    const percent = job?.percent ?? null;
    const detail = job?.phase === 'queued' && job.queuePosition
        ? `Pos. ${job.queuePosition}`
        : job?.phase === 'proxies' && job.proxyHeight
            ? `${job.proxyHeight}p`
            : null;
    const text = [
        job ? VIDEO_PHASE_LABELS[job.phase] : blocking ? 'Wird verarbeitet' : 'Kleinere Versionen',
        detail,
        percent !== null ? `${Math.floor(percent)} %` : null,
    ].filter(Boolean).join(' · ');

    const bar = (
        <div className={cn('overflow-hidden rounded-full bg-zinc-700', blocking ? 'h-1' : 'h-0.5')}>
            <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${percent ?? 0}%` }} />
        </div>
    );

    if (!blocking) {
        // The video is already usable — a slim strip that doesn't hide the thumbnail.
        return (
            <div className="pointer-events-none absolute inset-x-0 top-0 space-y-0.5 bg-black/70 px-1.5 py-1">
                <p className={cn('truncate leading-none text-white', size === 'sm' ? 'text-[9px]' : 'text-[11px]')}>{text}</p>
                {bar}
            </div>
        );
    }

    return (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 px-2 text-center">
            <Loader2 className={cn('animate-spin text-white', size === 'sm' ? 'h-4 w-4' : 'h-6 w-6')} />
            <span className={cn('leading-tight text-white', size === 'sm' ? 'text-[10px]' : 'text-xs')}>{text}</span>
            <div className={size === 'sm' ? 'w-3/4' : 'w-2/3'}>{bar}</div>
        </div>
    );
}
