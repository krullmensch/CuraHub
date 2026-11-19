import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogIn, Settings } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { settingsPath } from '@/lib/settings/sections';
import { cn } from '@/lib/utils';
import { HEADER_BUTTON } from './headerStyles';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn('transition-colors', isActive ? 'text-white' : 'text-gray-400 hover:text-white');

/**
 * Header of the public pages (start page, exhibitions, legal pages, „Kein Zugriff") in the
 * dashboard's style, so leaving the editor doesn't feel like another app: same bar, logo, nav
 * links, bordered buttons and the account menu (`AccountMenu`, with „Abmelden").
 */
export function SiteHeader({ className }: { className?: string }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isCurator = useAuthStore((s) => s.isCurator);
  const isProf = useAuthStore((s) => s.isProf);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-3 py-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-4 sm:gap-6">
        <Link to="/" className="shrink-0 whitespace-nowrap text-lg font-bold tracking-tight text-white">
          CuraHub
        </Link>
        <nav className="flex gap-4 text-sm font-medium">
          <NavLink to="/" end className={navLinkClass}>Start</NavLink>
          <NavLink to="/exhibitions" className={navLinkClass}>Ausstellungen</NavLink>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        {isProf && (
          <Link to={settingsPath()} className={cn(HEADER_BUTTON, 'hidden md:flex')}>
            <Settings className="h-3.5 w-3.5" />
            Einstellungen
          </Link>
        )}
        {isAuthenticated ? (
          <>
            {isCurator && (
              <Link to="/project" className={HEADER_BUTTON} aria-label="Dashboard">
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            )}
            <AccountMenu onLogout={() => { logout(); navigate('/'); }} />
          </>
        ) : (
          <Link to="/login" className={HEADER_BUTTON}>
            <LogIn className="h-3.5 w-3.5" />
            Anmelden
          </Link>
        )}
      </div>
    </header>
  );
}
