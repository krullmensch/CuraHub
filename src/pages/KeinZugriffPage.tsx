import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function KeinZugriffPage() {
  const refreshAuth = useAuthStore((state) => state.refreshAuth);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [denied, setDenied] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    setDenied(false);
    await refreshAuth();
    if (useAuthStore.getState().isCurator) {
      setUnlocked(true);
    } else {
      setDenied(true);
    }
    setChecking(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 bg-zinc-950/90 backdrop-blur-md border-b border-white/5">
        <Link to="/" className="font-display text-xl font-light tracking-wide text-white">
          Cura<span className="font-semibold">Hub</span>
        </Link>
        {isAuthenticated ? (
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-500 tracking-wide">
              Eingeloggt als <span className="text-zinc-300">{user?.email}</span>
            </span>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-4 py-1.5 rounded-full text-xs transition-all"
            >
              Logout
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-1.5 rounded-full text-xs font-medium transition-all"
          >
            Login
          </Link>
        )}
      </nav>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-4 pt-20">
        {!isAuthenticated ? (
          <>
            <p className="text-xs tracking-[0.35em] uppercase text-zinc-600">Kein Zugriff</p>
            <h1 className="text-3xl font-display font-bold text-white">Du bist nicht eingeloggt</h1>
            <p className="text-zinc-400 max-w-sm">
              Melde dich mit deinem HSBI-Account an, um deinen Zugang zu prüfen.
            </p>
            <Link
              to="/login"
              className="mt-4 border border-zinc-600 hover:border-white text-zinc-300 hover:text-white px-6 py-2 rounded-full text-sm transition-all"
            >
              Zum Login →
            </Link>
          </>
        ) : (
          <>
            <p className="text-xs tracking-[0.35em] uppercase text-zinc-600">
              {unlocked ? 'Zugang erteilt' : 'Zugang ausstehend'}
            </p>
            <h1 className="text-3xl font-display font-bold text-white">
              {unlocked ? 'Du wurdest freigeschaltet' : 'Du wurdest in das System aufgenommen'}
            </h1>
            <p className="text-zinc-400 max-w-sm">
              {unlocked
                ? 'Dein Account wurde als Kurator:in freigeschalten. Du kannst jetzt den Editor betreten.'
                : 'Warte nun darauf, dass dich ein Admin oder Prof als Kurator:in freischaltet'}
            </p>
            <button
              onClick={handleCheck}
              disabled={checking || unlocked}
              className={`mt-4 px-6 py-2 rounded-full text-sm transition-all border disabled:cursor-not-allowed ${
                unlocked
                  ? 'border-green-600 text-green-400 bg-green-950/40'
                  : denied
                  ? 'border-red-700 text-red-400 bg-red-950/40 hover:border-red-500'
                  : 'border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white disabled:opacity-40'
              }`}
            >
              {checking
                ? 'Wird geprüft…'
                : unlocked
                ? 'Freigegeben ✓'
                : denied
                ? 'Noch kein Zugriff — erneut prüfen'
                : 'Zugang prüfen'}
            </button>
            {unlocked && (
              <button
                onClick={() => navigate('/project')}
                className="border border-zinc-600 hover:border-white text-zinc-300 hover:text-white px-6 py-2 rounded-full text-sm transition-all"
              >
                Zum Editor →
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
