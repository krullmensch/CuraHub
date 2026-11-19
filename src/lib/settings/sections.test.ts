import { describe, expect, it, vi } from 'vitest';

// authStore's persist middleware writes to localStorage, which the node test environment lacks.
vi.hoisted(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  });
});
import { defaultSection, isSettingsPath, resolveSection, sectionsForRole, settingsPath } from './sections';

const ids = (role: Parameters<typeof sectionsForRole>[0]) => sectionsForRole(role).map((s) => s.id);

describe('settings sections', () => {
  it('has nothing for users and curators', () => {
    expect(ids('user')).toEqual([]);
    expect(ids('curator')).toEqual([]);
    expect(defaultSection('curator')).toBeNull();
  });

  it('gives profs the exhibition only', () => {
    expect(ids('prof')).toEqual(['ausstellung']);
  });

  it('gives admins the administration too', () => {
    expect(ids('admin')).toEqual(['ausstellung', 'benutzer', 'system', 'rechtliches']);
  });

  it('resolves only allowed sections', () => {
    expect(resolveSection('benutzer', 'admin')?.id).toBe('benutzer');
    expect(resolveSection('benutzer', 'prof')).toBeNull();
    expect(resolveSection('gibtsnicht', 'admin')).toBeNull();
    expect(resolveSection(undefined, 'admin')).toBeNull();
  });

  it('builds and recognises paths', () => {
    expect(settingsPath('system')).toBe('/einstellungen/system');
    expect(isSettingsPath(settingsPath())).toBe(true);
    expect(isSettingsPath('/einstellungen/benutzer')).toBe(true);
    expect(isSettingsPath('/einstellungenx')).toBe(false);
    expect(isSettingsPath('/exhibition/a/edit')).toBe(false);
  });
});
