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
import { useEditorStore, type ArtworkInstanceData, type ModularWallData, type ScaleFigureData } from './editorStore';
import { useAuthStore } from './authStore';
import { publishedEditGate } from '../lib/publishedEditGate';
import { toast } from '@/hooks/use-toast';

const inst = (id: number, x = 0): ArtworkInstanceData => ({
  id, wallId: null, artworkId: id * 10,
  artwork: { id: id * 10, title: `Werk ${id}`, asset: { path: '', width: 100, height: 100, dpi: 72, type: 'image' } },
  position_x: x, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1,
} as ArtworkInstanceData);

const wall = (id: number, label: string, x = 0, isDefault = false): ModularWallData => ({
  id, label, position_x: x, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  width: 3, height: 3, thickness: 0.2, color: '#fff', isLocked: false, ...(isDefault ? { isDefault: true } : {}),
});

const figure = (id: number, x = 0): ScaleFigureData => ({ id, position_x: x, position_z: 0, rotation_y: 0, isPublic: false });

const state = () => useEditorStore.getState();
const settle = () => new Promise((resolve) => setTimeout(resolve, 220));

type Handler = (url: string, init: RequestInit) => Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const published = () => json({ code: 'version_published', message: 'Veröffentlicht' }, 409);
let handler: Handler = () => json({});
const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));

const VERSION = 42;

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  useAuthStore.setState({ token: 'test-token' });
  // Same version every test: switching would reset the snapshots behind the setters' back.
  useEditorStore.setState({ activeVersionId: VERSION, activeVersionPublished: false });
  // The setters seed auto-sync's "persisted" snapshots.
  state().setLocalInstances([inst(1), inst(2)]);
  state().setLocalWalls([wall(7, 'Wall A')]);
  state().setLocalScaleFigures([figure(3)]);
  useEditorStore.setState({
    selectedInstanceId: null, selectedInstanceIds: [], selectedWallId: null, selectedFigureId: null,
    wallEditor: null, wallEditorSelection: [], hasUnsavedChanges: false, syncStatus: 'idle',
  });
  await settle();
  publishedEditGate.reset();
  handler = () => json({});
  fetchMock.mockClear();
});

afterEach(() => {
  useEditorStore.setState({ activeVersionPublished: false });
  publishedEditGate.reset();
  vi.restoreAllMocks();
});

const move = (id: number, x: number) =>
  state().commitLocalChange(state().localInstances.map((i) => (i.id === id ? { ...i, position_x: x } : i)));

describe('auto-sync on a published version', () => {
  it('sends nothing and requests the gate while the active version is published', async () => {
    state().setActiveVersionPublished(true);
    const depthBefore = state().pastInstances.length;
    move(1, 5);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(publishedEditGate.getState()).toEqual({ phase: 'asking', undoDepth: depthBefore });
    // The scene keeps the change.
    expect(state().localInstances.find((i) => i.id === 1)?.position_x).toBe(5);
    expect(state().syncStatus).toBe('idle');
  });

  it('loading data while published asks nothing', async () => {
    state().setActiveVersionPublished(true);
    state().setLocalInstances([inst(1), inst(2), inst(5)]);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(publishedEditGate.getState().phase).toBe('idle');
  });

  it('a 409 version_published in a mixed batch marks the version published, keeps the refused rows out of prev*, reverts nothing and shows no error toast', async () => {
    const toastSpy = vi.spyOn(toast, 'error');
    handler = (url, init) => {
      if (url === '/api/instances/1' && init.method === 'PATCH') return json({ id: 1 });
      if (url === '/api/instances/2' && init.method === 'PATCH') return published();
      return json({});
    };
    move(1, 5);
    move(2, 6);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state().activeVersionPublished).toBe(true);
    expect(publishedEditGate.getState().phase).toBe('asking');
    // Nothing reverted.
    expect(state().localInstances.map((i) => i.position_x)).toEqual([5, 6]);
    expect(toastSpy).not.toHaveBeenCalled();
    expect(state().syncStatus).toBe('idle');
    expect(state().hasUnsavedChanges).toBe(true);
    // prev* keeps 2 at its persisted value: discarding reverts only the refused row.
    state().discardUnsyncedChanges(publishedEditGate.getState().undoDepth);
    expect(state().localInstances.map((i) => i.position_x)).toEqual([5, 0]);
  });

  it('discardUnsyncedChanges restores the persisted lists and drops undo steps after undoDepth', async () => {
    // One step that was saved.
    move(1, 3);
    await settle();
    fetchMock.mockClear();
    state().setActiveVersionPublished(true);
    const depth = state().pastInstances.length;
    move(1, 5);
    move(2, 6);
    state().deleteSelectedInstance(); // nothing selected: no step
    useEditorStore.setState({ localInstances: [...state().localInstances, inst(-9)] });
    state().updateWall(7, { position_x: 4 });
    state().addWall(wall(-5, 'Wall X'));
    useEditorStore.setState({ localScaleFigures: [figure(3, 2), figure(-4)] });
    useEditorStore.setState({ selectedInstanceIds: [2, -9], selectedInstanceId: -9, selectedWallId: -5, selectedFigureId: -4, wallEditorSelection: [-9] });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(publishedEditGate.getState().undoDepth).toBe(depth);

    state().discardUnsyncedChanges(depth);
    expect(state().localInstances.map((i) => [i.id, i.position_x])).toEqual([[1, 3], [2, 0]]);
    expect(state().localWalls.map((w) => [w.id, w.position_x])).toEqual([[7, 0]]);
    expect(state().localScaleFigures.map((f) => [f.id, f.position_x])).toEqual([[3, 0]]);
    expect(state().pastInstances).toHaveLength(depth);
    expect(state().futureInstances).toEqual([]);
    expect(state().selectedInstanceIds).toEqual([2]);
    expect(state().selectedInstanceId).toBe(2);
    expect(state().wallEditorSelection).toEqual([]);
    expect(state().selectedWallId).toBeNull();
    expect(state().selectedFigureId).toBeNull();
    // Undo still reaches the saved step.
    state().undo();
    expect(state().localInstances.find((i) => i.id === 1)?.position_x).toBe(0);
  });

  it('sends the held changes once the version is no longer published', async () => {
    state().setActiveVersionPublished(true);
    move(1, 5);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    state().setActiveVersionPublished(false);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/instances/1');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
  });

  it('switching to another version does not send the old lists to it', async () => {
    state().setActiveVersionPublished(true);
    move(1, 5);
    await settle();
    state().setActiveVersion(VERSION + 1);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    useEditorStore.setState({ activeVersionId: VERSION });
  });
});

describe('default walls on a published version', () => {
  const defaults = () => [wall(-1, 'Wall A', 0, true), wall(-2, 'Wall B', 3, true)];

  it('untouched default walls neither POST nor ask; editing one asks', async () => {
    state().setActiveVersionPublished(true);
    state().setLocalWalls(defaults());
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(publishedEditGate.getState().phase).toBe('idle');

    state().updateWall(-1, { position_x: 2 });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(publishedEditGate.getState().phase).toBe('asking');
    // Discarding keeps the defaults as loaded.
    state().discardUnsyncedChanges(publishedEditGate.getState().undoDepth);
    expect(state().localWalls.map((w) => [w.id, w.position_x])).toEqual([[-1, 0], [-2, 3]]);
  });

  it('a 409 version_published on a default wall POST counts it as persisted: no gate, no revert, no toast', async () => {
    const toastSpy = vi.spyOn(toast, 'error');
    handler = (url, init) => (url === '/api/walls' && init.method === 'POST' ? published() : json({}));
    state().setLocalWalls(defaults());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(publishedEditGate.getState().phase).toBe('idle');
    expect(toastSpy).not.toHaveBeenCalled();
    expect(state().localWalls.map((w) => w.id)).toEqual([-1, -2]);
    expect(state().syncStatus).toBe('idle');
    // Not POSTed again.
    fetchMock.mockClear();
    move(1, 1); // ends up in the published branch (flag now known) …
    await settle();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/walls')).toHaveLength(0);
  });

  it('default walls held back while published are POSTed once the version is no longer published', async () => {
    state().setActiveVersionPublished(true);
    state().setLocalWalls(defaults());
    await settle();
    handler = (url, init) => (url === '/api/walls' && init.method === 'POST'
      ? json({ ...JSON.parse(String(init.body)), id: 100 + fetchMock.mock.calls.length })
      : json({}));
    state().setActiveVersionPublished(false);
    await settle();
    expect(fetchMock.mock.calls.filter(([url, init]) => url === '/api/walls' && init.method === 'POST')).toHaveLength(2);
  });
});
