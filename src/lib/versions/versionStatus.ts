import { create } from 'zustand';
import { useAuthStore } from '../../store/authStore';
import { useEditorStore } from '../../store/editorStore';
import { useLiveStore } from '../../store/liveStore';
import { publishedEditGate } from '../publishedEditGate';
import { workingCopyParent, type VersionSummary } from './workingCopy';

interface VersionStatusState {
  versions: VersionSummary[];
  /** The published version the active one is the open working copy of, or null. */
  workingCopyOf: VersionSummary | null;
}

export const useVersionStatus = create<VersionStatusState>()(() => ({
  versions: [],
  workingCopyOf: null,
}));

/** Fetches the active exhibition's versions and derives "published" / "working copy of". */
export async function refreshVersionStatus(): Promise<void> {
  const { activeExhibitionId, activeVersionId } = useEditorStore.getState();
  if (activeExhibitionId == null || activeVersionId == null) {
    useVersionStatus.setState({ versions: [], workingCopyOf: null });
    return;
  }
  const token = useAuthStore.getState().token;
  try {
    const res = await fetch(`/api/exhibitions/${activeExhibitionId}/versions`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const versions = (await res.json()) as VersionSummary[];
    const now = useEditorStore.getState();
    if (now.activeExhibitionId !== activeExhibitionId || now.activeVersionId !== activeVersionId) return;
    const published = versions.find((x) => x.id === activeVersionId)?.is_published ?? false;
    if (!published && now.activeVersionPublished && publishedEditGate.getState().phase !== 'idle') {
      publishedEditGate.reset();
    }
    useVersionStatus.setState({ versions, workingCopyOf: workingCopyParent(versions, activeVersionId) });
    now.setActiveVersionPublished(published);
  } catch (err) {
    console.warn('Versionsstatus konnte nicht geladen werden', err);
  }
}

/** Keeps the status in step with the active version and with other tabs' version changes. */
export function startVersionStatus(): () => void {
  const unsubEditor = useEditorStore.subscribe((state, prev) => {
    if (state.activeVersionId !== prev.activeVersionId) publishedEditGate.reset();
    if (
      state.activeExhibitionId !== prev.activeExhibitionId ||
      state.activeVersionId !== prev.activeVersionId
    ) {
      void refreshVersionStatus();
    }
  });
  const unsubLive = useLiveStore.subscribe((state, prev) => {
    if (state.versionsRevision !== prev.versionsRevision) void refreshVersionStatus();
  });
  if (useEditorStore.getState().activeExhibitionId != null) void refreshVersionStatus();
  return () => {
    unsubEditor();
    unsubLive();
  };
}
