import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Layers, Calendar, RotateCw, Image as ImageIcon } from 'lucide-react';
import { LegalLinks } from '@/components/legal/LegalLinks';
import { SiteHeader } from '@/components/SiteHeader';
import { HEADER_BUTTON } from '@/components/headerStyles';
import { Skeleton } from '@/components/ui/skeleton';

/** The same card grid as the start page's „Vergangene Ausstellungen". */
const GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';

interface ExhibitionEntry {
  exhibition: {
    id: number;
    title: string;
    slug: string;
    poster_path: string | null;
    start_date: string | null;
    end_date: string | null;
  };
  version: {
    id: number;
    comment: string | null;
    published_at: string | null;
    artworkCount: number;
    creator: { name: string };
  };
  isFeatured?: boolean;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatDateShort = (dateStr: string | null) => {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};


export const ExhibitionsPage = () => {
  const [entries, setEntries] = useState<ExhibitionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [featuredRes, listRes] = await Promise.all([
        fetch('/public/featured'),
        fetch('/public/exhibitions'),
      ]);

      const all: ExhibitionEntry[] = [];

      if (featuredRes.ok) {
        const f = await featuredRes.json();
        if (f) all.push({ ...f, isFeatured: true });
      }
      if (listRes.ok) {
        const list: ExhibitionEntry[] = await listRes.json();
        all.push(...list);
      }

      setEntries(all);
    } catch {
      setError('Ausstellungen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const exhibitionPeriod = (entry: ExhibitionEntry) => {
    const { start_date, end_date } = entry.exhibition;
    if (!start_date && !end_date) return null;
    const s = formatDateShort(start_date);
    const e = formatDateShort(end_date);
    if (s && e) return `${s} – ${e}`;
    if (s) return `Ab ${s}`;
    return `Bis ${e}`;
  };

  const count = entries.length;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-body flex flex-col">
      {/* Header: the same bar as the dashboard */}
      <SiteHeader />

      <main className="flex-1 px-4 sm:px-8 pt-24 pb-24">
        <div className="max-w-5xl mx-auto">
          {/* Page head — like the settings page: small label, title, count */}
          <div className="flex items-end justify-between gap-6 mb-6 border-b border-zinc-800 pb-4 homepage-fade-up">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1">
                HSBI · Digitale Galerie
              </p>
              <h1 className="font-display text-3xl font-light text-white">Ausstellungen</h1>
            </div>
            {loading ? (
              <Skeleton className="h-4 w-28 bg-zinc-800" />
            ) : !error && (
              <p className="text-sm text-zinc-400 shrink-0">
                {count} {count === 1 ? 'Ausstellung' : 'Ausstellungen'}
              </p>
            )}
          </div>

          {loading && (
            <div className={GRID} role="status" aria-label="Ausstellungen werden geladen">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                  <Skeleton className="aspect-[16/9] w-full rounded-none bg-zinc-800/70" />
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-4 w-2/3 bg-zinc-800" />
                    <Skeleton className="h-3 w-1/2 bg-zinc-800" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-zinc-800 py-16 text-center">
              <p className="text-sm text-zinc-400">{error}</p>
              <button onClick={fetchData} className={HEADER_BUTTON}>
                <RotateCw className="h-3.5 w-3.5" />
                Erneut versuchen
              </button>
            </div>
          )}

          {!loading && !error && count === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-800 py-16 text-center text-sm text-zinc-400">
              <ImageIcon className="h-8 w-8 text-zinc-600" />
              Noch keine Ausstellungen veröffentlicht.
            </div>
          )}

          {!loading && !error && count > 0 && (
            <div className={GRID}>
              {entries.map((entry, i) => {
                const period = exhibitionPeriod(entry) ?? formatDate(entry.version.published_at);
                return (
                  <Link
                    key={entry.version.id}
                    to={`/exhibition/${entry.exhibition.slug}`}
                    className="group block homepage-fade-up"
                    style={{ animationDelay: `${0.05 + i * 0.05}s` }}
                  >
                    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 transition-colors group-hover:border-zinc-600">
                      {/* Poster, or a neutral placeholder so every card has the same shape */}
                      <div className="relative aspect-[16/9] overflow-hidden bg-zinc-800/60">
                        {entry.exhibition.poster_path ? (
                          <img
                            src={`/${entry.exhibition.poster_path}`}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <ImageIcon className="h-8 w-8 text-zinc-700" />
                          </div>
                        )}
                        {entry.isFeatured && (
                          <span className="absolute left-3 top-3 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
                            Aktuell
                          </span>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="text-base font-semibold leading-tight text-zinc-100 transition-colors group-hover:text-white">
                            {entry.exhibition.title}
                          </h2>
                          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-300" />
                        </div>
                        {entry.version.comment && (
                          <p className="mt-1.5 line-clamp-2 text-sm text-zinc-400">{entry.version.comment}</p>
                        )}
                        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-zinc-500">
                          <span className="flex items-center gap-1.5">
                            <Layers className="h-3 w-3 shrink-0" />
                            {entry.version.artworkCount} {entry.version.artworkCount === 1 ? 'Objekt' : 'Objekte'}
                          </span>
                          {period && (
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-3 w-3 shrink-0" />
                              {period}
                            </span>
                          )}
                          <span className="truncate">{entry.version.creator.name}</span>
                        </div>
                      </div>
                    </article>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Footer — the same bar as on the start page */}
      <footer className="border-t border-zinc-800 bg-zinc-900/80 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
          <p>CuraHub ist ein digitales Ausstellungstool der HSBI.</p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
};
