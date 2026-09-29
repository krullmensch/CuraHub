import { useEditorStore, type ArtworkInstanceData } from '@/store/editorStore';
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
