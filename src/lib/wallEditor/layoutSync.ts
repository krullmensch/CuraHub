import { gooeyToast } from 'goey-toast';
import { useAuthStore } from '@/store/authStore';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import { onWallEvent } from '@/lib/wallEvents';
import { liveSessionHeaders } from '@/lib/live/session';
import { DEFAULT_HANGING_HEIGHT, parseWallLayout, serializeGuides, type WallLayout } from './guides';

/** Hanging height and guides are saved this long after the last change. */
const SAVE_DEBOUNCE_MS = 300;
/** At most one "could not save" toast in this interval. */
const ERROR_TOAST_INTERVAL_MS = 10_000;

const layoutUrl = (exhibitionId: number, versionId: number) =>
    `/api/exhibitions/${exhibitionId}/versions/${versionId}/wall-layout`;

const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${useAuthStore.getState().token ?? ''}`,
    // The live channel tells the other tabs; this one does not need its own change back.
    ...liveSessionHeaders(),
});

/** Version whose layout the view store holds; changes are only saved for it. */
let loadedVersionId: number | null = null;

/** Set while a sync runs: takes a layout another tab saved. */
let remoteApply: ((versionId: number, raw: unknown) => void) | null = null;

/**
 * Hanging height and guides another tab saved (live channel). Taken over unless this tab has a
 * change of its own waiting to be saved — that one is sent next and wins, like before.
 */
export function applyRemoteWallLayout(versionId: number, raw: unknown): void {
    remoteApply?.(versionId, raw);
}

/** True once the stored layout of `versionId` is in the view store (not while loading, not after a failed load). */
export function isWallLayoutLoaded(versionId: number | null): boolean {
    return versionId != null && versionId === loadedVersionId;
}

/**
 * Keeps the 2D wall editor's hanging height and ruler guides in sync with the active exhibition
 * version: loads them whenever the version changes and PATCHes the full state (debounced) after
 * each change. It only writes — it never dispatches editor actions (Bug 1 in CLAUDE.md).
 * Returns a cleanup that sends a waiting change and unsubscribes.
 */
export function startWallLayoutSync(): () => void {
    /** Set while a loaded layout is written into the store, so loading doesn't save. */
    let applying = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** Pending PATCH; called with `keepalive` to flush it on page unload. */
    let pending: ((keepalive: boolean) => void) | null = null;
    let queue: Promise<void> = Promise.resolve();
    let lastErrorToast = 0;

    const errorToast = (title: string, description: string) => {
        const now = Date.now();
        if (now - lastErrorToast > ERROR_TOAST_INTERVAL_MS) {
            lastErrorToast = now;
            gooeyToast.error(title, { description });
        }
    };

    const apply = (layout: WallLayout) => {
        applying = true;
        try {
            useWallEditorView.getState().loadWallLayout(layout);
        } finally {
            applying = false;
        }
    };

    const load = async (exhibitionId: number, versionId: number) => {
        loadedVersionId = null;
        apply({ hangingHeight: DEFAULT_HANGING_HEIGHT, guides: {} });
        if (!useAuthStore.getState().token) return;
        // Wait for any save of the previously active version to land first, so switching
        // A → B → A can't load A's layout before A's own pending PATCH has been sent.
        await queue;
        if (stopped || useEditorStore.getState().activeVersionId !== versionId) return;
        try {
            const res = await fetch(layoutUrl(exhibitionId, versionId), { headers: authHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const layout = parseWallLayout(await res.json());
            // The sync was torn down, or the version changed again while loading.
            if (stopped || useEditorStore.getState().activeVersionId !== versionId) return;
            apply(layout);
            loadedVersionId = versionId;
        } catch (err) {
            // Without the stored layout nothing is saved, so it can't be overwritten.
            console.warn('[WallLayout] Failed to load hanging height and guides:', err);
            errorToast('Hängehöhe/Hilfslinien konnten nicht geladen werden', 'Änderungen daran werden erst nach erneutem Laden gespeichert.');
        }
    };

    const send = (exhibitionId: number, versionId: number, keepalive = false) => {
        const view = useWallEditorView.getState();
        const body = JSON.stringify({ hangingHeight: view.hangingHeight, guides: serializeGuides(view.guidesByFace) });
        queue = queue.then(async () => {
            try {
                const res = await fetch(layoutUrl(exhibitionId, versionId), { method: 'PATCH', headers: authHeaders(), body, keepalive });
                // No write access or the version is gone: keep the changes local, quietly.
                if (res.status === 401 || res.status === 403 || res.status === 404) return;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
            } catch (err) {
                console.error('[WallLayout] Failed to save hanging height and guides:', err);
                errorToast('Hängehöhe/Hilfslinien konnten nicht gespeichert werden', 'Die nächste Änderung versucht es erneut.');
            }
        });
    };

    const flush = (keepalive = false) => {
        clearTimeout(timer);
        timer = undefined;
        const run = pending;
        pending = null;
        run?.(keepalive);
    };

    const schedule = () => {
        const { activeExhibitionId, activeVersionId } = useEditorStore.getState();
        if (activeExhibitionId == null || activeVersionId == null || activeVersionId !== loadedVersionId) return;
        pending = (keepalive) => send(activeExhibitionId, activeVersionId, keepalive);
        clearTimeout(timer);
        timer = setTimeout(() => flush(), SAVE_DEBOUNCE_MS);
    };

    const unsubscribeView = useWallEditorView.subscribe((state, prev) => {
        if (applying) return;
        if (state.hangingHeight !== prev.hangingHeight || state.guidesByFace !== prev.guidesByFace) schedule();
    });

    const unsubscribeEditor = useEditorStore.subscribe((state, prev) => {
        if (state.activeVersionId === prev.activeVersionId && state.activeExhibitionId === prev.activeExhibitionId) return;
        // A change still waiting belongs to the previous version (the store still holds its layout).
        flush();
        if (state.activeExhibitionId != null && state.activeVersionId != null) {
            void load(state.activeExhibitionId, state.activeVersionId);
        } else {
            loadedVersionId = null;
        }
    });

    // A failed load only retries automatically once the wall editor is (re)opened.
    const unsubscribeWallEditorOpen = useEditorStore.subscribe((state, prev) => {
        if (state.wallEditor === null || prev.wallEditor !== null) return;
        const { activeExhibitionId, activeVersionId } = state;
        if (activeExhibitionId != null && activeVersionId != null && loadedVersionId !== activeVersionId) {
            void load(activeExhibitionId, activeVersionId);
        }
    });

    const unsubscribeWalls = onWallEvent((event) => {
        const view = useWallEditorView.getState();
        if (event.type === 'replaced') view.renameWallGuides(event.from, event.to);
        else view.dropWallGuides(event.id);
    });

    remoteApply = (versionId, raw) => {
        if (stopped || pending || versionId !== loadedVersionId) return;
        apply(parseWallLayout(raw));
    };

    // Best-effort save when the tab is being hidden/closed/navigated away from.
    const onPageHide = () => flush(true);
    window.addEventListener('pagehide', onPageHide);

    const { activeExhibitionId, activeVersionId } = useEditorStore.getState();
    if (activeExhibitionId != null && activeVersionId != null) void load(activeExhibitionId, activeVersionId);

    return () => {
        flush();
        stopped = true;
        loadedVersionId = null;
        remoteApply = null;
        unsubscribeView();
        unsubscribeEditor();
        unsubscribeWallEditorOpen();
        unsubscribeWalls();
        window.removeEventListener('pagehide', onPageHide);
    };
}
