import { useEditorStore } from '@/store/editorStore';
import { useBookViewerStore } from '@/store/bookViewerStore';

/**
 * One answer to „may the 3D controls move?": no while a dialog (metadata etc.) or the book viewer
 * is open. Player, PointerLockControls, OrbitControls and the editor's keys all ask this.
 */
export function useControlsLocked(): boolean {
  const dialogOpen = useEditorStore((s) => s.isDialogOpen);
  const bookOpen = useBookViewerStore((s) => s.book !== null);
  return dialogOpen || bookOpen;
}

export function isControlsLocked(): boolean {
  return useEditorStore.getState().isDialogOpen || useBookViewerStore.getState().book !== null;
}
