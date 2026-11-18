import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useEditorStore } from '@/store/editorStore';
import { useLiveStore } from '@/store/liveStore';
import { toast } from '@/hooks/use-toast';
import { arExportStatusText, type ArExportStatus as Status } from '@/lib/arExport/statusText';
import { ProgressBar, Spinner } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { progressPercent, readBlobWithProgress } from '@/lib/loading/progress';

type DownloadKind = 'glb' | 'usdz';

interface ArExportStatusProps {
  exhibitionId: number;
  versionId: number;
  /** May start a new export (everyone who may publish). */
  canRegenerate: boolean;
}

/** Row „AR-Export" for the published version: status, downloads, „Neu erzeugen". */
export const ArExportStatus = ({ exhibitionId, versionId, canRegenerate }: ArExportStatusProps) => {
  const token = useAuthStore((s) => s.token);
  const arExportRevision = useLiveStore((s) => s.arExportRevision);
  const exhibitionSlug = useEditorStore((s) => s.activeExhibitionSlug);
  const [status, setStatus] = useState<Status | null>(null);
  // Counts requests so a slow, older response never overwrites a newer one.
  const requestSeq = useRef(0);
  const [restarting, setRestarting] = useState(false);
  // The file being downloaded (exports are tens of MB) and how far it got (null = unknown size).
  const [downloading, setDownloading] = useState<{ kind: DownloadKind; fraction: number | null } | null>(null);

  const base = `/api/exhibitions/${exhibitionId}/versions/${versionId}/ar-export`;

  const load = useCallback(async () => {
    if (!token) return;
    const seq = ++requestSeq.current;
    try {
      const res = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const next = (await res.json()) as Status;
      if (seq === requestSeq.current) setStatus(next);
    } catch {
      // keep the last known state; the next live event refetches
    }
  }, [base, token]);

  // Another version or exhibition starts blank; a revision bump only refetches (no „Lade…“ flicker).
  useEffect(() => {
    setStatus(null);
  }, [exhibitionId, versionId]);

  // Fetch on mount, when the published version changes and on the live `arExport` event; no polling.
  useEffect(() => {
    void load();
  }, [load, arExportRevision]);

  const download = async (kind: DownloadKind) => {
    if (!token || downloading) return;
    setDownloading({ kind, fraction: null });
    try {
      const res = await fetch(`${base}/${kind}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      let lastPercent = -1;
      const blob = await readBlobWithProgress(res, (fraction) => {
        const percent = fraction == null ? -1 : progressPercent(fraction);
        if (percent === lastPercent) return;
        lastPercent = percent;
        setDownloading({ kind, fraction });
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exhibitionSlug || `ausstellung-${versionId}`}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error('Download fehlgeschlagen.');
    } finally {
      setDownloading(null);
    }
  };

  const regenerate = async () => {
    if (!token || restarting) return;
    setRestarting(true);
    try {
      const res = await fetch(base, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      await load();
    } catch {
      toast.error('AR-Export konnte nicht gestartet werden.');
    } finally {
      setRestarting(false);
    }
  };

  const text = status && status.status !== 'none' ? arExportStatusText(status) : null;
  const btn =
    'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

  return (
    <div className="px-3 py-2 border-b border-zinc-800 flex flex-wrap items-center gap-x-4 gap-y-1.5 shrink-0 text-xs">
      <span className="font-semibold text-zinc-200">AR-Export</span>
      <span className={`inline-flex items-center gap-1.5 ${status?.status === 'failed' ? 'text-red-400' : 'text-zinc-400'}`}>
        {(status === null || status.status === 'queued' || status.status === 'running') && (
          <Spinner className="h-3.5 w-3.5" />
        )}
        {status === null ? 'Lade…' : text ? text.line : 'Noch nicht erzeugt'}
        {text?.detail && <span className="text-zinc-500"> · {text.detail}</span>}
      </span>
      <div className="flex items-center gap-2 ml-auto">
        {status?.status === 'done' && (
          <>
            {status.glbSize != null && (
              <DownloadButton kind="glb" className={btn} downloading={downloading} onClick={() => void download('glb')} />
            )}
            {status.usdzSize != null && (
              <DownloadButton kind="usdz" className={btn} downloading={downloading} onClick={() => void download('usdz')} />
            )}
          </>
        )}
        {canRegenerate && (
          <button
            type="button"
            className={btn}
            disabled={restarting || status?.status === 'queued' || status?.status === 'running'}
            onClick={() => void regenerate()}
          >
            {restarting ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Neu erzeugen
          </button>
        )}
      </div>
    </div>
  );
};

interface DownloadButtonProps {
  kind: DownloadKind;
  className: string;
  downloading: { kind: DownloadKind; fraction: number | null } | null;
  onClick: () => void;
}

/** „GLB/USDZ herunterladen", with spinner, percentage and a thin bar while that file downloads. */
function DownloadButton({ kind, className, downloading, onClick }: DownloadButtonProps) {
  const label = kind === 'glb' ? 'GLB' : 'USDZ';
  const active = downloading?.kind === kind;
  return (
    <button
      type="button"
      className={cn(className, 'relative overflow-hidden', active && 'disabled:cursor-progress disabled:opacity-100')}
      disabled={downloading !== null}
      aria-busy={active}
      onClick={onClick}
    >
      {active ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
      {active
        ? `${label} wird geladen${downloading.fraction != null ? ` … ${progressPercent(downloading.fraction)} %` : ' …'}`
        : `${label} herunterladen`}
      {active && (
        <ProgressBar
          value={downloading.fraction}
          label={`${label} wird heruntergeladen`}
          className="absolute inset-x-0 bottom-0 h-0.5 rounded-none bg-transparent"
          barClassName="bg-blue-500"
        />
      )}
    </button>
  );
}
