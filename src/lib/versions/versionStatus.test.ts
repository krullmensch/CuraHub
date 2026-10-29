import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../store/editorStore';
import { useLiveStore } from '../../store/liveStore';
import { publishedEditGate } from '../publishedEditGate';
import { startVersionStatus, useVersionStatus } from './versionStatus';
import type { VersionSummary } from './workingCopy';

function v(id: number, over: Partial<VersionSummary> = {}): VersionSummary {
  return {
    id, branch_name: 'main', parent_version_id: null, is_published: false, published_at: null,
    created_at: '2026-01-01T00:00:00Z', creator: { id: 1, email: 'a@b.c' }, ...over,
  };
}

vi.mock('../../store/authStore', () => ({
  useAuthStore: { getState: () => ({ token: 't' }) },
}));

const flush = () => new Promise((r) => setTimeout(r, 0));
let stop: () => void;
let fetchMock: ReturnType<typeof vi.fn>;

function respond(list: VersionSummary[]) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => list });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  publishedEditGate.reset();
  useEditorStore.setState({ activeExhibitionId: null, activeVersionId: null, activeVersionPublished: false });
  useVersionStatus.setState({ versions: [], workingCopyOf: null });
});
afterEach(() => {
  stop?.();
  vi.unstubAllGlobals();
});

describe('versionStatus', () => {
  it('sets activeVersionPublished from the fetched list', async () => {
    respond([v(1, { is_published: true, published_at: '2026-01-02T00:00:00Z' })]);
    stop = startVersionStatus();
    useEditorStore.setState({ activeExhibitionId: 5, activeVersionId: 1 });
    await flush();
    expect(useEditorStore.getState().activeVersionPublished).toBe(true);
  });

  it('drops a response that arrives after the active version changed', async () => {
    const pub = { is_published: true, published_at: '2026-01-02T00:00:00Z' };
    let resolveFirst!: (x: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [v(1, pub), v(2)] });
    stop = startVersionStatus();
    useEditorStore.setState({ activeExhibitionId: 5, activeVersionId: 1 });
    useEditorStore.setState({ activeVersionId: 2 });
    await flush();
    resolveFirst({ ok: true, json: async () => [v(1, pub), v(2, pub)] });
    await flush();
    expect(useEditorStore.getState().activeVersionPublished).toBe(false);
  });

  it('applies only the latest of overlapping fetches for the same version (T4)', async () => {
    const pub = { is_published: true, published_at: '2026-01-02T00:00:00Z' };
    let resolveFirst!: (x: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [v(1)] });
    stop = startVersionStatus();
    useEditorStore.setState({ activeExhibitionId: 5, activeVersionId: 1 });
    useLiveStore.setState({ versionsRevision: useLiveStore.getState().versionsRevision + 1 });
    await flush();
    expect(useEditorStore.getState().activeVersionPublished).toBe(false);
    // The older response (still published) arrives last.
    resolveFirst({ ok: true, json: async () => [v(1, pub)] });
    await flush();
    expect(useEditorStore.getState().activeVersionPublished).toBe(false);
  });

  it('resets the gate when the active version changes', () => {
    respond([]);
    stop = startVersionStatus();
    useEditorStore.setState({ activeExhibitionId: 5, activeVersionId: 1 });
    publishedEditGate.request(0);
    useEditorStore.getState().setActiveVersion(2);
    expect(publishedEditGate.getState().phase).toBe('idle');
  });

  it('refetches when versionsRevision increments', async () => {
    respond([v(1)]);
    stop = startVersionStatus();
    useEditorStore.setState({ activeExhibitionId: 5, activeVersionId: 1 });
    await flush();
    const before = fetchMock.mock.calls.length;
    useLiveStore.setState({ versionsRevision: useLiveStore.getState().versionsRevision + 1 });
    await flush();
    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });

  it('closes the gate when the active version is no longer published', async () => {
    respond([v(1, { is_published: true, published_at: '2026-01-02T00:00:00Z' })]);
    stop = startVersionStatus();
    useEditorStore.setState({ activeExhibitionId: 5, activeVersionId: 1 });
    await flush();
    publishedEditGate.request(0);
    expect(publishedEditGate.getState().phase).toBe('asking');
    respond([v(1)]);
    useLiveStore.setState({ versionsRevision: useLiveStore.getState().versionsRevision + 1 });
    await flush();
    expect(useEditorStore.getState().activeVersionPublished).toBe(false);
    expect(publishedEditGate.getState().phase).toBe('idle');
  });
});
