import type { ReactNode } from 'react';
import { LegalLinks } from '@/components/legal/LegalLinks';
import { SiteHeader } from '@/components/SiteHeader';

interface AuthBackdropProps {
  children: ReactNode;
  /** Wider column (setup wizard). */
  wide?: boolean;
  /**
   * The public pages' header (login). The setup wizard has none: until it is done every other
   * page redirects back to /setup, so its links would lead nowhere — it shows the logo instead.
   */
  withHeader?: boolean;
}

/** Page around the login and setup cards, in the dashboard's colours. */
export function AuthBackdrop({ children, wide = false, withHeader = false }: AuthBackdropProps) {
  return (
    <div className={`relative flex min-h-screen items-center justify-center bg-zinc-950 px-4 ${withHeader ? 'pb-10 pt-24' : 'py-10'}`}>
      {withHeader && <SiteHeader />}

      <div className={`relative z-10 w-full ${wide ? 'max-w-lg' : 'max-w-sm'} flex flex-col items-center gap-6`}>
        {!withHeader && (
          <div className="text-center select-none">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">HSBI</p>
            <h1 className="text-3xl font-bold tracking-tight text-white">CuraHub</h1>
          </div>
        )}

        {children}

        <p className="text-center text-xs text-zinc-500 select-none">
          Digitale Ausstellungsplanung · Hochschule Bielefeld
        </p>
        <LegalLinks className="justify-center text-zinc-400" newTab />
      </div>
    </div>
  );
}
