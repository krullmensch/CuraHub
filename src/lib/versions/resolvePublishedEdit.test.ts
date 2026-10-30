import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const layout = vi.hoisted(() => ({ revert: vi.fn(), flush: vi.fn(async () => true) }));
vi.mock('../wallEditor/layoutSync', () => ({
  isWallLayoutLoaded: () => false,
  revertWallLayout: layout.revert,
  flushWallLayout: layout.flush,
}));

const sync = vi.hoisted(() => ({ flush: vi.fn(async () => {}), settled: vi.fn(() => true) }));
vi.mock('../../store/editorStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/editorStore')>()),
  flushAutoSync: sync.flush,
  isAutoSyncSettled: sync.settled,
}));

vi.mock('../../store/authStore', () => ({
  useAuthStore: { getState: () => ({ token: 't' }) },
}));

import { useEditorStore, type ArtworkInstanceData } from '../../store/editorStore';
import { publishedEditGate } from '../publishedEditGate';
import { toast } from '@/hooks/use-toast';
import { publishWorkingCopy, resolvePublishedEdit, UNSAVED_BEFORE_PUBLISH } from './resolvePublishedEdit';
import { useVersionStatus } from './versionStatus';

const inst = (x: number): ArtworkInstanceData => ({
  id: 1, assetId: 42, wallId: null,
  artwork: { asset: { path: '', width: 100, height: 100, dpi: 72, type: 'image' } },
  position_x: x, position_y: 1.5, position_z: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0,
  scale_x: 1, scale_y: 1, scale_z: 1,
} as ArtworkInstanceData);

const published = {
  id: 5, comment: 'Eröffnung', branch_name: 'main', parent_version_id: null, is_published: true,
  published_at: '2026-10-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z',
  creator: { id: 1, email: 'a@b.de' },
};

const fetchMock = vi.fn();
let discard: ReturnType<typeof vi.fn>;

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
}
const postedBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  layout.revert.mockReset();
  layout.flush.mockReset();
  layout.flush.mockImplementation(async () => true);
  sync.flush.mockReset();
  sync.flush.mockImplementation(async () => {});
  sync.settled.mockReset();
  sync.settled.mockImplementation(() => true);
  discard = vi.fn();
  useVersionStatus.setState({ versions: [published], workingCopyOf: null });
  useEditorStore.setState({
    activeExhibitionId: 3,
    activeVersionId: 5,
    activeVersionPublished: true,
    localWalls: [],
    localScaleFigures: [],
    localInstances: [inst(1)],
    discardUnsyncedChanges: discard as never,
  });
  publishedEditGate.reset();
  publishedEditGate.request(2);
});

afterEach(() => vi.unstubAllGlobals());

describe('resolvePublishedEdit', () => {
  it('workingCopy posts the local state at resolve time on the published branch and switches to the new version', async () => {
    useEditorStore.setState({ localInstances: [inst(7.5)] });
    respond(201, { id: 9 });
    const result = await resolvePublishedEdit('workingCopy');
    expect(result.ok).toBe(true);
    const body = postedBody();
    expect(body).toMatchObject({ comment: 'Arbeitskopie von „Eröffnung“', branch_name: 'main', sourceVersionId: 5 });
    expect(body.instances[0].position_x).toBe(7.5);
    expect(useEditorStore.getState().activeVersionId).toBe(9);
    expect(publishedEditGate.getState().phase).toBe('idle');
  });

  it('branch posts with the entered name', async () => {
    respond(201, { id: 10 });
    const result = await resolvePublishedEdit({ branch: 'Variante B' });
    expect(result.ok).toBe(true);
    expect(postedBody()).toMatchObject({ comment: 'Branch Variante B', branch_name: 'Variante B', sourceVersionId: 5 });
    expect(useEditorStore.getState().activeVersionId).toBe(10);
  });

  it('a failed POST keeps the gate asking, keeps local changes and returns the error', async () => {
    respond(500, {});
    const result = await resolvePublishedEdit('workingCopy');
    expect(result).toEqual({ ok: false, error: 'Arbeitskopie konnte nicht angelegt werden.' });
    expect(publishedEditGate.getState()).toEqual({ phase: 'asking', undoDepth: 2 });
    expect(discard).not.toHaveBeenCalled();
    expect(useEditorStore.getState().activeVersionId).toBe(5);

    respond(409, { error: 'Branch existiert bereits.' });
    const again = await resolvePublishedEdit({ branch: 'x' });
    expect(again).toEqual({ ok: false, error: 'Branch existiert bereits.' });
  });

  it('discard restores persisted state and closes the gate', async () => {
    const result = await resolvePublishedEdit('discard');
    expect(result.ok).toBe(true);
    expect(discard).toHaveBeenCalledWith(2, undefined);
    expect(layout.revert).toHaveBeenCalledTimes(1);
    expect(publishedEditGate.getState().phase).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('join reverts the layout, then discards and switches in one store update', async () => {
    const result = await resolvePublishedEdit({ join: 12 });
    expect(result.ok).toBe(true);
    expect(discard).toHaveBeenCalledWith(2, 12);
    expect(layout.revert).toHaveBeenCalledTimes(1);
    expect(layout.revert.mock.invocationCallOrder[0]).toBeLessThan(discard.mock.invocationCallOrder[0]);
    expect(publishedEditGate.getState().phase).toBe('idle');
  });

  it('does nothing unless the gate is asking (M1)', async () => {
    publishedEditGate.beginResolve(); // a first click is resolving
    expect(await resolvePublishedEdit('workingCopy')).toEqual({ ok: false });
    expect(await resolvePublishedEdit({ join: 12 })).toEqual({ ok: false });
    publishedEditGate.reset();
    expect(await resolvePublishedEdit('discard')).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    expect(layout.revert).not.toHaveBeenCalled();
  });

  it('a working copy of a version without comment is called „Arbeitskopie"', async () => {
    useVersionStatus.setState({ versions: [{ ...published, comment: null }] });
    respond(201, { id: 9 });
    await resolvePublishedEdit('workingCopy');
    expect(postedBody().comment).toBe('Arbeitskopie');
  });
});

describe('publishWorkingCopy', () => {
  it('patches publish on the active version and refreshes', async () => {
    useEditorStore.setState({ activeVersionId: 9, activeVersionPublished: false });
    respond(200, {});
    respond(200, []);
    expect(await publishWorkingCopy()).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/exhibitions/3/versions/9/publish');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
  });

  it('flushes auto-sync and the wall layout before the PATCH (I2)', async () => {
    useEditorStore.setState({ activeVersionId: 9, activeVersionPublished: false });
    let flushed = false;
    sync.flush.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      flushed = true;
    });
    fetchMock.mockImplementation(async (url: string) => {
      expect(flushed).toBe(true);
      expect(layout.flush).toHaveBeenCalled();
      return { ok: true, status: 200, json: async () => (url.endsWith('/publish') ? {} : []) };
    });
    expect(await publishWorkingCopy()).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/exhibitions/3/versions/9/publish');
  });

  it('refuses with a toast while something is still unsaved (I2)', async () => {
    const toastSpy = vi.spyOn(toast, 'error');
    useEditorStore.setState({ activeVersionId: 9, activeVersionPublished: false });
    sync.settled.mockImplementation(() => false);
    expect(await publishWorkingCopy()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(UNSAVED_BEFORE_PUBLISH);
    sync.settled.mockImplementation(() => true);
    layout.flush.mockImplementation(async () => false);
    expect(await publishWorkingCopy()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    toastSpy.mockRestore();
  });

  it('returns false on failure', async () => {
    respond(500, {});
    expect(await publishWorkingCopy()).toBe(false);
  });
});
