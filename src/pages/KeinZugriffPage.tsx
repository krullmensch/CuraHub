import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function KeinZugriffPage() {
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 text-center px-4">
      <h1 className="text-3xl font-display font-bold text-foreground">Kein Zugriff</h1>
      <p className="text-muted-foreground max-w-sm">
        Dein Account hat noch keine Berechtigung, auf den Editor zuzugreifen. Bitte wende dich an einen Professor oder Administrator, um freigeschaltet zu werden.
      </p>
      <div className="flex gap-3">
        <Link
          to="/login"
          onClick={logout}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Abmelden
        </Link>
      </div>
    </div>
  );
}
