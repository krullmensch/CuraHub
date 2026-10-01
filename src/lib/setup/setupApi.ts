export type SetupCheckStatus = 'ok' | 'warn' | 'fail';
export interface SetupCheck { id: string; label: string; status: SetupCheckStatus; detail: string }

export interface CompleteSetupBody {
    publicUrl: string;
    localAdmin: { username: string; password: string };
    hsbiAdmin?: { username: string; password: string };
}

/** The setup token expired or the server restarted (new code) — the wizard starts over. */
export class SetupExpiredError extends Error {}

async function call<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/setup${path}`, { ...init, headers });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) throw new SetupExpiredError(data.error ?? 'Setup-Sitzung abgelaufen.');
    if (!res.ok) throw new Error(data.error ?? 'Unerwarteter Fehler.');
    return data as T;
}

export const setupApi = {
    status: () => call<{ complete: boolean }>('/status'),
    verifyCode: (code: string) => call<{ token: string }>('/verify-code', { method: 'POST', body: JSON.stringify({ code }) }),
    checks: (token: string) => call<{ checks: SetupCheck[]; suggestedPublicUrl: string }>('/checks', {}, token),
    hsbiCheck: (token: string, username: string, password: string) =>
        call<{ ok: true; email: string } | { ok: false; reason: string }>(
            '/hsbi-check', { method: 'POST', body: JSON.stringify({ username, password }) }, token),
    complete: (token: string, body: CompleteSetupBody) =>
        call<{ ok: true }>('/complete', { method: 'POST', body: JSON.stringify(body) }, token),
};
