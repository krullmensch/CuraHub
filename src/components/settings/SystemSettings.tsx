import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { SystemCheckList } from '@/components/setup/SystemCheckList';
import type { SetupCheck } from '@/lib/setup/setupApi';
import { LoadingState } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';

interface SystemState {
  checks: SetupCheck[];
  publicUrl: string | null;
  version: string;
}

/** Settings → Administration → System: the read-only system checks (same as the setup wizard's). */
export function SystemSettings() {
  const token = useAuthStore((s) => s.token);
  const [system, setSystem] = useState<SystemState | null>(null);
  // The checks run on the server (Chromium start, backups, …) and can take a few seconds.
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/admin/system', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as SystemState;
        if (!cancelled) { setSystem(data); setFailed(false); }
      })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, run]);

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-400">
          {system ? <>{system.publicUrl ?? 'keine öffentliche Adresse gesetzt'} · Version {system.version}</> : '\u00a0'}
        </p>
        <Button
          variant="outline"
          size="sm"
          loading={loading && system !== null}
          disabled={loading}
          onClick={() => { setLoading(true); setRun((n) => n + 1); }}
          className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white"
        >
          {!(loading && system !== null) && <RefreshCw />}
          Erneut prüfen
        </Button>
      </div>
      {system ? (
        <SystemCheckList checks={system.checks} />
      ) : loading ? (
        <LoadingState inline label="Systemprüfung läuft …" />
      ) : failed && (
        <p className="text-sm text-red-400">Die Systemprüfung konnte nicht geladen werden.</p>
      )}
    </div>
  );
}
