import { gooeyToast } from 'goey-toast';
import { useAuthStore } from '../../store/authStore';
import {
  applyRemoteChange, clearInstanceSelection, mergeRemoteState, useEditorStore,
  type ArtworkInstanceData, type ModularWallData, type ScaleFigureData,
} from '../../store/editorStore';
import { applyRemoteWallLayout } from '../wallEditor/layoutSync';
import { useLiveStore } from '../../store/liveStore';
import { setClaimNotifier, setHeldClaims } from './claimGate';
import { claimedMessage, desiredClaimGroups, heldByOthers, lostKeys } from './claims';
import { ChangeSequence } from './changeSequence';
import { ClaimSync } from './claimSync';
import { LiveClient, type LiveLocation, type SocketLike } from './liveClient';
import { editorModeOf } from './presence';
import type { ChangedMessage, ClaimHolder, ServerMessage, VersionsMessage } from './protocol';
import { newLiveSession } from './session';
import { clearAvatarPoses, keepAvatarSessions, setAvatarPose } from './avatarPoses';
import { clearCameraPose } from './cameraPose';
import { receiveDrag, release as releasePreview, releaseAll as releaseAllPreviews, releaseSessions, syncWithClaims } from './remotePreviews';
import { objectForKey } from './sceneObjects';
import { startSceneSync } from './sceneSync';

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

/** Everything other tabs showed in this tab's scene (version switch, leaving). */
function clearRemoteScene() {
  clearAvatarPoses();
  releaseAllPreviews();
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

// ── Live changes (spec §4) ───────────────────────────────────────────────────

/** Change numbers of the active version this tab has seen. */
const changeSequence = new ChangeSequence();
let resyncTimer: ReturnType<typeof setTimeout> | null = null;
const RESYNC_BUSY_RETRY_MS = 1000;
/**
 * Right after entering a version the editor is still loading it; a change arriving then may
 * be older or newer than what the load returns. Such changes are applied and followed by one
 * full merge once the load is surely done.
 */
const ENTRY_WINDOW_MS = 10_000;
const ENTRY_RESYNC_DELAY_MS = 2000;
let entryUntil = 0;
const RESYNC_ERROR_RETRY_MS = 5000;

/** Name of the person behind a tab, for hints ("anna hat …"). */
function nameOfSession(session: string | null): string {
  const member = session ? useLiveStore.getState().members.find((m) => m.session === session) : undefined;
  return member?.name ?? 'Jemand';
}

const isRow = (data: Record<string, unknown>): data is Record<string, unknown> & { id: number } => typeof data.id === 'number';

function applyChanged(msg: ChangedMessage) {
  const { data } = msg;
  switch (msg.kind) {
    case 'wallLayout':
      applyRemoteWallLayout(msg.versionId, data);
      return;
    case 'artwork': {
      if (!isRow(data)) return;
      const { asset, ...artwork } = data as Record<string, unknown> & { id: number; asset?: Record<string, unknown> };
      useEditorStore.getState().applyArtworkUpdate(artwork.id, artwork, asset ?? undefined);
      return;
    }
    default: {
      if (!isRow(data)) return;
      // A live drag of this object ends here; its saved pose comes with the store update.
      releasePreview(`${msg.kind}:${data.id}`);
      if (msg.op === 'delete') {
        const wasSelected = applyRemoteChange({ kind: msg.kind, op: 'delete', id: data.id });
        if (wasSelected) {
          gooeyToast.warning(`${nameOfSession(msg.by)} hat ein ausgewähltes Objekt gelöscht`);
        }
        return;
      }
      if (msg.kind === 'instance') applyRemoteChange({ kind: 'instance', op: 'upsert', data: data as unknown as ArtworkInstanceData });
      else if (msg.kind === 'wall') applyRemoteChange({ kind: 'wall', op: 'upsert', data: data as unknown as ModularWallData });
      else applyRemoteChange({ kind: 'figure', op: 'upsert', data: data as unknown as ScaleFigureData });
    }
  }
}

function scheduleResync(delayMs = 0) {
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = setTimeout(() => {
    resyncTimer = null;
    void resync();
  }, delayMs);
}

/** Loads the active version again and merges it (after a reconnect or a missed change). */
async function resync() {
  const { activeExhibitionId: exhibitionId, activeVersionId: versionId } = useEditorStore.getState();
  const token = useAuthStore.getState().token;
  if (!exhibitionId || !versionId || !token) return;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const responses = await Promise.all([
      fetch(`/api/instances?versionId=${versionId}`, { headers }),
      fetch(`/api/walls?versionId=${versionId}`, { headers }),
      fetch(`/api/scale-figures?versionId=${versionId}`, { headers }),
      fetch(`/api/exhibitions/${exhibitionId}/versions/${versionId}/wall-layout`, { headers }),
    ]);
    if (responses.some((r) => !r.ok)) throw new Error(`HTTP ${responses.map((r) => r.status).join('/')}`);
    const [instances, walls, figures, layout] = await Promise.all(responses.map((r) => r.json())) as [
      ArtworkInstanceData[], ModularWallData[], ScaleFigureData[], unknown,
    ];
    if (useEditorStore.getState().activeVersionId !== versionId) return;
    const merged = mergeRemoteState({ instances: instances.filter((i) => i.artwork?.asset), walls, figures });
    if (!merged) {
      scheduleResync(RESYNC_BUSY_RETRY_MS); // auto-sync is saving; try again when it's done
      return;
    }
    applyRemoteWallLayout(versionId, layout);
  } catch (err) {
    console.warn('[Live] Resync failed:', err);
    scheduleResync(RESYNC_ERROR_RETRY_MS);
  }
}

function handleVersions(msg: VersionsMessage) {
  useLiveStore.setState((s) => ({ versionsRevision: s.versionsRevision + 1 }));
  const self = useLiveStore.getState().self?.session ?? null;
  const editor = useEditorStore.getState();
  if (msg.event !== 'deleted' || msg.by === self || msg.versionId !== editor.activeVersionId) return;
  editor.setActiveVersion(msg.fallbackVersionId);
  editor.triggerInstancesRefresh();
  gooeyToast.warning('Version gelöscht', {
    description: `${nameOfSession(msg.by)} hat die Version gelöscht, in der du gearbeitet hast.${msg.fallbackVersionId ? ' Du bist jetzt in der Version davor.' : ''}`,
  });
}

function handleMessage(msg: ServerMessage) {
  switch (msg.t) {
    case 'welcome':
      useLiveStore.setState({ self: { session: msg.session, user: msg.user } });
      return;
    case 'presence': {
      useLiveStore.setState({
        // An empty list is the server's "you left this exhibition".
        exhibitionId: msg.members.length > 0 ? msg.exhibitionId : null,
        members: msg.members,
        publicVisitors: msg.publicVisitors,
      });
      // Avatars and live drags only of tabs that are still in this version.
      const versionId = useEditorStore.getState().activeVersionId;
      const here = new Set(msg.members.filter((m) => m.versionId === versionId).map((m) => m.session));
      keepAvatarSessions((session) => here.has(session));
      releaseSessions((session) => here.has(session));
      return;
    }
    case 'pose':
      setAvatarPose(msg.session, { p: msg.p, yaw: msg.yaw, pitch: msg.pitch });
      return;
    case 'gone':
      keepAvatarSessions((session) => session !== msg.session);
      return;
    case 'drag':
      receiveDrag(msg.session, msg.transforms);
      return;
    case 'visitors':
      useLiveStore.setState({ visitorCount: msg.count });
      return;
    case 'version': {
      const result = changeSequence.enter(msg.versionId, msg.seq);
      if (result === 'entered') entryUntil = Date.now() + ENTRY_WINDOW_MS;
      // Back in the same version after a reconnect, and something changed meanwhile.
      if (result === 'missed') scheduleResync();
      return;
    }
    case 'changed': {
      if (msg.versionId !== useEditorStore.getState().activeVersionId) return;
      const result = changeSequence.accept(msg.versionId, msg.seq);
      if (result === 'seen') return;
      if (result === 'missed') {
        scheduleResync(); // the full state includes this change too
        return;
      }
      if (msg.by !== null && msg.by === useLiveStore.getState().self?.session) return; // own change
      applyChanged(msg);
      if (Date.now() < entryUntil) scheduleResync(ENTRY_RESYNC_DELAY_MS);
      return;
    }
    case 'versions':
      handleVersions(msg);
      return;
    case 'claims': {
      if (msg.versionId !== useEditorStore.getState().activeVersionId) return;
      useLiveStore.setState({ claims: msg.entries });
      setHeldClaims(heldByOthers(msg.entries, useLiveStore.getState().self?.session ?? null));
      const holders = new Map(msg.entries.map((e) => [e.key, e.session]));
      syncWithClaims((key) => holders.get(key));
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
        clearRemoteScene();
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
      clearRemoteScene();
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
  const stopScene = startSceneSync({
    send: (msg) => getClient().sendTransient(msg),
    ownKeys: () => {
      const self = useLiveStore.getState().self?.session;
      return useLiveStore.getState().claims.filter((c) => c.session === self).map((c) => c.key);
    },
    lookup: objectForKey,
  });
  return () => {
    stopScene();
    clearCameraPose();
    clearRemoteScene();
    stopClaims();
    unsubscribe();
    unsubscribeAuth();
    setLiveLocation(null);
  };
}

/**
 * Public viewer: this visitor's position for the others' blobs (step 5). Started by ViewerPage
 * while it visits an exhibition; returns the stop function.
 */
export function startVisitorPresence(): () => void {
  const stop = startSceneSync({
    send: (msg) => getClient().sendTransient(msg),
    ownKeys: () => [],
    lookup: () => undefined,
  });
  return () => {
    stop();
    clearCameraPose();
    clearAvatarPoses();
  };
}
