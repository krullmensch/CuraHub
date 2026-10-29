import { useEditorStore } from '@/store/editorStore';
import { useBookViewerStore } from '@/store/bookViewerStore';
import { useTourStore } from '@/store/tourStore';

/**
 * One answer to „may the 3D controls move?": no while a dialog (metadata etc.), the book viewer or
 * the onboarding tour is open. Player, PointerLockControls, OrbitControls and the editor's keys all ask this.
 */
export function useControlsLocked(): boolean {
  const dialogOpen = useEditorStore((s) => s.isDialogOpen);
  const bookOpen = useBookViewerStore((s) => s.book !== null);
  const tourActive = useTourStore((s) => s.active);
  return dialogOpen || bookOpen || tourActive;
}

export function isControlsLocked(): boolean {
  return (
    useEditorStore.getState().isDialogOpen ||
    useBookViewerStore.getState().book !== null ||
    useTourStore.getState().active
  );
}
