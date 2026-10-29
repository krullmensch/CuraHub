import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '../../store/authStore';
import { flushAutoSync, isAutoSyncSettled, useEditorStore } from '../../store/editorStore';
import { publishedEditGate, type GateChoice } from '../publishedEditGate';
import { flushWallLayout, revertWallLayout } from '../wallEditor/layoutSync';
import { postVersionSnapshot } from './snapshotPayload';
import { refreshVersionStatus, useVersionStatus } from './versionStatus';
import { workingCopyComment } from './workingCopy';

export interface ResolveResult {
  ok: boolean;
  error?: string;
}

/** Applies the curator's choice from the "version is published" dialog. */
export async function resolvePublishedEdit(choice: GateChoice): Promise<ResolveResult> {
  const { phase, undoDepth } = publishedEditGate.getState();
  // Only an open question can be answered (a second click while resolving, a closed gate).
  if (phase !== 'asking') return { ok: false };
  publishedEditGate.beginResolve();

  if (choice === 'discard' || (typeof choice === 'object' && 'join' in choice)) {
    // The layout first: it reverts to what the server has for the version still loaded.
    revertWallLayout();
    // Discard and switch in one update, so auto-sync never sees the discarded lists in the
    // joined version (they would be POSTed into it).
    useEditorStore.getState().discardUnsyncedChanges(undoDepth, typeof choice === 'object' ? choice.join : undefined);
    publishedEditGate.finish();
    return { ok: true };
  }

  // Read at resolve time: the local state may have changed since the dialog opened.
  const { activeExhibitionId, activeVersionId } = useEditorStore.getState();
  const token = useAuthStore.getState().token;
  if (activeExhibitionId == null || activeVersionId == null || !token) {
    publishedEditGate.cancelResolve();
    return { ok: false, error: 'Arbeitskopie konnte nicht angelegt werden.' };
  }
  const isBranch = typeof choice === 'object';
  const publishedVersion = useVersionStatus.getState().versions.find((v) => v.id === activeVersionId);
  const publishedBranch = publishedVersion?.branch_name ?? 'main';
  const branchName = isBranch ? choice.branch : publishedBranch;
  const result = await postVersionSnapshot(activeExhibitionId, token, {
    comment: isBranch ? `Branch ${branchName}` : workingCopyComment(publishedVersion?.comment),
    branchName,
    sourceVersionId: activeVersionId,
  });
  if (!result.ok) {
    publishedEditGate.cancelResolve();
    return { ok: false, error: result.error };
  }
  useEditorStore.getState().setActiveVersion(result.id);
  publishedEditGate.finish();
  return { ok: true };
}

export const UNSAVED_BEFORE_PUBLISH = 'Es gibt noch ungespeicherte Änderungen – bitte kurz warten.';

/**
 * Publishes the active (working copy) version and refreshes the status. Sends what auto-sync and
 * the wall layout still hold first: the public must get the last edits, and a save landing after
 * publishing would be refused (409) and ask about the just-published version.
 */
export async function publishWorkingCopy(): Promise<boolean> {
  const { activeExhibitionId, activeVersionId } = useEditorStore.getState();
  const token = useAuthStore.getState().token;
  if (activeExhibitionId == null || activeVersionId == null || !token) return false;
  const [, layoutSaved] = await Promise.all([flushAutoSync(), flushWallLayout()]);
  const now = useEditorStore.getState();
  if (now.activeExhibitionId !== activeExhibitionId || now.activeVersionId !== activeVersionId) return false;
  if (!layoutSaved || !isAutoSyncSettled()) {
    toast.error(UNSAVED_BEFORE_PUBLISH);
    return false;
  }
  try {
    const res = await fetch(`/api/exhibitions/${activeExhibitionId}/versions/${activeVersionId}/publish`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    toast.error('Neu veröffentlichen fehlgeschlagen.');
    return false;
  }
  await refreshVersionStatus();
  toast.success('Neu veröffentlicht');
  return true;
}
