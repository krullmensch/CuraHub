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

export const LoginPage = () => {
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
      const response = await fetch('/auth/login', {
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
    <div
      className="flex min-h-screen items-center justify-center px-4 relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse 90% 70% at 50% 45%, #17171f 0%, #0c0c10 55%, #07070a 100%)',
      }}
    >
      {/* Architectural grid — gallery floor plan aesthetic */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '72px 72px',
        }}
      />

      {/* Soft central radial glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '700px',
          height: '700px',
          background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 65%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-7">
        {/* Brand mark */}
        <div className="text-center select-none">
          <p
            className="text-xs uppercase mb-2"
            style={{ letterSpacing: '0.35em', color: 'rgba(255,255,255,0.25)', fontFamily: '"Albert Sans", sans-serif' }}
          >
            HSBI
          </p>
          <h1
            className="text-[2rem] font-light"
            style={{ fontFamily: '"Funnel Display", sans-serif', color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.01em' }}
          >
            CuraHub
          </h1>
        </div>

        {/* Login card */}
        <Card
          className="w-full border"
          style={{
            background: 'rgba(255,255,255,0.035)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderColor: 'rgba(255,255,255,0.09)',
            boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
          }}
        >
          <CardHeader className="pb-4">
            <CardTitle
              className="text-xl font-light"
              style={{ fontFamily: '"Funnel Display", sans-serif', color: 'rgba(255,255,255,0.88)' }}
            >
              Anmelden
            </CardTitle>
            <CardDescription style={{ color: 'rgba(255,255,255,0.38)' }}>
              Melde dich mit deinem HSBI-Account an.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              {error && (
                <div
                  className="text-sm font-medium rounded-md px-3 py-2"
                  style={{
                    color: 'rgba(248,113,113,0.9)',
                    background: 'rgba(127,29,29,0.2)',
                    border: '1px solid rgba(239,68,68,0.2)',
                  }}
                >
                  {error}
                </div>
              )}
              <div className="grid gap-2">
                <label
                  htmlFor="username"
                  className="text-[11px] font-medium uppercase peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  style={{ letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' }}
                >
                  Benutzername
                </label>
                <Input
                  id="username"
                  type="text"
                  placeholder="HSBI-Kennung"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.88)',
                  }}
                  className="placeholder:text-white/25 focus-visible:ring-white/20 focus-visible:border-white/25"
                />
              </div>
              <div className="grid gap-2">
                <label
                  htmlFor="password"
                  className="text-[11px] font-medium uppercase peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  style={{ letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' }}
                >
                  Passwort
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.88)',
                  }}
                  className="placeholder:text-white/25 focus-visible:ring-white/20 focus-visible:border-white/25"
                />
              </div>
              <Button
                type="submit"
                className="w-full mt-1 font-medium transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.92)',
                  color: '#0a0a0c',
                  letterSpacing: '0.02em',
                }}
                disabled={isLoading}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,1)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.92)'; }}
              >
                {isLoading ? 'Anmeldung läuft…' : 'Anmelden'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p
          className="text-xs text-center select-none"
          style={{ color: 'rgba(255,255,255,0.15)', letterSpacing: '0.04em' }}
        >
          Digitale Ausstellungsplanung · Hochschule Bielefeld
        </p>
      </div>
    </div>
  );
};
