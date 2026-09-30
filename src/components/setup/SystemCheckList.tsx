import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { SetupCheck } from '@/lib/setup/setupApi';

const ICON = {
  ok: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-label="OK" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-label="Warnung" />,
  fail: <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-label="Fehler" />,
};

/** Traffic-light list of the server's system checks (setup wizard and admin page). */
export function SystemCheckList({ checks }: { checks: SetupCheck[] }) {
  return (
    <ul className="grid gap-2.5">
      {checks.map((c) => (
        <li key={c.id} className="flex gap-2.5 text-sm">
          {ICON[c.status]}
          <div>
            <div className="text-white/85">{c.label}</div>
            <div className="text-white/40 text-xs">{c.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
