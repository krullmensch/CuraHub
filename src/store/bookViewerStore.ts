import { create } from 'zustand';

/**
 * The open book (2D flip viewer) and the book under the cursor/crosshair. Separate from
 * editorStore so the public viewer, which has no editor state, can use it too.
 */

export interface OpenBook {
  assetId: number;
  title: string;
  pageCount: number;
  /** Opened in the public viewer (no editor view modes). */
  publicView: boolean;
}

interface BookViewerState {
  book: OpenBook | null;
  /** The pointer was locked (first person) when the book opened. */
  resumeFirstPerson: boolean;
  /** Orbit view: book under the mouse (hover outline). */
  hoveredBookId: number | null;
  /** First person: book under the crosshair within BOOK_OPEN_DISTANCE. */
  bookInReachId: number | null;
  setOpen: (book: OpenBook, resumeFirstPerson: boolean) => void;
  clear: () => void;
  setHoveredBook: (id: number | null) => void;
  setBookInReach: (id: number | null) => void;
}

export const useBookViewerStore = create<BookViewerState>((set) => ({
  book: null,
  resumeFirstPerson: false,
  hoveredBookId: null,
  bookInReachId: null,
  setOpen: (book, resumeFirstPerson) => set({ book, resumeFirstPerson }),
  clear: () => set({ book: null, resumeFirstPerson: false }),
  setHoveredBook: (id) => set((s) => (s.hoveredBookId === id ? s : { hoveredBookId: id })),
  setBookInReach: (id) => set((s) => (s.bookInReachId === id ? s : { bookInReachId: id })),
}));
