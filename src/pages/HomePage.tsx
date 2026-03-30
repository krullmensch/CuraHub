import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Layers, Calendar } from 'lucide-react';

interface ExhibitionEntry {
  exhibition: { id: number; title: string; slug: string };
  version: {
    id: number;
    comment: string | null;
    published_at: string | null;
    artworkCount: number;
    creator: { email: string };
  };
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const HomePage = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [featured, setFeatured] = useState<ExhibitionEntry | null>(null);
  const [exhibitions, setExhibitions] = useState<ExhibitionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [featuredRes, exhibitionsRes] = await Promise.all([
        fetch('/public/featured'),
        fetch('/public/exhibitions'),
      ]);
      if (featuredRes.ok) {
        setFeatured(await featuredRes.json());
      }
      if (exhibitionsRes.ok) {
        setExhibitions(await exhibitionsRes.json());
      }
    } catch {
      setError('Ausstellungen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="h-screen w-full overflow-y-auto bg-black text-white">
      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 bg-black/80 backdrop-blur-md border-b border-white/5">
        <Link to="/" className="font-display text-xl font-light tracking-wide text-white">
          Cura<span className="font-semibold">Hub</span>
        </Link>
        <div className="flex items-center gap-6 text-sm">
          {isAuthenticated ? (
            <Link
              to="/project"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="text-zinc-400 hover:text-white transition-colors"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-1.5 rounded-full text-xs font-medium transition-all"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-8 pt-20 homepage-fade-up">
        {loading ? (
          <div className="flex flex-col items-center gap-6 w-full max-w-xl">
            <Skeleton className="h-4 w-32 bg-zinc-800" />
            <Skeleton className="h-16 w-full bg-zinc-800" />
            <Skeleton className="h-5 w-64 bg-zinc-800" />
            <Skeleton className="h-10 w-40 mt-4 bg-zinc-800 rounded-full" />
          </div>
        ) : error ? (
          <div className="text-center">
            <p className="text-zinc-500 mb-4">{error}</p>
            <button
              onClick={fetchData}
              className="text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-5 py-2 rounded-full transition-all"
            >
              Erneut versuchen
            </button>
          </div>
        ) : featured ? (
          <div className="text-center max-w-3xl">
            <p
              className="text-xs tracking-[0.35em] uppercase text-zinc-500 mb-8 homepage-fade-up"
              style={{ animationDelay: '0.1s' }}
            >
              Aktuelle Ausstellung
            </p>
            <h1
              className="font-display text-5xl sm:text-6xl md:text-7xl font-light leading-[1.1] tracking-tight text-white mb-6 homepage-fade-up"
              style={{ animationDelay: '0.25s' }}
            >
              {featured.exhibition.title}
            </h1>
            {featured.version.comment && (
              <p
                className="text-lg text-zinc-400 font-light mb-8 homepage-fade-up"
                style={{ animationDelay: '0.4s' }}
              >
                {featured.version.comment}
              </p>
            )}
            <div
              className="flex items-center justify-center gap-6 text-xs text-zinc-600 mb-10 homepage-fade-up"
              style={{ animationDelay: '0.5s' }}
            >
              {featured.version.published_at && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  {formatDate(featured.version.published_at)}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Layers className="w-3 h-3" />
                {featured.version.artworkCount} {featured.version.artworkCount === 1 ? 'Objekt' : 'Objekte'}
              </span>
            </div>
            <Link
              to={`/exhibition/${featured.exhibition.slug}`}
              className="inline-flex items-center gap-2 border border-zinc-600 hover:border-white text-zinc-300 hover:text-white px-8 py-3 rounded-full text-sm font-medium transition-all homepage-fade-up group"
              style={{ animationDelay: '0.6s' }}
            >
              Ausstellung betreten
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        ) : (
          /* Empty state — no featured exhibition */
          <div className="text-center max-w-lg">
            <h1
              className="font-display text-5xl sm:text-6xl font-light tracking-tight text-white mb-6 homepage-fade-up"
              style={{ animationDelay: '0.2s' }}
            >
              Cura<span className="font-semibold">Hub</span>
            </h1>
            <p
              className="text-zinc-500 text-lg font-light homepage-fade-up"
              style={{ animationDelay: '0.4s' }}
            >
              Digitale Ausstellungsraume der HSBI
            </p>
          </div>
        )}
      </section>

      {/* ── Past Exhibitions ── */}
      {!loading && !error && exhibitions.length > 0 && (
        <section className="px-8 pb-24 pt-12">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-4 mb-12 homepage-fade-up" style={{ animationDelay: '0.7s' }}>
              <div className="h-px flex-1 bg-zinc-800" />
              <h2 className="text-xs tracking-[0.3em] uppercase text-zinc-500 font-medium">
                Vergangene Ausstellungen
              </h2>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {exhibitions.map((entry, i) => (
                <Link
                  key={entry.version.id}
                  to={`/exhibition/${entry.exhibition.slug}`}
                  className="group block homepage-fade-up"
                  style={{ animationDelay: `${0.8 + i * 0.1}s` }}
                >
                  <div className="border border-zinc-800/80 rounded-xl p-6 bg-zinc-950/50 hover:border-zinc-600 hover:bg-zinc-900/40 transition-all duration-300">
                    <h3 className="font-display text-lg font-normal text-zinc-200 group-hover:text-white transition-colors mb-3 leading-tight">
                      {entry.exhibition.title}
                    </h3>
                    {entry.version.comment && (
                      <p className="text-sm text-zinc-600 mb-4 line-clamp-2">
                        {entry.version.comment}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-zinc-600">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3 h-3" />
                        {entry.version.artworkCount} {entry.version.artworkCount === 1 ? 'Objekt' : 'Objekte'}
                      </span>
                      {entry.version.published_at && (
                        <span>{formatDate(entry.version.published_at)}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-900 px-8 py-12 homepage-fade-up" style={{ animationDelay: '1s' }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-600">
          <p>
            CuraHub ist ein digitales Ausstellungstool der{' '}
            <span className="text-zinc-500">HSBI</span>.
          </p>
          <p>
            Kuratieren erfordert einen{' '}
            <span className="text-zinc-500">@hsbi.de</span> Account.{' '}
            <Link to="/register" className="text-zinc-400 hover:text-white transition-colors underline underline-offset-2">
              Registrieren
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
};
