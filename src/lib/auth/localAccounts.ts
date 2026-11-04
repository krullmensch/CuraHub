import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../setup/validation';

/** Local accounts (created by an admin) have a username without "@"; HSBI accounts an @hsbi.de address. */
export const isLocalAccount = (email: string): boolean => !email.includes('@');

/** German error for a new password, or null when it may be sent (the server checks the same rules). */
export function newPasswordError(current: string, next: string, repeat: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
  if (next.length > MAX_PASSWORD_LENGTH) return `Das neue Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen haben.`;
  if (next === current) return 'Das neue Passwort muss sich vom aktuellen unterscheiden.';
  if (next !== repeat) return 'Die beiden neuen Passwörter stimmen nicht überein.';
  return null;
}

/** POST /auth/me/password; resolves to the server's error message, or null on success. */
export async function changePassword(token: string, current: string, next: string): Promise<string | null> {
  try {
    const res = await fetch('/auth/me/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ current, next }),
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return typeof data.error === 'string' ? data.error : 'Passwort konnte nicht geändert werden.';
  } catch {
    return 'Keine Verbindung zum Server.';
  }
}
