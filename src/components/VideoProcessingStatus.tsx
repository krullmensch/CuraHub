import { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { useVideoProcessing, type VideoJobPhase, type VideoProcessingState } from '../hooks/use-video-processing';
import { cn } from '@/lib/utils';

/**
 * VID-03: step-by-step state of a video that is processed in the background
 * (GET /api/assets/:id/processing). Polls while processing and hands the final asset fields
 * to `onFinished` once the job is done or failed.
 */

/** @deprecated alias kept for MetadataDialog */
export type ProcessedAssetFields = VideoProcessingState;

const CODEC_LABELS: Record<string, string> = {
    h264: 'H.264', hevc: 'H.265/HEVC', vp9: 'VP9', vp8: 'VP8', av1: 'AV1', prores: 'ProRes', mpeg4: 'MPEG-4',
};

const ERROR_LABELS: Record<string, string> = {
    'transcode-failed': 'Das Video konnte nicht umgewandelt werden. Bitte die Datei prüfen und erneut hochladen.',
    'source-missing': 'Die Originaldatei fehlt auf dem Server. Bitte das Video erneut hochladen.',
};

const formatBytes = (bytes: number) =>
    bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;

const formatDuration = (seconds: number) => {
    const total = Math.round(seconds);
    const m = Math.floor(total / 60);
    return `${m}:${String(total % 60).padStart(2, '0')} min`;
};

type StepState = 'done' | 'active' | 'pending';

const Step = ({ state, label, detail, children }: { state: StepState; label: string; detail?: string; children?: React.ReactNode }) => (
    <li className="flex gap-3">
        <div className="pt-0.5">
            {state === 'done' && <CheckCircle2 className="h-4 w-4 text-green-400" />}
            {state === 'active' && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
            {state === 'pending' && <Circle className="h-4 w-4 text-zinc-600" />}
        </div>
        <div className="min-w-0 flex-1">
            <p className={cn('text-sm', state === 'pending' ? 'text-zinc-500' : 'text-zinc-100')}>{label}</p>
            {detail && <p className="text-xs text-zinc-400">{detail}</p>}
            {children}
        </div>
    </li>
);

export function VideoProcessingStatus({ assetId, onFinished }: { assetId: number; onFinished: (fields: VideoProcessingState) => void }) {
    const { state, loadError } = useVideoProcessing(assetId);
    const onFinishedRef = useRef(onFinished);
    const reported = useRef(false);
    useEffect(() => {
        onFinishedRef.current = onFinished;
    }, [onFinished]);
    useEffect(() => {
        if (!state || state.status === 'processing' || reported.current) return;
        reported.current = true;
        onFinishedRef.current(state);
    }, [state]);

    if (!state) {
        return (
            <div className="flex h-48 w-full items-center justify-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                {loadError ? 'Verarbeitungsstatus nicht erreichbar, neuer Versuch …' : 'Verarbeitungsstatus wird geladen …'}
            </div>
        );
    }

    if (state.status === 'failed') {
        return (
            <div className="flex w-full items-start gap-3 rounded-md border border-amber-700/50 bg-amber-950/30 p-4">
                <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
                <div>
                    <p className="text-sm font-medium text-amber-200">Verarbeitung fehlgeschlagen</p>
                    <p className="text-xs text-amber-200/80">{ERROR_LABELS[state.error ?? ''] ?? 'Unbekannter Fehler bei der Verarbeitung.'}</p>
                </div>
            </div>
        );
    }

    const job = state.job;
    const phase: VideoJobPhase | null = job?.phase ?? null;
    const order: VideoJobPhase[] = ['queued', 'analyzing', 'transcoding', 'thumbnail'];
    const phaseIndex = phase ? order.indexOf(phase === 'remuxing' ? 'transcoding' : phase) : -1;
    const stepState = (index: number): StepState => (phaseIndex > index ? 'done' : phaseIndex === index ? 'active' : 'pending');

    const source = job?.source;
    const sourceDetail = source
        ? [
            source.codec ? CODEC_LABELS[source.codec] ?? source.codec.toUpperCase() : null,
            source.width && source.height ? `${source.width}×${source.height}` : null,
            source.duration ? formatDuration(source.duration) : null,
            formatBytes(source.sizeBytes),
        ].filter(Boolean).join(' · ')
        : undefined;

    const percent = job?.percent ?? null;
    let remaining: string | undefined;
    if (percent !== null && percent >= 2 && percent < 100 && job) {
        const elapsed = job.phaseElapsedMs;
        if (elapsed > 0) {
            const seconds = (elapsed * (100 - percent)) / percent / 1000;
            remaining = seconds < 60 ? 'noch < 1 min' : `noch ca. ${Math.ceil(seconds / 60)} min`;
        }
    }

    const conversionLabel = phase === 'remuxing'
        ? 'Übernahme ohne Neukodierung (bereits H.264)'
        : phase === 'transcoding' || phaseIndex > 2
            ? 'Umwandlung zu H.264, max. 1920×1080'
            : 'Umwandlung für den Browser';

    return (
        <div className="w-full space-y-3 p-2">
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-100">Video wird verarbeitet</p>
                <p className="text-xs text-zinc-500">Das Werk kann danach platziert werden.</p>
            </div>
            <ol className="space-y-2.5">
                <Step state="done" label="Hochgeladen" detail={sourceDetail ? `Original: ${sourceDetail}` : undefined} />
                <Step
                    state={phase === null ? 'active' : stepState(0)}
                    label="Warteschlange"
                    detail={phase === 'queued' && job?.queuePosition ? `Position ${job.queuePosition}, es wird jeweils ein Video verarbeitet` : phase === null ? 'Wird vorbereitet …' : undefined}
                />
                <Step state={stepState(1)} label="Analyse" detail={phase === 'analyzing' ? 'Codec, Auflösung und Dauer werden gelesen' : undefined} />
                <Step state={stepState(2)} label={conversionLabel}>
                    {(phase === 'transcoding' || phase === 'remuxing') && (
                        <div className="mt-1.5 space-y-1">
                            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                                <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${percent ?? 0}%` }} />
                            </div>
                            <p className="text-xs text-zinc-400">
                                {percent !== null ? `${Math.floor(percent)} %` : 'läuft …'}
                                {remaining ? ` · ${remaining}` : ''}
                            </p>
                        </div>
                    )}
                </Step>
                <Step state={stepState(3)} label="Vorschaubild erzeugen" />
            </ol>
        </div>
    );
}

/** VID-04: shown under a ready video while its smaller versions are still created. */
export function VideoProxiesProgress({ assetId }: { assetId: number }) {
    const { state } = useVideoProcessing(assetId);
    if (!state?.proxiesPending) return null;
    const job = state.job;
    const text = job?.phase === 'proxies'
        ? `Kleinere Versionen für die Qualitätsstufen Niedrig/Mittel werden erstellt${job.proxyHeight ? ` (${job.proxyHeight}p)` : ''}${job.percent !== null ? ` · ${Math.floor(job.percent)} %` : ''}`
        : `Kleinere Versionen für die Qualitätsstufen warten auf Verarbeitung${job?.queuePosition ? ` (Position ${job.queuePosition})` : ''}`;
    return (
        <p className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            {text}
        </p>
    );
}
