import { useBookViewerStore, type OpenBook } from '@/store/bookViewerStore';
import { useEditorStore } from '@/store/editorStore';

export interface PointerEnv {
  pointerLocked(): boolean;
  exitPointerLock(): void;
  requestPointerLock(): void;
  leaveFirstPerson(): void;
}

export const domPointerEnv: PointerEnv = {
  pointerLocked: () => !!document.pointerLockElement,
  exitPointerLock: () => document.exitPointerLock(),
  requestPointerLock: () => {
    const canvas = document.querySelector('canvas');
    // Chrome returns a promise that rejects without a user gesture; ignore that case.
    const result = canvas?.requestPointerLock() as unknown as Promise<void> | undefined;
    result?.catch?.(() => undefined);
  },
  leaveFirstPerson: () => {
    if (useEditorStore.getState().plannerViewMode === 'firstPerson') useEditorStore.getState().setPlannerViewMode('perspective');
  },
};

/**
 * Store first, pointer second: releasing the pointer lock fires PlannerCameraSystem's unlock
 * handler, which leaves first person unless the controls are locked.
 */
export function openBook(book: OpenBook, env: PointerEnv = domPointerEnv): void {
  const locked = env.pointerLocked();
  useBookViewerStore.getState().setOpen(book, locked);
  if (locked) env.exitPointerLock();
}

export function closeBook(reason: 'button' | 'escape', env: PointerEnv = domPointerEnv): void {
  const { book, resumeFirstPerson } = useBookViewerStore.getState();
  if (!book) return;
  useBookViewerStore.getState().clear();
  if (!resumeFirstPerson) return;
  if (reason === 'button') env.requestPointerLock();
  else if (!book.publicView) env.leaveFirstPerson();
}
