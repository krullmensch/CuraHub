import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { setupApi } from '@/lib/setup/setupApi';

/**
 * Sends every page to /setup until the instance is set up, and /setup to /login afterwards.
 * If the status request fails the app renders normally (the server gate still protects the API).
 */
export function SetupGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const location = useLocation();
  const onSetupPage = location.pathname === '/setup';
  const [status, setStatus] = useState<{ onSetupPage: boolean; complete: boolean } | null>(null);

  // Re-checked when entering/leaving /setup, so „Zum Login" after the wizard is not bounced back.
  // A status fetched for the other side of that boundary counts as unknown.
  useEffect(() => {
    let cancelled = false;
    setupApi.status()
      .then((s) => { if (!cancelled) setStatus({ onSetupPage, complete: s.complete }); })
      .catch(() => { if (!cancelled) setStatus({ onSetupPage, complete: true }); });
    return () => { cancelled = true; };
  }, [onSetupPage]);

  const complete = status && status.onSetupPage === onSetupPage ? status.complete : null;
  if (complete === null) return <>{fallback}</>;
  if (!complete && !onSetupPage) return <Navigate to="/setup" replace />;
  if (complete && onSetupPage) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
