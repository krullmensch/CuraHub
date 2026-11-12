/** Impressum + Datenschutzerklärung of this installation (Markdown, written by an admin). */
export interface LegalTexts {
  imprint: string;
  privacy: string;
}

export type LegalKind = 'impressum' | 'datenschutz';

export const LEGAL_PAGES: Record<LegalKind, { path: string; title: string; field: keyof LegalTexts }> = {
  impressum: { path: '/impressum', title: 'Impressum', field: 'imprint' },
  datenschutz: { path: '/datenschutz', title: 'Datenschutz', field: 'privacy' },
};

export async function fetchLegalTexts(): Promise<LegalTexts> {
  const res = await fetch('/public/legal');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function saveLegalTexts(token: string, texts: LegalTexts): Promise<LegalTexts> {
  const res = await fetch('/admin/legal', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(texts),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Speichern fehlgeschlagen.');
  return body as LegalTexts;
}
