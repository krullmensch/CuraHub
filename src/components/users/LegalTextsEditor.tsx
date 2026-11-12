import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { fetchLegalTexts, LEGAL_PAGES, saveLegalTexts, type LegalTexts } from '@/lib/legal/legalApi';
import { hasPlaceholders, IMPRINT_TEMPLATE, PRIVACY_TEMPLATE } from '@/lib/legal/templates';

const FIELDS = [
  { field: 'imprint', page: LEGAL_PAGES.impressum, template: IMPRINT_TEMPLATE, label: 'Impressum' },
  { field: 'privacy', page: LEGAL_PAGES.datenschutz, template: PRIVACY_TEMPLATE, label: 'Datenschutzerklärung' },
] as const;

/**
 * Admin block on /users: the installation's Impressum and Datenschutzerklärung (Markdown). Both
 * appear on /impressum and /datenschutz, linked from every public page.
 */
export const LegalTextsEditor = ({ token }: { token: string }) => {
  const [texts, setTexts] = useState<LegalTexts | null>(null);
  const [saved, setSaved] = useState<LegalTexts | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLegalTexts()
      .then((t) => { if (!cancelled) { setTexts(t); setSaved(t); } })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (loadFailed) {
    return <p className="text-sm text-red-400">Rechtliche Angaben konnten nicht geladen werden.</p>;
  }
  if (!texts || !saved) return <p className="text-sm text-zinc-400">Wird geladen…</p>;

  const dirty = texts.imprint !== saved.imprint || texts.privacy !== saved.privacy;

  const insertTemplate = (field: keyof LegalTexts, template: string) => {
    if (texts[field].trim() && !window.confirm('Den vorhandenen Text durch die Vorlage ersetzen?')) return;
    setTexts({ ...texts, [field]: template });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = await saveLegalTexts(token, texts);
      setTexts(next);
      setSaved(next);
      toast.success('Rechtliche Angaben gespeichert');
    } catch (err) {
      toast.error('Speichern fehlgeschlagen', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5">
      {FIELDS.map(({ field, page, template, label }) => {
        const value = texts[field];
        return (
          <div key={field} className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`legal-${field}`} className="text-xs text-zinc-300 font-medium">{label}</label>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => insertTemplate(field, template)}
                  className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"
                >
                  <FileText className="w-3 h-3" />
                  Vorlage einfügen
                </button>
                <Link to={page.path} target="_blank" rel="noopener" className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors">
                  <ExternalLink className="w-3 h-3" />
                  Ansehen
                </Link>
              </div>
            </div>
            <textarea
              id={`legal-${field}`}
              value={value}
              onChange={(e) => setTexts({ ...texts, [field]: e.target.value })}
              rows={10}
              spellCheck
              placeholder={`${label} in Markdown — oder „Vorlage einfügen“ und die Stellen in [[…]] ausfüllen.`}
              className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs font-mono leading-relaxed rounded px-3 py-2 focus:outline-none focus:border-zinc-500 resize-y"
            />
            {!value.trim() && <p className="text-xs text-amber-400">Fehlt — öffentliche Seiten zeigen dann nur einen Hinweis.</p>}
            {hasPlaceholders(value) && <p className="text-xs text-amber-400">Enthält noch Platzhalter [[…]] aus der Vorlage.</p>}
          </div>
        );
      })}
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
