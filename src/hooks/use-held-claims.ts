import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useLiveStore } from '../store/liveStore';
import { heldByOthers } from '../lib/live/claims';
import type { ClaimHolder } from '../lib/live/protocol';

/** Keys other tabs hold in this version (live claims), for lists that mark held objects. */
export function useHeldByOthers(): Map<string, ClaimHolder> {
  const { claims, session } = useLiveStore(useShallow((s) => ({ claims: s.claims, session: s.self?.session ?? null })));
  return useMemo(() => heldByOthers(claims, session), [claims, session]);
}
