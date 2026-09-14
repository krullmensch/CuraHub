import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';

/**
 * VID-03/VID-04: background processing state of a video asset
 * (GET /api/assets/:id/processing) — transcode, thumbnail and the smaller proxy versions.
 */

export type VideoJobPhase = 'queued' | 'analyzing' | 'remuxing' | 'transcoding' | 'thumbnail' | 'proxies';

export interface VideoProcessingState {
    status: string;
    path: string;
    size: number;
    width: number | null;
    height: number | null;
    duration: number | null;
    thumbnailPath: string | null;
    error: string | null;
    /** The video is usable; smaller versions for the low/medium presets are still being created. */
    proxiesPending: boolean;
    videoProxies: Record<string, string> | null;
    job: {
        phase: VideoJobPhase;
        percent: number | null;
        phaseStartedAt: number;
        /** ms since the phase started (server clock). */
        phaseElapsedMs: number;
        source: { codec: string | null; width: number; height: number; duration: number; sizeBytes: number } | null;
        queuePosition: number | null;
        proxyHeight: number | null;
    } | null;
}

export const VIDEO_PHASE_LABELS: Record<VideoJobPhase, string> = {
    queued: 'Warteschlange',
    analyzing: 'Analyse',
    remuxing: 'Übernahme',
    transcoding: 'Umwandlung',
    thumbnail: 'Vorschaubild',
    proxies: 'Kleinere Versionen',
};

const POLL_MS = 2000;

export const isVideoWorkPending = (state: Pick<VideoProcessingState, 'status' | 'proxiesPending'>) =>
    state.status === 'processing' || state.proxiesPending;

/** Polls every 2 s while `active`, until processing and proxy creation are finished. */
export function useVideoProcessing(assetId: number, active = true) {
    const token = useAuthStore((state) => state.token);
    const [state, setState] = useState<VideoProcessingState | null>(null);
    const [loadError, setLoadError] = useState(false);

    useEffect(() => {
        if (!active) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const poll = async () => {
            try {
                const res = await fetch(`/api/assets/${assetId}/processing`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: VideoProcessingState = await res.json();
                if (cancelled) return;
                setState(data);
                setLoadError(false);
                if (!isVideoWorkPending(data)) return;
            } catch {
                if (!cancelled) setLoadError(true);
            }
            if (!cancelled) timer = setTimeout(poll, POLL_MS);
        };
        poll();

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [assetId, token, active]);

    return { state, loadError };
}
