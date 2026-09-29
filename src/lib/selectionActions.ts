import { useEditorStore, type ArtworkInstanceData } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import type { WallEditorTarget } from './wallEditor/faces';
import { selectionOnFace } from './selectionFaces';
import { duplicateSelection } from './selectionOperations';

/** Duplicates the current selection (one undo step) and selects the copies. */
export function duplicateCurrentSelection(): void {
  const store = useEditorStore.getState();
  const result = duplicateSelection(store.localInstances, store.selectedInstanceIds, store.selectedInstanceId, store.localWalls);
  if (!result) return;
  store.commitLocalChange(result.instances);
  useEditorStore.getState().setInstanceSelection(result.copies);
}

/** Commits the result of a selection operation (lib/selectionOperations); null means nothing to do. */
export function commitSelectionOperation(next: ArtworkInstanceData[] | null): void {
  if (next) useEditorStore.getState().commitLocalChange(next);
}

/**
 * Opens a face in the 2D wall editor; the 3D selection's artworks on that face (plus `extra`,
 * e.g. a double-clicked artwork) become the editor's selection.
 */
export function openFaceWithSelection(target: WallEditorTarget, extra: number[] = []): void {
  const store = useEditorStore.getState();
  const onFace = selectionOnFace(target, store.localInstances, store.selectedInstanceIds, store.localWalls, useWallEditorView.getState().roomFaces);
  store.openWallEditor(target, [...new Set([...onFace, ...extra])]);
}
