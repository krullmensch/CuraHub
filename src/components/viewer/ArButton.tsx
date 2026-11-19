import { lazy, Suspense, useMemo, useState } from 'react';
import { Box } from 'lucide-react';
import { detectArPlatform } from '../../lib/arExport/launch';
import { LoadingOverlay, Spinner } from '@/components/ui/loading';

const ArQrDialog = lazy(() => import('./ArQrDialog').then((m) => ({ default: m.ArQrDialog })));
const ArSceneSheet = lazy(() => import('./ArSceneSheet'));
const ArQuickLookSheet = lazy(() => import('./ArQuickLookSheet'));

export interface PublicArInfo {
  status: 'queued' | 'running' | 'done' | 'none';
  glbUrl?: string;
  usdzUrl?: string;
}

interface ArButtonProps {
  ar: PublicArInfo | undefined;
  slug: string;
  title: string;
  /** Large variant for the ?ar=1 phone entry. */
  large?: boolean;
  /** Label of the ready state. */
  label?: string;
}

const BASE =
  'inline-flex items-center gap-2 whitespace-nowrap text-white/70 hover:text-white text-xs sm:text-sm font-medium uppercase tracking-[0.1em] sm:tracking-[0.15em] bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 backdrop-blur-sm px-3 sm:px-4 py-2 rounded-lg transition-all duration-200';
const LARGE = 'text-base px-8 py-4 text-white bg-white/15 border-white/30';

export function ArButton({ ar, slug, title, large = false, label = 'In AR ansehen' }: ArButtonProps) {
  const platform = useMemo(() => detectArPlatform(navigator.userAgent, navigator.maxTouchPoints), []);
  const [qrOpen, setQrOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!ar || ar.status === 'none') return null;
  const className = `${BASE} ${large ? LARGE : ''}`;

  if (ar.status !== 'done') {
    return (
      <button type="button" disabled className={`${className} cursor-default opacity-60`}>
        <Spinner className="h-4 w-4" />
        AR wird vorbereitet…
      </button>
    );
  }

  const origin = window.location.origin;
  const viewerUrl = `${origin}/exhibition/${slug}`;

  // iOS: the sheet downloads the USDZ with a progress bar, then hands it to Quick Look
  // (a bare <a rel="ar"> shows nothing while Safari fetches tens of MB).
  if (platform === 'ios' && ar.usdzUrl) {
    return (
      <>
        <button type="button" onClick={() => setSheetOpen(true)} className={className}>
          <Box className="h-4 w-4" />
          {label}
        </button>
        {sheetOpen && (
          <Suspense fallback={<LoadingOverlay label="AR wird geöffnet …" className="z-[1200]" />}>
            <ArQuickLookSheet usdzUrl={ar.usdzUrl} title={title} onClose={() => setSheetOpen(false)} />
          </Suspense>
        )}
      </>
    );
  }
  if (platform === 'android' && ar.glbUrl) {
    return (
      <>
        <button type="button" onClick={() => setSheetOpen(true)} className={className}>
          <Box className="h-4 w-4" />
          {label}
        </button>
        {sheetOpen && (
          <Suspense fallback={<LoadingOverlay label="AR wird geöffnet …" className="z-[1200]" />}>
            <ArSceneSheet glbUrl={ar.glbUrl} title={title} onClose={() => setSheetOpen(false)} />
          </Suspense>
        )}
      </>
    );
  }
  if (platform !== 'desktop') return null;
  return (
    <>
      <button type="button" onClick={() => setQrOpen(true)} className={className}>
        <Box className="h-4 w-4" />
        {label}
      </button>
      {qrOpen && (
        <Suspense fallback={<LoadingOverlay />}>
          <ArQrDialog open={qrOpen} onOpenChange={setQrOpen} url={`${viewerUrl}?ar=1`} />
        </Suspense>
      )}
    </>
  );
}
