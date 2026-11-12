import type { LegalEnvironment, LegalSettings } from './documents';
import type { LegalOperator } from './operator';

export type LegalKind = 'impressum' | 'datenschutz';

export const LEGAL_PAGES: Record<LegalKind, { path: string; title: string; field: 'imprint' | 'privacy' }> = {
  impressum: { path: '/impressum', title: 'Impressum', field: 'imprint' },
  datenschutz: { path: '/datenschutz', title: 'Datenschutz', field: 'privacy' },
};

/** GET /public/legal: operator details, own texts and what the server knows about its setup. */
export type LegalData = LegalSettings & LegalEnvironment;

export async function fetchLegalData(): Promise<LegalData> {
  const res = await fetch('/public/legal');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function saveLegalSettings(
  token: string,
  settings: { operator: LegalOperator | null; imprint: string; privacy: string },
): Promise<LegalSettings> {
  // updatedAt is the server's to set.
  const operator = settings.operator ? { ...settings.operator, updatedAt: undefined } : null;
  const res = await fetch('/admin/legal', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...settings, operator }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Speichern fehlgeschlagen.');
  return body as LegalSettings;
}
