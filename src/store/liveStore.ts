import { create } from 'zustand';
import type { ClaimEntry, LiveUser, PresenceMember } from '../lib/live/protocol';
import type { LiveStatus } from '../lib/live/liveClient';

/**
 * What the live channel knows (src/lib/live/): connection status, this tab's identity, the
 * people in the current exhibition and the public visitor count. Written only by
 * lib/live/liveConnection.ts.
 */
interface LiveState {
  status: LiveStatus;
  self: { session: string; user: LiveUser | null } | null;
  /** Exhibition the presence list belongs to (null = none). */
  exhibitionId: number | null;
  members: PresenceMember[];
  /** Visitors in the public viewer of `exhibitionId` (seen from the editor). */
  publicVisitors: number;
  /** Visitors in the exhibition this tab is visiting (public viewer), including this tab. */
  visitorCount: number;
  /** Claims in this tab's version (all tabs, this one included). */
  claims: ClaimEntry[];
}

export const useLiveStore = create<LiveState>()(() => ({
  status: 'idle',
  self: null,
  exhibitionId: null,
  members: [],
  publicVisitors: 0,
  visitorCount: 0,
  claims: [],
}));
