import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { ArrowUpRight, Layers, Calendar } from 'lucide-react';

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
    creator: { email: string };
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

const creatorName = (email: string) => email.split('@')[0];

export const ExhibitionsPage = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);
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

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-body">
      <style>{`
        @keyframes catalogue-in {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .catalogue-in {
          opacity: 0;
          animation: catalogue-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .card-line::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 60%);
          pointer-events: none;
          z-index: 3;
        }
        .card-hover-glow:hover {
          box-shadow: 0 0 0 1px rgba(255,255,255,0.12), 0 8px 40px -8px rgba(255,255,255,0.06);
        }
        .glass3d {
          --filter-glass3d: blur(8px) brightness(1.35) saturate(2);
          --color-glass3d: transparent;
          position: relative;
          z-index: 4;
          overflow: hidden;
          box-shadow:
            0 0 0.75px hsl(205 20% 10% / 0.2),
            0.7px 0.8px 1.2px -0.4px hsl(205 20% 10% / 0.1),
            1.3px 1.5px 2.2px -0.8px hsl(205 20% 10% / 0.1),
            2.3px 2.6px 3.9px -1.2px hsl(205 20% 10% / 0.1),
            3.9px 4.4px 6.6px -1.7px hsl(205 20% 10% / 0.1),
            6.5px 7.2px 10.9px -2.1px hsl(205 20% 10% / 0.1),
            8px 9px 14px -2.5px hsl(205 20% 10% / 0.2);
        }
        .glass3d::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: inherit;
          overflow: hidden;
          z-index: 3;
          -webkit-backdrop-filter: var(--filter-glass3d);
          backdrop-filter: var(--filter-glass3d);
          background-color: var(--color-glass3d);
          transition: backdrop-filter 0.5s, -webkit-backdrop-filter 0.5s;
        }
        .group:hover .glass3d::before {
          -webkit-backdrop-filter: blur(3px) brightness(1.5) saturate(2);
          backdrop-filter: blur(3px) brightness(1.5) saturate(2);
        }
        .glass3d::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: inherit;
          overflow: hidden;
          z-index: 5;
          box-shadow:
            inset 2px 2px 1px -3px hsl(205 20% 90% / 0.8),
            inset 4px 4px 2px -6px hsl(205 20% 90% / 0.3),
            inset 1.5px 1.5px 1.5px -0.75px hsl(205 20% 90% / 0.15),
            inset 1.5px 1.5px 0.25px hsl(205 20% 90% / 0.03),
            inset 0 0 0.25px 0.5px hsl(205 20% 90% / 0.03);
        }
        .glass3d > .glass3d-content {
          position: relative;
          z-index: 6;
        }
      `}</style>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/[0.05]">
        <Link to="/" className="font-display text-xl font-light tracking-wide text-white">
          Cura<span className="font-semibold">Hub</span>
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <Link to="/exhibitions" className="text-white text-xs tracking-[0.12em] uppercase font-medium">
            Ausstellungen
          </Link>
          {isAdmin && (
            <Link
              to="/users"
              className="text-zinc-400 hover:text-white text-xs tracking-[0.12em] uppercase transition-colors"
            >
              Benutzerverwaltung
            </Link>
          )}
          {isAuthenticated ? (
            <Link to="/project" className="text-zinc-500 hover:text-white text-xs tracking-[0.12em] uppercase transition-colors">
              Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-1.5 rounded-full text-xs font-medium transition-all"
            >
              Login
            </Link>
          )}
        </div>
      </nav>

      {/* Header */}
      <header className="pt-36 pb-16 px-8 catalogue-in" style={{ animationDelay: '0s' }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-end justify-between gap-6 pb-8 border-b border-zinc-800">
            <div>
              <p className="text-[10px] tracking-[0.4em] uppercase text-zinc-600 mb-3">
                HSBI · Digitale Galerie
              </p>
              <h1 className="font-display text-5xl sm:text-6xl font-light tracking-tight text-white leading-[1.05]">
                Ausstellungen
              </h1>
            </div>
            {!loading && !error && (
              <p className="text-zinc-600 text-sm pb-1 shrink-0">
                {entries.length} {entries.length === 1 ? 'Ausstellung' : 'Ausstellungen'}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-8 pb-32">
        <div className="max-w-5xl mx-auto">

          {loading && (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-32 rounded-2xl bg-zinc-900/50 animate-pulse catalogue-in"
                  style={{ animationDelay: `${0.1 + i * 0.08}s` }}
                />
              ))}
            </div>
          )}

          {error && !loading && (
            <div className="text-center py-24 catalogue-in" style={{ animationDelay: '0.1s' }}>
              <p className="text-zinc-600 mb-6 text-sm">{error}</p>
              <button
                onClick={fetchData}
                className="text-xs tracking-widest uppercase text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 px-6 py-2.5 rounded-full transition-all"
              >
                Erneut versuchen
              </button>
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="text-center py-24 catalogue-in" style={{ animationDelay: '0.1s' }}>
              <p className="text-zinc-600 text-sm">
                Noch keine Ausstellungen veröffentlicht.
              </p>
            </div>
          )}

          {!loading && !error && entries.length > 0 && (
            <div className="space-y-3">
              {entries.map((entry, i) => {
                const period = exhibitionPeriod(entry);
                const hasPoster = !!entry.exhibition.poster_path;

                return (
                  <Link
                    key={entry.version.id}
                    to={`/exhibition/${entry.exhibition.slug}`}
                    className="group block catalogue-in"
                    style={{ animationDelay: `${0.1 + i * 0.07}s` }}
                  >
                    <div className="relative rounded-2xl border border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-900/60 transition-all duration-300 overflow-hidden glass3d">

                      {/* Poster background — full width, cropped to card height */}
                      {hasPoster && (
                        <>
                          <img
                            src={`/${entry.exhibition.poster_path}`}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none transition-transform duration-500 group-hover:scale-105"
                            style={{ zIndex: 1 }}
                          />
                          <div className="absolute inset-0 bg-zinc-950/75 group-hover:bg-zinc-950/55 pointer-events-none transition-colors duration-500" style={{ zIndex: 2 }} />
                        </>
                      )}

                      {/* Featured stripe */}
                      {entry.isFeatured && (
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-zinc-400 to-transparent" style={{ zIndex: 7 }} />
                      )}

                      <div className="flex items-center gap-6 px-7 py-16 glass3d-content">
                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2.5 mb-1.5">
                                {entry.isFeatured && (
                                  <span className="text-[9px] tracking-[0.35em] uppercase text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full shrink-0">
                                    Aktuell
                                  </span>
                                )}
                              </div>
                              <h2 className="font-display text-xl sm:text-2xl font-light text-zinc-200 group-hover:text-white transition-colors leading-tight truncate">
                                {entry.exhibition.title}
                              </h2>
                            </div>

                            {/* Arrow */}
                            <ArrowUpRight className="w-5 h-5 text-zinc-700 group-hover:text-zinc-400 shrink-0 mt-0.5 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                          </div>

                          {/* Meta */}
                          <div className="flex items-center gap-5 mt-3.5 text-xs text-zinc-400">
                            <span className="flex items-center gap-1.5">
                              <Layers className="w-3 h-3 shrink-0" />
                              {entry.version.artworkCount} {entry.version.artworkCount === 1 ? 'Objekt' : 'Objekte'}
                            </span>
                            <span className="text-zinc-600">·</span>
                            <span>
                              {creatorName(entry.version.creator.email)}
                            </span>
                            {period && (
                              <>
                                <span className="text-zinc-600">·</span>
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-3 h-3 shrink-0" />
                                  {period}
                                </span>
                              </>
                            )}
                            {!period && entry.version.published_at && (
                              <>
                                <span className="text-zinc-600">·</span>
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-3 h-3 shrink-0" />
                                  {formatDate(entry.version.published_at)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 px-8 py-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-zinc-700">
          <span>CuraHub · HSBI Bielefeld</span>
          <Link to="/" className="hover:text-zinc-400 transition-colors">
            Startseite
          </Link>
        </div>
      </footer>
    </div>
  );
};
