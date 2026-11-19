import { roleAtLeast, type AppRole } from '@/store/authStore';

/**
 * The settings area (`/einstellungen/:bereich`, `SettingsPage`): one page with a side menu,
 * grouped. The exhibition's own settings are for profs and admins, the installation's
 * administration (accounts, system checks, legal texts) for admins only.
 */
export type SettingsSectionId = 'ausstellung' | 'benutzer' | 'system' | 'rechtliches';

export interface SettingsSection {
  id: SettingsSectionId;
  /** Menu entry and heading. */
  label: string;
  /** One line under the heading. */
  description: string;
  group: SettingsGroupId;
  minRole: AppRole;
}

export type SettingsGroupId = 'ausstellung' | 'administration';

export const SETTINGS_GROUPS: readonly { id: SettingsGroupId; label: string }[] = [
  { id: 'ausstellung', label: 'Ausstellung' },
  { id: 'administration', label: 'Administration' },
];

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: 'ausstellung',
    label: 'Allgemein',
    description: 'Name, Zeitraum, Poster und Kurator:innen der Ausstellung im gewählten Projekt.',
    group: 'ausstellung',
    minRole: 'prof',
  },
  {
    id: 'benutzer',
    label: 'Benutzer',
    description: 'Rollen vergeben, CuraHub-Konten anlegen, Passwörter zurücksetzen.',
    group: 'administration',
    minRole: 'admin',
  },
  {
    id: 'system',
    label: 'System',
    description: 'Ob die Installation gesund ist: Datenbank, Speicher, Werkzeuge, Backups.',
    group: 'administration',
    minRole: 'admin',
  },
  {
    id: 'rechtliches',
    label: 'Rechtliche Angaben',
    description: 'Betreiberangaben für Impressum und Datenschutzerklärung.',
    group: 'administration',
    minRole: 'admin',
  },
];

/** Who sees the settings at all (the header button, the route). */
export const SETTINGS_MIN_ROLE: AppRole = 'prof';

export function sectionsForRole(role: AppRole): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => roleAtLeast(role, s.minRole));
}

/** The section a URL segment stands for, or null when it is unknown or not allowed for `role`. */
export function resolveSection(segment: string | undefined, role: AppRole): SettingsSection | null {
  if (!segment) return null;
  return sectionsForRole(role).find((s) => s.id === segment) ?? null;
}

/** First section `role` may open (null: none, the settings are not for this role). */
export function defaultSection(role: AppRole): SettingsSection | null {
  return sectionsForRole(role)[0] ?? null;
}

export function settingsPath(id?: SettingsSectionId): string {
  return id ? `/einstellungen/${id}` : '/einstellungen';
}

/** True on `/einstellungen` and its sections. */
export function isSettingsPath(pathname: string): boolean {
  return pathname === '/einstellungen' || pathname.startsWith('/einstellungen/');
}
