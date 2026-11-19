import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Layers, Calendar, RotateCw } from 'lucide-react';
import { LegalLinks } from '@/components/legal/LegalLinks';
import { SiteHeader } from '@/components/SiteHeader';
import { HEADER_BUTTON } from '@/components/headerStyles';

// `navigator.connection` (Network Information API) isn't in the standard DOM
// lib types yet — narrow it with a type guard instead of `any`.
interface NetworkInformationLike {
  saveData?: boolean;
}
interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformationLike;
}

function hasSaveDataEnabled(): boolean {
  const nav = navigator as NavigatorWithConnection;
  return nav.connection?.saveData === true;
}

interface ExhibitionEntry {
  exhibition: { id: number; title: string; slug: string };
  version: {
    id: number;
    comment: string | null;
    published_at: string | null;
    artworkCount: number;
    creator: { name: string };
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
  const videoRef = useRef<HTMLVideoElement>(null);

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

  // LOAD-08: don't force every visitor to download the background video.
  // Only start loading/playing it after first paint (idle time), and skip
  // it entirely — showing just the poster frame — for users who prefer
  // reduced motion or have "Datensparmodus" (Save-Data) enabled.
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || hasSaveDataEnabled()) {
      return;
    }

    let cancelled = false;
    const startVideo = () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video) return;
      video.src = '/BG_Video_CuraHub-720p.webm';
      video.play().catch(() => {
        // Browser blocked autoplay — the poster frame stays visible.
      });
    };

    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(startVideo, { timeout: 2000 });
    } else {
      timeoutId = window.setTimeout(startVideo, 200);
    }

    return () => {
      cancelled = true;
      if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return (
    <div className="h-screen w-full overflow-y-auto bg-zinc-950 text-white relative">
      {/* ── Background Video ── */}
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="metadata"
        poster="/BG_Video_CuraHub-poster.webp"
        className="fixed inset-0 w-full h-full object-cover pointer-events-none z-0 grayscale"
      />
      <div className="fixed inset-0 bg-zinc-950/80 pointer-events-none z-0" />

      {/* ── Header: the same bar as the dashboard ── */}
      <SiteHeader />

      {/* ── Hero ── */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 sm:px-8 pt-20 pb-12 homepage-fade-up">
        {loading ? (
          <div className="flex flex-col items-center gap-6 w-full max-w-xl" role="status" aria-label="Ausstellung wird geladen">
            <Skeleton className="h-4 w-32 bg-zinc-800" />
            <Skeleton className="h-16 w-full bg-zinc-800" />
            <Skeleton className="h-5 w-64 bg-zinc-800" />
            <div className="mt-4 flex gap-3">
              <Skeleton className="h-10 w-44 bg-zinc-800 rounded-lg" />
              <Skeleton className="h-10 w-40 bg-zinc-800 rounded-lg" />
            </div>
          </div>
        ) : error ? (
          <div className="text-center">
            <p className="text-zinc-400 mb-4">{error}</p>
            <button onClick={fetchData} className={`${HEADER_BUTTON} mx-auto`}>
              <RotateCw className="h-3.5 w-3.5" />
              Erneut versuchen
            </button>
          </div>
        ) : featured ? (
          <div className="text-center max-w-3xl">
            <p
              className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-6 homepage-fade-up"
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
                className="text-lg text-zinc-300 mb-6 homepage-fade-up"
                style={{ animationDelay: '0.4s' }}
              >
                {featured.version.comment}
              </p>
            )}
            <div
              className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-300 mb-10 homepage-fade-up"
              style={{ animationDelay: '0.5s' }}
            >
              {featured.version.published_at && (
                <span className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-1">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  {formatDate(featured.version.published_at)}
                </span>
              )}
              <span className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-1">
                <Layers className="w-3.5 h-3.5 text-zinc-400" />
                {featured.version.artworkCount} {featured.version.artworkCount === 1 ? 'Objekt' : 'Objekte'}
              </span>
            </div>
            <div
              className="flex flex-wrap items-center justify-center gap-3 homepage-fade-up"
              style={{ animationDelay: '0.6s' }}
            >
              <Link
                to={`/exhibition/${featured.exhibition.slug}`}
                className="group inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Ausstellung betreten
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/exhibitions"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              >
                Alle Ausstellungen
              </Link>
            </div>
          </div>
        ) : (
          /* Empty state — no featured exhibition */
          <div className="text-center max-w-lg">
            <h1
              className="text-5xl sm:text-6xl font-bold tracking-tight text-white mb-4 homepage-fade-up"
              style={{ animationDelay: '0.2s' }}
            >
              CuraHub
            </h1>
            <p
              className="text-zinc-400 text-lg homepage-fade-up"
              style={{ animationDelay: '0.4s' }}
            >
              Digitale Ausstellungsräume der HSBI
            </p>
          </div>
        )}
      </section>

      {/* ── Past Exhibitions ── */}
      {!loading && !error && exhibitions.length > 0 && (
        <section className="relative z-10 px-4 sm:px-8 pb-24">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between gap-4 mb-4 border-b border-zinc-800 pb-3 homepage-fade-up" style={{ animationDelay: '0.7s' }}>
              <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Vergangene Ausstellungen
              </h2>
              <Link to="/exhibitions" className="flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-white">
                Alle anzeigen
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {exhibitions.map((entry, i) => (
                <Link
                  key={entry.version.id}
                  to={`/exhibition/${entry.exhibition.slug}`}
                  className="group block homepage-fade-up"
                  style={{ animationDelay: `${0.8 + i * 0.1}s` }}
                >
                  <div className="h-full rounded-lg border border-zinc-800 bg-zinc-900/90 p-5 transition-colors hover:border-zinc-600 hover:bg-zinc-900">
                    <h3 className="text-base font-semibold text-zinc-100 group-hover:text-white transition-colors mb-2 leading-tight">
                      {entry.exhibition.title}
                    </h3>
                    {entry.version.comment && (
                      <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
                        {entry.version.comment}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-zinc-500">
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
      <footer className="relative z-10 border-t border-zinc-800 bg-zinc-900/80 px-6 py-6 homepage-fade-up" style={{ animationDelay: '1s' }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
          <p>CuraHub ist ein digitales Ausstellungstool der HSBI.</p>
          <LegalLinks />
          {!isAuthenticated && (
            <p>
              Zum Kuratieren brauchst du ein Konto.{' '}
              <Link to="/login" className="text-zinc-300 hover:text-white transition-colors underline underline-offset-2">
                Anmelden
              </Link>
            </p>
          )}
        </div>
      </footer>
    </div>
  );
};
