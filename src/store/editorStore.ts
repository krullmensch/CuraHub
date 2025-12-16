import { create } from 'zustand';

interface EditorState {
  isPlacing: boolean;
  pendingArtwork: { id: number; width: number; height: number; url: string } | null;
  isDialogOpen: boolean;
  setDialogOpen: (isOpen: boolean) => void;
  startPlacement: (artwork: { id: number; width: number; height: number; url: string }) => void;
  cancelPlacement: () => void;
  completePlacement: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  isPlacing: false,
  pendingArtwork: null,
  isDialogOpen: false,
  setDialogOpen: (isOpen) => set({ isDialogOpen: isOpen }),
  startPlacement: (artwork) => set({ isPlacing: true, pendingArtwork: artwork }),
  cancelPlacement: () => set({ isPlacing: false, pendingArtwork: null }),
  completePlacement: () => set({ isPlacing: false, pendingArtwork: null }),
}));
