import { create } from 'zustand';

export type PlannerViewMode = 'orthographic' | 'perspective' | 'firstPerson';

interface OrbitCameraState {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
}

interface FirstPersonCameraState {
  position: [number, number, number];
  rotation: [number, number, number];
}

interface EditorState {
  isPlacing: boolean;
  pendingArtwork: { id: number; width: number; height: number; url: string } | null;
  isDialogOpen: boolean;
  
  // Camera State
  plannerViewMode: PlannerViewMode;
  orbitCameraState: OrbitCameraState;
  firstPersonCameraState: FirstPersonCameraState;

  // Actions
  setDialogOpen: (isOpen: boolean) => void;
  startPlacement: (artwork: { id: number; width: number; height: number; url: string }) => void;
  cancelPlacement: () => void;
  completePlacement: () => void;
  setPlannerViewMode: (mode: PlannerViewMode) => void;
  updateOrbitCameraState: (state: Partial<OrbitCameraState>) => void;
  updateFirstPersonCameraState: (state: Partial<FirstPersonCameraState>) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  isPlacing: false,
  pendingArtwork: null,
  isDialogOpen: false,

  // Initial Camera State
  plannerViewMode: 'orthographic',
  orbitCameraState: {
    position: [20, 20, 20], // High angle view
    target: [0, 0, 0],
    zoom: 40
  },
  firstPersonCameraState: {
    position: [0, 1.7, 5], // Eye level inside room
    rotation: [0, 0, 0]
  },

  setDialogOpen: (isOpen) => set({ isDialogOpen: isOpen }),
  startPlacement: (artwork) => set({ isPlacing: true, pendingArtwork: artwork }),
  cancelPlacement: () => set({ isPlacing: false, pendingArtwork: null }),
  completePlacement: () => set({ isPlacing: false, pendingArtwork: null }),
  
  setPlannerViewMode: (mode) => set({ plannerViewMode: mode }),
  updateOrbitCameraState: (state) => set((prev) => ({ 
    orbitCameraState: { ...prev.orbitCameraState, ...state } 
  })),
  updateFirstPersonCameraState: (state) => set((prev) => ({ 
    firstPersonCameraState: { ...prev.firstPersonCameraState, ...state } 
  })),
}));
