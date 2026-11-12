import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { OperatorFields } from '@/components/legal/OperatorFields';
import { fetchLegalData, LEGAL_PAGES, saveLegalSettings } from '@/lib/legal/legalApi';
import { buildImprint, buildPrivacy } from '@/lib/legal/documents';
import { operatorComplete, operatorProblem, REQUIRED_OPERATOR_FIELDS, withOperatorDefaults, type LegalOperator } from '@/lib/legal/operator';

type Field = 'imprint' | 'privacy';
type Mode = 'auto' | 'custom';

interface Draft {
  operator: LegalOperator;
  imprint: string;
  privacy: string;
  modes: Record<Field, Mode>;
}

const DOCS: { field: Field; label: string; path: string }[] = [
  { field: 'imprint', label: 'Impressum', path: LEGAL_PAGES.impressum.path },
  { field: 'privacy', label: 'Datenschutzerklärung', path: LEGAL_PAGES.datenschutz.path },
];

const untouched = (op: LegalOperator) => REQUIRED_OPERATOR_FIELDS.every((f) => !op[f].trim());

/**
 * Admin block on /users: the operator's details (same form as the setup wizard), from which
 * CuraHub builds Impressum and Datenschutzerklärung; each can be replaced by an own text.
 */
export const LegalTextsEditor = ({ token }: { token: string }) => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [behindCloudflare, setBehindCloudflare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = (data: { operator: LegalOperator | null; imprint: string; privacy: string }) => {
    const next: Draft = {
      operator: withOperatorDefaults(data.operator),
      imprint: data.imprint,
      privacy: data.privacy,
      modes: { imprint: data.imprint.trim() ? 'custom' : 'auto', privacy: data.privacy.trim() ? 'custom' : 'auto' },
    };
    setDraft(next);
    setSaved(JSON.stringify(next));
  };

  useEffect(() => {
    let cancelled = false;
    fetchLegalData()
      .then((data) => { if (!cancelled) { setBehindCloudflare(data.behindCloudflare); load(data); } })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const generated = useMemo(() => {
    if (!draft || !operatorComplete(draft.operator)) return null;
    return { imprint: buildImprint(draft.operator), privacy: buildPrivacy(draft.operator, { behindCloudflare }) };
  }, [draft, behindCloudflare]);

  if (loadFailed) return <p className="text-sm text-red-400">Rechtliche Angaben konnten nicht geladen werden.</p>;
  if (!draft) return <p className="text-sm text-zinc-400">Wird geladen…</p>;

  const dirty = JSON.stringify(draft) !== saved;
  const problem = untouched(draft.operator) ? null : operatorProblem(draft.operator);

  const setMode = (field: Field, mode: Mode) => {
    // Switching to an own text starts from the generated one, so nothing has to be typed from scratch.
    const text = mode === 'custom' && !draft[field].trim() ? generated?.[field] ?? '' : draft[field];
    setDraft({ ...draft, [field]: text, modes: { ...draft.modes, [field]: mode } });
  };

  const handleSave = async () => {
    if (problem) {
      toast.error('Betreiberangaben unvollständig', { description: problem });
      return;
    }
    setSaving(true);
    try {
      const result = await saveLegalSettings(token, {
        operator: untouched(draft.operator) ? null : draft.operator,
        imprint: draft.modes.imprint === 'custom' ? draft.imprint : '',
        privacy: draft.modes.privacy === 'custom' ? draft.privacy : '',
      });
      load(result);
      toast.success('Rechtliche Angaben gespeichert');
    } catch (err) {
      toast.error('Speichern fehlgeschlagen', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6">
      <OperatorFields appearance="admin" value={draft.operator} onChange={(operator) => setDraft({ ...draft, operator })} />
      {problem && <p className="text-xs text-amber-400">{problem}</p>}

      <div className="grid gap-4">
        {DOCS.map(({ field, label, path }) => {
          const mode = draft.modes[field];
          const missing = mode === 'auto' ? !generated : !draft[field].trim();
          return (
            <div key={field} className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-zinc-200 font-medium">{label}</span>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex rounded border border-zinc-700 overflow-hidden" role="radiogroup" aria-label={`${label}: Quelle`}>
                    {([['auto', 'Automatisch'], ['custom', 'Eigener Text']] as const).map(([m, text]) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={mode === m}
                        onClick={() => setMode(field, m)}
                        className={cn('px-2.5 py-1 transition-colors', mode === m ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white')}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  <Link to={path} target="_blank" rel="noopener" className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors">
                    <ExternalLink className="w-3 h-3" />
                    Ansehen
                  </Link>
                </div>
              </div>
              {mode === 'auto' ? (
                <p className="text-xs text-zinc-400">
                  {generated ? 'Wird aus den Angaben oben erzeugt.' : 'Wird erzeugt, sobald Name, Anschrift und E-Mail eingetragen sind.'}
                </p>
              ) : (
                <textarea
                  value={draft[field]}
                  onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                  rows={10}
                  spellCheck
                  placeholder={`${label} in Markdown`}
                  aria-label={label}
                  className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs font-mono leading-relaxed rounded px-3 py-2 focus:outline-none focus:border-zinc-500 resize-y"
                />
              )}
              {missing && mode === 'custom' && <p className="text-xs text-amber-400">Leer — öffentliche Seiten zeigen dann nur einen Hinweis.</p>}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-zinc-400">Ungespeicherte Änderungen</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="text-xs text-zinc-100 border border-zinc-600 hover:border-zinc-400 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded transition-all disabled:opacity-40"
        >
          {saving ? 'Wird gespeichert…' : 'Speichern'}
        </button>
      </div>
    </div>
  );
};
