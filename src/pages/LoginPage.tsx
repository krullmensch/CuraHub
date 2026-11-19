import { useState } from 'react';
import { useAuthStore, type User } from '../store/authStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthBackdrop } from '@/components/AuthBackdrop';
import { PasswordChangeForm } from '@/components/auth/PasswordChangeForm';
import {
  AUTH_BUTTON_CLASS, AUTH_CARD_CLASS, AUTH_DESCRIPTION_CLASS, AUTH_ERROR_CLASS, AUTH_HINT_CLASS, AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS, AUTH_TITLE_CLASS,
} from '@/components/authStyles';
import { cn } from '@/lib/utils';

/** 'hsbi' = HSBI login; 'local' = CuraHub account (created by an admin, or the setup wizard's emergency admin). */
type LoginMode = 'hsbi' | 'local';

export const LoginPage = () => {
  const [mode, setMode] = useState<LoginMode>('hsbi');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // A local account logged in with a start password: kept here (not in authStore) until it is replaced.
  const [pending, setPending] = useState<{ token: string; user: User; password: string } | null>(null);
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/project';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(mode === 'hsbi' ? '/auth/login' : '/auth/local-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Anmeldung fehlgeschlagen');
      }

      if (data.user.mustChangePassword) {
        setPending({ token: data.token, user: data.user, password });
        return;
      }
      login(data.token, data.user);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Ein unerwarteter Fehler ist aufgetreten');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthBackdrop withHeader>
      {/* Login card */}
      <Card className={AUTH_CARD_CLASS}>
        <CardHeader className="pb-4">
          <CardTitle className={AUTH_TITLE_CLASS}>
            {pending ? 'Neues Passwort festlegen' : 'Anmelden'}
          </CardTitle>
          <CardDescription className={AUTH_DESCRIPTION_CLASS}>
            {pending
              ? 'Du hast dich mit einem Startpasswort angemeldet. Lege jetzt dein eigenes Passwort fest.'
              : mode === 'hsbi' ? 'Melde dich mit deinem HSBI-Account an.' : 'Melde dich mit deinem CuraHub-Konto an.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending ? (
            <div className="grid gap-3">
              <PasswordChangeForm
                token={pending.token}
                username={pending.user.email}
                knownCurrent={pending.password}
                variant="auth"
                submitLabel="Passwort speichern"
                onDone={() => {
                  login(pending.token, { ...pending.user, mustChangePassword: false });
                  navigate(from, { replace: true });
                }}
              />
              <button
                type="button"
                onClick={() => { setPending(null); setPassword(''); }}
                className="text-xs text-center text-zinc-400 hover:text-white transition-colors"
              >
                Abbrechen
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div role="tablist" aria-label="Kontoart" className="grid grid-cols-2 gap-1 rounded-md border border-zinc-800 bg-zinc-950 p-1">
              {(['hsbi', 'local'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => { setMode(m); setError(''); }}
                  className={cn(
                    'rounded px-3 py-1.5 text-xs font-medium transition-colors',
                    mode === m ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white',
                  )}
                >
                  {m === 'hsbi' ? 'HSBI-Konto' : 'CuraHub-Konto'}
                </button>
              ))}
            </div>
            {error && (
              <div className={AUTH_ERROR_CLASS}>
                {error}
              </div>
            )}
            <div className="grid gap-2">
              <label
                htmlFor="username"
                className={AUTH_LABEL_CLASS}
              >
                Benutzername
              </label>
              <Input
                id="username"
                type="text"
                placeholder={mode === 'hsbi' ? 'amustermann' : 'benutzername'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className={AUTH_INPUT_CLASS}
              />
            </div>
            <div className="grid gap-2">
              <label
                htmlFor="password"
                className={AUTH_LABEL_CLASS}
              >
                Passwort
              </label>
              <Input
                id="password"
                type="password"
                placeholder={mode === 'hsbi' ? 'Dein HSBI Passwort' : 'Passwort'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={AUTH_INPUT_CLASS}
              />
              {mode === 'hsbi' && (
                <p className={AUTH_HINT_CLASS}>
                  Das Passwort wird nur zur Prüfung an die HSBI übermittelt und nicht gespeichert.
                </p>
              )}
            </div>
            <Button
              type="submit"
              className={cn('w-full mt-1 font-medium', AUTH_BUTTON_CLASS)}
              loading={isLoading}
            >
              {isLoading ? 'Anmeldung läuft…' : 'Anmelden'}
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
};
