import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthBackdrop } from '@/components/AuthBackdrop';
import { AUTH_CARD_STYLE, AUTH_DESCRIPTION_STYLE, AUTH_TITLE_STYLE } from '@/components/authStyles';
import {
  ChecksStep, CodeStep, HsbiAdminStep, LocalAdminStep, PrimaryButton, SummaryStep, UrlStep,
} from '@/components/setup/SetupSteps';
import { setupApi, SetupExpiredError, type SetupCheck } from '@/lib/setup/setupApi';

type Step = 'code' | 'checks' | 'url' | 'local' | 'hsbi' | 'summary' | 'done';

const TITLES: Record<Step, [string, string]> = {
  code: ['Einrichtung', 'Schritt 1 von 6 · Setup-Code'],
  checks: ['Systemcheck', 'Schritt 2 von 6'],
  url: ['Öffentliche Adresse', 'Schritt 3 von 6'],
  local: ['Notfall-Admin', 'Schritt 4 von 6'],
  hsbi: ['HSBI-Admin', 'Schritt 5 von 6 · optional'],
  summary: ['Zusammenfassung', 'Schritt 6 von 6'],
  done: ['Fertig', 'CuraHub ist eingerichtet.'],
};

/** First-run wizard: sets up and secures a fresh installation (see docs/deployment.md). */
export function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('code');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<SetupCheck[]>([]);
  const [publicUrl, setPublicUrl] = useState('');
  const [suggestedUrl, setSuggestedUrl] = useState('');
  const [localAdmin, setLocalAdmin] = useState<{ username: string; password: string } | null>(null);
  const [hsbi, setHsbi] = useState<{ username: string; password: string; email: string } | null>(null);

  /** Runs a request; an expired session (restart, 30 min) sends the wizard back to the code step. */
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (err instanceof SetupExpiredError) {
        setToken(null);
        setStep('code');
      }
      setError(err instanceof Error ? err.message : 'Unerwarteter Fehler.');
    } finally {
      setBusy(false);
    }
  }, []);

  const loadChecks = async (t: string) => {
    const data = await setupApi.checks(t);
    setChecks(data.checks);
    setSuggestedUrl(data.suggestedPublicUrl);
  };

  const [title, description] = TITLES[step];

  return (
    <AuthBackdrop wide>
      <Card className="w-full border" style={AUTH_CARD_STYLE}>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-light" style={AUTH_TITLE_STYLE}>{title}</CardTitle>
          <CardDescription style={AUTH_DESCRIPTION_STYLE}>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'code' && (
            <CodeStep busy={busy} error={error} onSubmit={(code) => run(async () => {
              const { token: t } = await setupApi.verifyCode(code);
              setToken(t);
              await loadChecks(t);
              setStep('checks');
            })} />
          )}
          {step === 'checks' && token && (
            <ChecksStep
              checks={checks}
              busy={busy}
              error={error}
              onRecheck={() => run(() => loadChecks(token))}
              onNext={() => { setError(null); setStep('url'); }}
            />
          )}
          {step === 'url' && (
            <UrlStep initial={publicUrl || suggestedUrl} onNext={(url) => { setPublicUrl(url); setStep('local'); }} />
          )}
          {step === 'local' && (
            <LocalAdminStep onNext={(username, password) => { setLocalAdmin({ username, password }); setStep('hsbi'); }} />
          )}
          {step === 'hsbi' && token && (
            <HsbiAdminStep
              busy={busy}
              error={error}
              verifiedEmail={hsbi?.email ?? null}
              onSkip={() => { setHsbi(null); setError(null); setStep('summary'); }}
              onNext={() => { setError(null); setStep('summary'); }}
              onCheck={(username, password) => run(async () => {
                const result = await setupApi.hsbiCheck(token, username, password);
                if (result.ok) setHsbi({ username, password, email: result.email });
                else setError(result.reason);
              })}
            />
          )}
          {step === 'summary' && token && localAdmin && (
            <SummaryStep
              busy={busy}
              error={error}
              publicUrl={publicUrl}
              localUsername={localAdmin.username}
              hsbiEmail={hsbi?.email ?? null}
              onFinish={() => run(async () => {
                await setupApi.complete(token, {
                  publicUrl,
                  localAdmin,
                  ...(hsbi ? { hsbiAdmin: { username: hsbi.username, password: hsbi.password } } : {}),
                });
                // Drop the passwords from memory as soon as they are no longer needed.
                setLocalAdmin(null);
                setHsbi(null);
                setToken(null);
                setStep('done');
              })}
            />
          )}
          {step === 'done' && (
            <div className="grid gap-4">
              <p className="text-sm text-white/50">
                Die Einrichtung ist abgeschlossen und gesperrt. Melde dich jetzt mit deinem HSBI-Konto oder über „Notfall-Login" an.
              </p>
              <PrimaryButton type="button" onClick={() => navigate('/login', { replace: true })}>Zum Login</PrimaryButton>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}
