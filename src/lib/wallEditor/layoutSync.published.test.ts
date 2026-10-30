import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The persist middleware writes to localStorage, which the node test environment lacks.
vi.hoisted(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  });
});
import { useEditorStore } from '@/store/editorStore';
import { useAuthStore } from '@/store/authStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import { publishedEditGate } from '@/lib/publishedEditGate';
import { toast } from '@/hooks/use-toast';
import { flushWallLayout, revertWallLayout, startWallLayoutSync } from './layoutSync';

const EXHIBITION = 5;
const VERSION = 77;
const URL = `/api/exhibitions/${EXHIBITION}/versions/${VERSION}/wall-layout`;
const LOADED = { hangingHeight: 1.6, guides: { 'wall:7:front': [{ axis: 'h', value: 1.2 }] } };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let patchResponse: () => Response = () => json({});
const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
  Promise.resolve(init?.method === 'PATCH' ? patchResponse() : json(LOADED)));
const patches = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
const settle = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

let stop: (() => void) | null = null;
const win = new EventTarget();

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', win);
  useAuthStore.setState({ token: 'test-token' });
  useEditorStore.setState({ activeExhibitionId: EXHIBITION, activeVersionId: VERSION, activeVersionPublished: false });
  publishedEditGate.reset();
  patchResponse = () => json({});
  stop = startWallLayoutSync();
  await settle(20); // load
  expect(useWallEditorView.getState().hangingHeight).toBe(1.6);
  fetchMock.mockClear();
});

afterEach(() => {
  stop?.();
  stop = null;
  useEditorStore.setState({ activeVersionPublished: false });
  publishedEditGate.reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('wall layout sync on a published version', () => {
  it('does not PATCH while published and requests the gate', async () => {
    useEditorStore.setState({ activeVersionPublished: true });
    useWallEditorView.getState().setHangingHeight(1.8);
    await settle();
    expect(patches()).toHaveLength(0);
    expect(publishedEditGate.getState().phase).toBe('asking');
    expect(useWallEditorView.getState().hangingHeight).toBe(1.8);
  });

  it('keepalive flush on pagehide sends nothing while published', async () => {
    useEditorStore.setState({ activeVersionPublished: true });
    useWallEditorView.getState().setHangingHeight(1.8);
    win.dispatchEvent(new Event('pagehide'));
    await settle(20);
    expect(patches()).toHaveLength(0);
  });

  it('switching away right after an edit of a published version sends nothing for it', async () => {
    useEditorStore.setState({ activeVersionPublished: true });
    useWallEditorView.getState().setHangingHeight(1.8);
    // The switch clears the flag before the pending change is flushed.
    useEditorStore.setState({ activeVersionId: VERSION + 1, activeVersionPublished: false });
    await settle(20);
    expect(patches()).toHaveLength(0);
  });

  it('a 409 version_published marks the version published and requests the gate', async () => {
    const toastSpy = vi.spyOn(toast, 'error');
    patchResponse = () => json({ code: 'version_published', message: 'Veröffentlicht' }, 409);
    useWallEditorView.getState().setHangingHeight(1.8);
    await settle();
    expect(patches()).toHaveLength(1);
    expect(useEditorStore.getState().activeVersionPublished).toBe(true);
    expect(publishedEditGate.getState().phase).toBe('asking');
    expect(toastSpy).not.toHaveBeenCalled();
    expect(useWallEditorView.getState().hangingHeight).toBe(1.8);
  });

  it('revertWallLayout re-applies the last loaded layout', async () => {
    useEditorStore.setState({ activeVersionPublished: true });
    useWallEditorView.getState().setHangingHeight(1.8);
    await settle();
    revertWallLayout();
    expect(useWallEditorView.getState().hangingHeight).toBe(1.6);
    // Reverting is not a change to save.
    useEditorStore.setState({ activeVersionPublished: false });
    await settle();
    expect(patches()).toHaveLength(0);
  });

  it('sends the held layout once the version is no longer published', async () => {
    useEditorStore.setState({ activeVersionPublished: true });
    useWallEditorView.getState().setHangingHeight(1.8);
    await settle();
    useEditorStore.setState({ activeVersionPublished: false });
    await settle();
    expect(patches()).toHaveLength(1);
    expect(JSON.parse(String(patches()[0][1]?.body)).hangingHeight).toBe(1.8);
    expect(patches()[0][0]).toBe(URL);
  });
});

describe('flushWallLayout (I2)', () => {
  it('sends a waiting change at once and reports it saved', async () => {
    useWallEditorView.getState().setHangingHeight(1.9);
    expect(await flushWallLayout()).toBe(true);
    expect(patches()).toHaveLength(1);
    expect(JSON.parse(String(patches()[0][1]?.body)).hangingHeight).toBe(1.9);
  });

  it('reports false when the save failed', async () => {
    vi.spyOn(toast, 'error');
    patchResponse = () => json({}, 500);
    useWallEditorView.getState().setHangingHeight(1.9);
    expect(await flushWallLayout()).toBe(false);
  });

  it('is true with nothing to send', async () => {
    expect(await flushWallLayout()).toBe(true);
    expect(patches()).toHaveLength(0);
  });
});
