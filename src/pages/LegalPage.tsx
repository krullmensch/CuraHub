import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LegalLinks } from '@/components/legal/LegalLinks';
import { fetchLegalData, LEGAL_PAGES, type LegalKind } from '@/lib/legal/legalApi';
import { resolveLegalDocuments } from '@/lib/legal/documents';

type Result = { status: 'error' } | { status: 'ready'; text: string };

/** /impressum and /datenschutz: built from the operator's details (or their own text), rendered as Markdown. */
export const LegalPage = ({ kind }: { kind: LegalKind }) => {
  const page = LEGAL_PAGES[kind];
  // Tagged with the page it belongs to: switching Impressum ↔ Datenschutz shows „loading“ again.
  const [loaded, setLoaded] = useState<{ kind: LegalKind; result: Result } | null>(null);
  const state = loaded?.kind === kind ? loaded.result : { status: 'loading' as const };

  useEffect(() => {
    document.title = `${page.title} · CuraHub`;
    let cancelled = false;
    fetchLegalData()
      .then((data) => {
        if (!cancelled) setLoaded({ kind, result: { status: 'ready', text: resolveLegalDocuments(data, data)[page.field] } });
      })
      .catch(() => { if (!cancelled) setLoaded({ kind, result: { status: 'error' } }); });
    return () => {
      cancelled = true;
      document.title = 'CuraHub';
    };
  }, [kind, page]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <Link to="/" className="font-display text-xl font-light tracking-wide text-white">
          Cura<span className="font-semibold">Hub</span>
        </Link>
        <LegalLinks className="text-zinc-400" />
      </nav>

      <main className="flex-1 px-8 py-12">
        <div className="max-w-3xl mx-auto wiki-content">
          {state.status === 'loading' && <p className="text-zinc-400 text-sm">Wird geladen…</p>}
          {state.status === 'error' && (
            <p className="text-zinc-400 text-sm">{page.title} konnte nicht geladen werden. Bitte später erneut versuchen.</p>
          )}
          {state.status === 'ready' && (state.text.trim() ? (
            // No rehype-raw: HTML in the text is shown as text, never run.
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.text}</ReactMarkdown>
          ) : (
            <>
              <h1>{page.title}</h1>
              <p>Der Betreiber dieser CuraHub-Installation hat hier noch keinen Text hinterlegt.</p>
            </>
          ))}
        </div>
      </main>
    </div>
  );
};
