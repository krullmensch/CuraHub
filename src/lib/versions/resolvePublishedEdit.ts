import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '../../store/authStore';
import { useEditorStore } from '../../store/editorStore';
import { publishedEditGate, type GateChoice } from '../publishedEditGate';
import { revertWallLayout } from '../wallEditor/layoutSync';
import { postVersionSnapshot } from './snapshotPayload';
import { refreshVersionStatus, useVersionStatus } from './versionStatus';

export interface ResolveResult {
  ok: boolean;
  error?: string;
}

/** Applies the curator's choice from the "version is published" dialog. */
export async function resolvePublishedEdit(choice: GateChoice): Promise<ResolveResult> {
  const { undoDepth } = publishedEditGate.getState();
  publishedEditGate.beginResolve();

  if (choice === 'discard' || (typeof choice === 'object' && 'join' in choice)) {
    useEditorStore.getState().discardUnsyncedChanges(undoDepth);
    revertWallLayout();
    if (typeof choice === 'object') useEditorStore.getState().setActiveVersion(choice.join);
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
  const publishedBranch =
    useVersionStatus.getState().versions.find((v) => v.id === activeVersionId)?.branch_name ?? 'main';
  const branchName = isBranch ? choice.branch : publishedBranch;
  const result = await postVersionSnapshot(activeExhibitionId, token, {
    comment: isBranch ? `Branch ${branchName}` : 'Arbeitskopie',
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

/** Publishes the active (working copy) version and refreshes the status. */
export async function publishWorkingCopy(): Promise<boolean> {
  const { activeExhibitionId, activeVersionId } = useEditorStore.getState();
  const token = useAuthStore.getState().token;
  if (activeExhibitionId == null || activeVersionId == null || !token) return false;
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
