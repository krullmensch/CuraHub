/**
 * This tab's live session id. The live channel announces it in `hello`; auto-sync sends it as
 * `X-Live-Session`, so the server lets this tab change what it has claimed.
 */

let current: string | null = null;

export const currentLiveSession = (): string | null => current;

/** Starts a new session (first connect, or the server refused the old id). */
export function newLiveSession(): string {
  current = crypto.randomUUID();
  return current;
}

export const LIVE_SESSION_HEADER = 'X-Live-Session';

/** Header object for fetch(); empty while the tab never connected. */
export function liveSessionHeaders(): Record<string, string> {
  return current ? { [LIVE_SESSION_HEADER]: current } : {};
}
