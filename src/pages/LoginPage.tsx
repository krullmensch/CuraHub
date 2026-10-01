import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
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
import {
  AUTH_BUTTON_STYLE, AUTH_CARD_STYLE, AUTH_DESCRIPTION_STYLE, AUTH_ERROR_STYLE, AUTH_INPUT_CLASS,
  AUTH_INPUT_STYLE, AUTH_LABEL_STYLE, AUTH_TITLE_STYLE,
} from '@/components/authStyles';

/** 'hsbi' = HSBI SSO; 'local' = emergency login for local admin accounts (setup wizard). */
type LoginMode = 'hsbi' | 'local';

export const LoginPage = () => {
  const [mode, setMode] = useState<LoginMode>('hsbi');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
    <AuthBackdrop>
      {/* Login card */}
      <Card className="w-full border" style={AUTH_CARD_STYLE}>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-light" style={AUTH_TITLE_STYLE}>
            {mode === 'hsbi' ? 'Anmelden' : 'Notfall-Login'}
          </CardTitle>
          <CardDescription style={AUTH_DESCRIPTION_STYLE}>
            {mode === 'hsbi' ? 'Melde dich mit deinem HSBI-Account an.' : 'Lokales Admin-Konto — nur für den Notfall.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            {error && (
              <div className="text-sm font-medium rounded-md px-3 py-2" style={AUTH_ERROR_STYLE}>
                {error}
              </div>
            )}
            <div className="grid gap-2">
              <label
                htmlFor="username"
                className="text-[11px] font-medium uppercase peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                style={AUTH_LABEL_STYLE}
              >
                Benutzername
              </label>
              <Input
                id="username"
                type="text"
                placeholder={mode === 'hsbi' ? 'amustermann' : 'notfall'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                style={AUTH_INPUT_STYLE}
                className={AUTH_INPUT_CLASS}
              />
            </div>
            <div className="grid gap-2">
              <label
                htmlFor="password"
                className="text-[11px] font-medium uppercase peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                style={AUTH_LABEL_STYLE}
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
                style={AUTH_INPUT_STYLE}
                className={AUTH_INPUT_CLASS}
              />
            </div>
            <Button
              type="submit"
              className="w-full mt-1 font-medium transition-all duration-200"
              style={AUTH_BUTTON_STYLE}
              disabled={isLoading}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,1)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.92)'; }}
            >
              {isLoading ? 'Anmeldung läuft…' : 'Anmelden'}
            </Button>
            <button
              type="button"
              onClick={() => { setMode(mode === 'hsbi' ? 'local' : 'hsbi'); setError(''); }}
              className="text-xs text-center text-white/30 hover:text-white/60 transition-colors"
            >
              {mode === 'hsbi' ? 'Notfall-Login' : 'Zurück zum HSBI-Login'}
            </button>
          </form>
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
};
