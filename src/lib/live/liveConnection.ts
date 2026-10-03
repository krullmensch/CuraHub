import { gooeyToast } from 'goey-toast';
import { useAuthStore } from '../../store/authStore';
import { clearInstanceSelection, useEditorStore } from '../../store/editorStore';
import { useLiveStore } from '../../store/liveStore';
import { setClaimNotifier, setHeldClaims } from './claimGate';
import { claimedMessage, desiredClaimGroups, heldByOthers, lostKeys } from './claims';
import { ClaimSync } from './claimSync';
import { LiveClient, type LiveLocation, type SocketLike } from './liveClient';
import { editorModeOf } from './presence';
import type { ClaimHolder, ServerMessage } from './protocol';
import { newLiveSession } from './session';

/** The tab's live connection, wired to authStore (token), editorStore (selection) and liveStore. */

/** Selections are given up after this long without any input in the tab. */
const IDLE_RELEASE_MS = 5 * 60_000;
const IDLE_CHECK_MS = 30_000;
/** The same "wird gerade bearbeitet" hint is not repeated within this time. */
const HINT_REPEAT_MS = 2500;

function liveUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/api/live`;
}

let lastHint = { text: '', at: 0 };
function hintHeld(holders: ClaimHolder[]) {
  if (holders.length === 0) return;
  const text = claimedMessage(holders);
  const now = Date.now();
  if (text === lastHint.text && now - lastHint.at < HINT_REPEAT_MS) return;
  lastHint = { text, at: now };
  gooeyToast.warning(text);
}

function clearClaims() {
  useLiveStore.setState({ claims: [] });
  setHeldClaims(new Map());
}

/** Takes keys the server gave to someone else out of this tab's selection. */
function dropFromSelection(lost: Set<string>) {
  if (lost.size === 0) return;
  const s = useEditorStore.getState();
  const keep = (id: number) => !lost.has(`instance:${id}`);
  const ids = s.selectedInstanceIds.filter(keep);
  const primary = s.selectedInstanceId !== null && keep(s.selectedInstanceId) ? s.selectedInstanceId : ids[ids.length - 1] ?? null;
  useEditorStore.setState({
    ...(ids.length !== s.selectedInstanceIds.length ? { selectedInstanceIds: ids, selectedInstanceId: primary } : {}),
    ...(s.wallEditorSelection.some((id) => !keep(id)) ? { wallEditorSelection: s.wallEditorSelection.filter(keep) } : {}),
    ...(s.selectedWallId !== null && lost.has(`wall:${s.selectedWallId}`) ? { selectedWallId: null } : {}),
    ...(s.selectedFigureId !== null && lost.has(`figure:${s.selectedFigureId}`) ? { selectedFigureId: null } : {}),
  });
}

let claimSync: ClaimSync | null = null;

function handleMessage(msg: ServerMessage) {
  switch (msg.t) {
    case 'welcome':
      useLiveStore.setState({ self: { session: msg.session, user: msg.user } });
      return;
    case 'presence':
      useLiveStore.setState({
        // An empty list is the server's "you left this exhibition".
        exhibitionId: msg.members.length > 0 ? msg.exhibitionId : null,
        members: msg.members,
        publicVisitors: msg.publicVisitors,
      });
      return;
    case 'visitors':
      useLiveStore.setState({ visitorCount: msg.count });
      return;
    case 'claims': {
      if (msg.versionId !== useEditorStore.getState().activeVersionId) return;
      useLiveStore.setState({ claims: msg.entries });
      setHeldClaims(heldByOthers(msg.entries, useLiveStore.getState().self?.session ?? null));
      return;
    }
    case 'claimed': {
      // An answer to an older request: the newer one's answer will follow.
      if (!client || msg.seq !== client.latestClaimSeq) return;
      const denied = new Map(msg.denied.map((d) => [d.key, d.holder]));
      const held = heldByOthers(useLiveStore.getState().claims, useLiveStore.getState().self?.session ?? null);
      const lost = lostKeys(claimSync?.sent ?? [], msg.granted, (key) => denied.has(key) || held.has(key));
      dropFromSelection(lost);
      hintHeld([...denied.values()]);
      return;
    }
    case 'error':
      console.warn(`[Live] ${msg.code}: ${msg.message}`);
      if (msg.code === 'forbidden' || msg.code === 'not_public') {
        useLiveStore.setState({ exhibitionId: null, members: [], publicVisitors: 0, visitorCount: 0 });
        clearClaims();
      }
      return;
  }
}

let client: LiveClient | null = null;

function getClient(): LiveClient {
  client ??= new LiveClient({
    createSocket: () => new WebSocket(liveUrl()) as unknown as SocketLike,
    getToken: () => useAuthStore.getState().token,
    newSessionId: newLiveSession,
    onMessage: handleMessage,
    onStatus: (status) => {
      if (status === 'idle') {
        useLiveStore.setState({ status, exhibitionId: null, members: [], publicVisitors: 0, visitorCount: 0 });
        clearClaims();
      } else {
        useLiveStore.setState({ status });
      }
    },
  });
  return client;
}

export function setLiveLocation(location: LiveLocation | null): void {
  getClient().setLocation(location);
}

/**
 * Claims what the editor selects (see lib/live/claims.ts) and gives it up after
 * IDLE_RELEASE_MS without input. Returns the stop function.
 */
function startEditorClaims(): () => void {
  setClaimNotifier(hintHeld);
  const sync = new ClaimSync({
    send: (groups) => getClient().setClaims(groups),
    isSaving: () => useEditorStore.getState().syncStatus === 'saving',
  });
  claimSync = sync;
  sync.update(desiredClaimGroups(useEditorStore.getState()));

  const unsubscribe = useEditorStore.subscribe((state, prev) => {
    if (state.activeVersionId !== prev.activeVersionId) {
      // The server releases everything of the old version itself; the client must not send the
      // old set again after a reconnect either.
      if (sync.sent.length > 0) getClient().setClaims([]);
      sync.reset();
      clearClaims();
    }
    if (state.selectedInstanceIds !== prev.selectedInstanceIds || state.wallEditorSelection !== prev.wallEditorSelection
      || state.selectedWallId !== prev.selectedWallId || state.selectedFigureId !== prev.selectedFigureId
      || state.localInstances !== prev.localInstances || state.activeVersionId !== prev.activeVersionId) {
      sync.update(desiredClaimGroups(state));
    }
  });

  let lastInput = Date.now();
  const onInput = () => { lastInput = Date.now(); };
  const events = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;
  for (const e of events) window.addEventListener(e, onInput, { passive: true, capture: true });
  const idleTimer = setInterval(() => {
    if (Date.now() - lastInput < IDLE_RELEASE_MS) return;
    const s = useEditorStore.getState();
    const selected = s.selectedInstanceIds.length > 0 || s.wallEditorSelection.length > 0
      || s.selectedWallId !== null || s.selectedFigureId !== null;
    if (!selected || s.isTransforming) return;
    useEditorStore.setState({ ...clearInstanceSelection, wallEditorSelection: [], selectedWallId: null, selectedFigureId: null });
    gooeyToast.warning('Auswahl aufgehoben', {
      description: 'Nach 5 Minuten ohne Eingabe sind deine Objekte wieder für andere frei.',
    });
  }, IDLE_CHECK_MS);

  return () => {
    unsubscribe();
    for (const e of events) window.removeEventListener(e, onInput, { capture: true });
    clearInterval(idleTimer);
    sync.dispose();
    if (claimSync === sync) claimSync = null;
    setClaimNotifier(() => {});
    clearClaims();
  };
}

/**
 * Reports the editor's exhibition, version and mode while the editor is mounted, and claims
 * its selection. Started by EditorLayout; returns the stop function.
 */
export function startEditorPresence(): () => void {
  const report = () => {
    const s = useEditorStore.getState();
    if (s.activeExhibitionId === null) {
      setLiveLocation(null);
      return;
    }
    setLiveLocation({
      t: 'where',
      exhibitionId: s.activeExhibitionId,
      versionId: s.activeVersionId,
      mode: editorModeOf(s.plannerViewMode, s.wallEditor !== null),
    });
  };
  report();
  const unsubscribe = useEditorStore.subscribe((state, prev) => {
    if (state.activeExhibitionId !== prev.activeExhibitionId || state.activeVersionId !== prev.activeVersionId
      || state.plannerViewMode !== prev.plannerViewMode || (state.wallEditor === null) !== (prev.wallEditor === null)) {
      report();
    }
  });
  // A new token (login as someone else in this tab) needs a new hello.
  const unsubscribeAuth = useAuthStore.subscribe((state, prev) => {
    if (state.user?.id !== prev.user?.id) {
      setLiveLocation(null);
      report();
    }
  });
  const stopClaims = startEditorClaims();
  return () => {
    stopClaims();
    unsubscribe();
    unsubscribeAuth();
    setLiveLocation(null);
  };
}
