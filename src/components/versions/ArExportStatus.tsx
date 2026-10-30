import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useEditorStore } from '@/store/editorStore';
import { useLiveStore } from '@/store/liveStore';
import { toast } from '@/hooks/use-toast';
import { arExportStatusText, type ArExportStatus as Status } from '@/lib/arExport/statusText';

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

  const download = async (kind: 'glb' | 'usdz') => {
    if (!token) return;
    try {
      const res = await fetch(`${base}/${kind}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exhibitionSlug || `ausstellung-${versionId}`}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error('Download fehlgeschlagen.');
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
      <span className={status?.status === 'failed' ? 'text-red-400' : 'text-zinc-400'}>
        {status === null ? 'Lade…' : text ? text.line : 'Noch nicht erzeugt'}
        {text?.detail && <span className="text-zinc-500"> · {text.detail}</span>}
      </span>
      <div className="flex items-center gap-2 ml-auto">
        {status?.status === 'done' && (
          <>
            {status.glbSize != null && (
              <button type="button" className={btn} onClick={() => void download('glb')}>
                <Download className="h-3.5 w-3.5" />
                GLB herunterladen
              </button>
            )}
            {status.usdzSize != null && (
              <button type="button" className={btn} onClick={() => void download('usdz')}>
                <Download className="h-3.5 w-3.5" />
                USDZ herunterladen
              </button>
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
            <RefreshCw className="h-3.5 w-3.5" />
            Neu erzeugen
          </button>
        )}
      </div>
    </div>
  );
};
