import { Navigate, NavLink, useParams } from 'react-router-dom';
import { Building2, FileText, Activity, Users, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import {
  SETTINGS_GROUPS, defaultSection, resolveSection, sectionsForRole, settingsPath,
  type SettingsSectionId,
} from '@/lib/settings/sections';
import { ExhibitionSettings } from '@/components/settings/ExhibitionSettings';
import { UserSettings } from '@/components/settings/UserSettings';
import { SystemSettings } from '@/components/settings/SystemSettings';
import { LegalSettings } from '@/components/settings/LegalSettings';

const ICONS: Record<SettingsSectionId, LucideIcon> = {
  ausstellung: Building2,
  benutzer: Users,
  system: Activity,
  rechtliches: FileText,
};

const CONTENT: Record<SettingsSectionId, () => React.ReactElement> = {
  ausstellung: ExhibitionSettings,
  benutzer: UserSettings,
  system: SystemSettings,
  rechtliches: LegalSettings,
};

/**
 * „Einstellungen" (`/einstellungen/:bereich`), inside the dashboard like the asset library:
 * the exhibition of the project chosen in the header (prof+) and the administration of the
 * installation (admin). Sections and roles: `lib/settings/sections.ts`.
 */
export const SettingsPage = () => {
  const { bereich } = useParams<{ bereich?: string }>();
  const role = useAuthStore((s) => s.user?.role ?? 'user');

  const fallback = defaultSection(role);
  if (!fallback) return <Navigate to="/kein-zugriff" replace />;
  const section = resolveSection(bereich, role);
  if (!section) return <Navigate to={settingsPath(fallback.id)} replace />;

  const sections = sectionsForRole(role);
  const Content = CONTENT[section.id];

  return (
    <div className="h-full w-full overflow-y-auto bg-zinc-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8 md:flex-row md:px-8">
        <nav aria-label="Einstellungen" className="md:w-56 md:shrink-0">
          <h1 className="mb-6 font-display text-2xl font-light">Einstellungen</h1>
          <div className="flex gap-6 overflow-x-auto md:flex-col md:gap-5">
            {SETTINGS_GROUPS.map((group) => {
              const items = sections.filter((s) => s.group === group.id);
              if (items.length === 0) return null;
              return (
                <div key={group.id} className="shrink-0">
                  <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500">{group.label}</p>
                  <ul className="flex gap-1 md:flex-col">
                    {items.map((item) => {
                      const Icon = ICONS[item.id];
                      return (
                        <li key={item.id}>
                          <NavLink
                            to={settingsPath(item.id)}
                            className={({ isActive }) => cn(
                              'flex items-center gap-2.5 whitespace-nowrap rounded-md px-2 py-1.5 text-sm transition-colors',
                              isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white',
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            {item.label}
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>

        <main className="min-w-0 flex-1">
          <header className="mb-6 border-b border-zinc-800 pb-4">
            <h2 className="font-display text-xl font-light">{section.label}</h2>
            <p className="mt-1 text-sm text-zinc-400">{section.description}</p>
          </header>
          {/* key: a section's own state (forms, confirmations) starts fresh when switching. */}
          <Content key={section.id} />
        </main>
      </div>
    </div>
  );
};
