import { lazy, Suspense, useMemo, useState } from 'react';
import { Box } from 'lucide-react';
import { detectArPlatform, sceneViewerIntent } from '../../lib/arExport/launch';

const ArQrDialog = lazy(() => import('./ArQrDialog').then((m) => ({ default: m.ArQrDialog })));

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

// Quick Look needs an <img> as the first child of rel="ar" links; a 1x1 transparent GIF is enough.
const QUICK_LOOK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const BASE =
  'inline-flex items-center gap-2 text-white/70 hover:text-white text-sm font-medium uppercase tracking-[0.15em] bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 backdrop-blur-sm px-4 py-2 rounded-lg transition-all duration-200';
const LARGE = 'text-base px-8 py-4 text-white bg-white/15 border-white/30';

export function ArButton({ ar, slug, title, large = false, label = 'In AR ansehen' }: ArButtonProps) {
  const platform = useMemo(() => detectArPlatform(navigator.userAgent, navigator.maxTouchPoints), []);
  const [qrOpen, setQrOpen] = useState(false);

  if (!ar || ar.status === 'none') return null;
  const className = `${BASE} ${large ? LARGE : ''}`;

  if (ar.status !== 'done') {
    return (
      <button type="button" disabled className={`${className} cursor-default opacity-60`}>
        <Box className="h-4 w-4" />
        AR wird vorbereitet…
      </button>
    );
  }

  const origin = window.location.origin;
  const viewerUrl = `${origin}/exhibition/${slug}`;

  if (platform === 'ios' && ar.usdzUrl) {
    return (
      <a rel="ar" href={ar.usdzUrl} className={className}>
        <img src={QUICK_LOOK_IMG} alt="" width={1} height={1} />
        <Box className="h-4 w-4" />
        {label}
      </a>
    );
  }
  if (platform === 'android' && ar.glbUrl) {
    return (
      <a href={sceneViewerIntent(`${origin}${ar.glbUrl}`, title, viewerUrl)} className={className}>
        <Box className="h-4 w-4" />
        {label}
      </a>
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
        <Suspense fallback={null}>
          <ArQrDialog open={qrOpen} onOpenChange={setQrOpen} url={`${viewerUrl}?ar=1`} />
        </Suspense>
      )}
    </>
  );
}
