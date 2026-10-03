import { useAuthStore } from '../../store/authStore';
import { useEditorStore } from '../../store/editorStore';
import { useLiveStore } from '../../store/liveStore';
import { LiveClient, type LiveLocation, type SocketLike } from './liveClient';
import { editorModeOf } from './presence';
import type { ServerMessage } from './protocol';

/** The tab's live connection, wired to authStore (token) and liveStore (what arrives). */

function liveUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/api/live`;
}

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
    case 'error':
      console.warn(`[Live] ${msg.code}: ${msg.message}`);
      if (msg.code === 'forbidden' || msg.code === 'not_public') {
        useLiveStore.setState({ exhibitionId: null, members: [], publicVisitors: 0, visitorCount: 0 });
      }
      return;
  }
}

let client: LiveClient | null = null;

function getClient(): LiveClient {
  client ??= new LiveClient({
    createSocket: () => new WebSocket(liveUrl()) as unknown as SocketLike,
    getToken: () => useAuthStore.getState().token,
    newSessionId: () => crypto.randomUUID(),
    onMessage: handleMessage,
    onStatus: (status) => useLiveStore.setState(
      status === 'idle'
        ? { status, exhibitionId: null, members: [], publicVisitors: 0, visitorCount: 0 }
        : { status },
    ),
  });
  return client;
}

export function setLiveLocation(location: LiveLocation | null): void {
  getClient().setLocation(location);
}

/**
 * Reports the editor's exhibition, version and mode while the editor is mounted. Started by
 * EditorLayout; returns the stop function.
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
  return () => {
    unsubscribe();
    unsubscribeAuth();
    setLiveLocation(null);
  };
}
