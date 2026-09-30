import { useBookViewerStore, type OpenBook } from '@/store/bookViewerStore';
import { useEditorStore, type ArtworkInstanceData } from '@/store/editorStore';
import { displayArtworkTitle } from '@/lib/artworkTitle';
import type * as THREE from 'three';
import { BOOK_OPEN_DISTANCE } from './geometry';
import { canvasBridge } from './canvasBridge';

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
    const canvas = canvasBridge.get() ?? document.querySelector('canvas');
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

/** Opens the book of a placed instance (editor double-click, „Buch öffnen"). */
export function openBookForInstance(inst: ArtworkInstanceData, publicView: boolean): void {
  const assetId = inst.artwork.asset.id ?? inst.assetId;
  if (!assetId) return;
  openBook({
    assetId,
    title: displayArtworkTitle(inst.artwork.title ?? '') || 'Buch',
    pageCount: inst.artwork.asset.metadata?.pageCount ?? 0,
    publicView,
  });
}

/** First person: the crosshair rests on a book's hit box, close enough to open it. */
export function bookInReach(hit: { object: THREE.Object3D; distance: number } | null, readable: boolean): boolean {
  return !!hit && readable && hit.object.userData.bookHitProxy === true && hit.distance <= BOOK_OPEN_DISTANCE;
}

/** Click while walking (pointer locked) opens the book under the crosshair. */
export function installFirstPersonBookClick(getInstance: (id: number) => ArtworkInstanceData | undefined, publicView: boolean): () => void {
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !document.pointerLockElement) return;
    const id = useBookViewerStore.getState().bookInReachId;
    const inst = id !== null ? getInstance(id) : undefined;
    if (!inst) return;
    e.preventDefault();
    openBookForInstance(inst, publicView);
  };
  document.addEventListener('mousedown', onMouseDown);
  return () => document.removeEventListener('mousedown', onMouseDown);
}
