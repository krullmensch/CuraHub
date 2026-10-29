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
import { flushAutoSync, isAutoSyncSettled, useEditorStore, type ArtworkInstanceData, type ModularWallData, type ScaleFigureData } from './editorStore';
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

describe('published-version review fixes', () => {
  it('a 409 version_published that arrives after switching versions leaves the new version alone', async () => {
    let answer: (res: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { answer = resolve; }));
    move(1, 5);
    await new Promise((resolve) => setTimeout(resolve, 170)); // the batch for VERSION is in flight
    expect(fetchMock).toHaveBeenCalledTimes(1);
    state().setActiveVersion(VERSION + 1);
    answer(published());
    await settle();
    expect(state().activeVersionPublished).toBe(false);
    expect(publishedEditGate.getState().phase).toBe('idle');
    useEditorStore.setState({ activeVersionId: VERSION });
  });

  it('at the undo cap, discarding drops exactly the held steps', async () => {
    const full = Array.from({ length: 50 }, () => state().localInstances);
    useEditorStore.setState({ pastInstances: full });
    move(1, 3); // saved; shifts the full stack
    await settle();
    fetchMock.mockClear();
    state().setActiveVersionPublished(true);
    move(1, 5);
    move(2, 6);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    const { undoDepth } = publishedEditGate.getState();
    expect(undoDepth).toBe(48);
    state().discardUnsyncedChanges(undoDepth);
    expect(state().pastInstances).toHaveLength(48);
    expect(state().localInstances.map((i) => i.position_x)).toEqual([3, 0]);
    state().undo();
    expect(state().localInstances.map((i) => i.position_x)).toEqual([0, 0]);
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

describe('auto-sync across version switches (C1)', () => {
  const posts = () => fetchMock.mock.calls.filter(([, init]) => init.method === 'POST');

  it('discarding and joining a working copy does not POST the previous version\'s rows into it', async () => {
    state().setActiveVersionPublished(true);
    move(1, 5);
    await settle();
    expect(publishedEditGate.getState().phase).toBe('asking');
    state().discardUnsyncedChanges(publishedEditGate.getState().undoDepth, 12);
    expect(state().activeVersionId).toBe(12);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    // The join version's data arrives: still nothing to send.
    state().setLocalInstances([inst(20)]);
    state().setLocalWalls([wall(21, 'Wall A')]);
    state().setLocalScaleFigures([]);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a new working copy whose walls load before its instances does not duplicate the artworks', async () => {
    state().setActiveVersion(9);
    state().setLocalWalls([wall(30, 'Wall A')]);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    state().setLocalScaleFigures([figure(31)]);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    state().setLocalInstances([inst(32), inst(33)]);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    // Edits are synced again once everything is loaded, into the new version.
    move(32, 4);
    await settle();
    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual(['PATCH /api/instances/32']);
  });

  it('a version without walls or figures counts as loaded (empty lists, default walls)', async () => {
    handler = (url, init) => (url === '/api/walls' && init.method === 'POST'
      ? json({ ...JSON.parse(String(init.body)), id: 200 + fetchMock.mock.calls.length })
      : json({}));
    state().setActiveVersion(13);
    state().setLocalInstances([]);
    state().setLocalScaleFigures([]);
    state().setLocalWalls([wall(-1, 'Wall A', 0, true)]);
    await settle();
    // Only the default wall, POSTed into version 13.
    expect(posts()).toHaveLength(1);
    expect(JSON.parse(String(posts()[0][1].body)).versionId).toBe(13);
  });

  it('cancels the pending debounce of the previous version on a switch', async () => {
    move(1, 5);
    state().setActiveVersion(14);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a batch that finishes after a switch leaves the new version\'s snapshots alone', async () => {
    let release!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(json({ id: 1 })); }));
    move(1, 5);
    await settle(); // PATCH of instance 1 (version 42) is in flight
    expect(fetchMock).toHaveBeenCalledTimes(1);
    state().setActiveVersion(15);
    state().setLocalInstances([inst(40)]);
    state().setLocalWalls([wall(41, 'Wall A')]);
    state().setLocalScaleFigures([]);
    release();
    await settle();
    await settle();
    // Only the old version's PATCH: no DELETE of its rows, no POST of version 15's rows.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    // Any change triggers a diff: version 15's snapshots must still be its loaded data.
    state().commitLocalChange([...state().localInstances]);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('flushAutoSync / isAutoSyncSettled (I2)', () => {
  it('sends a pending change at once and reports settled afterwards', async () => {
    move(1, 5);
    expect(isAutoSyncSettled()).toBe(false);
    await flushAutoSync();
    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual(['PATCH /api/instances/1']);
    expect(isAutoSyncSettled()).toBe(true);
  });

  it('reports not settled when the sync ends in error', async () => {
    vi.spyOn(toast, 'error');
    handler = () => json({}, 400); // not retried by fetchWithRetry
    move(1, 5);
    await flushAutoSync();
    expect(state().syncStatus).toBe('error');
    expect(isAutoSyncSettled()).toBe(false);
    // Recover, which also cancels the automatic retry.
    handler = () => json({});
    await flushAutoSync();
    expect(isAutoSyncSettled()).toBe(true);
  });
});
