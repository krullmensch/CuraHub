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

interface DragState {
  isDragging: boolean;
  draggedAsset: { id: number; width: number; height: number; url: string } | null;
  dragPosition: { x: number; y: number } | null; // NDC coordinates (-1 to 1)
  validPlacement: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
  } | null;
}

interface EditorState {
  isPlacing: boolean;
  pendingArtwork: { id: number; width: number; height: number; url: string } | null;
  isDialogOpen: boolean;
  
  // Camera State
  plannerViewMode: PlannerViewMode;
  orbitCameraState: OrbitCameraState;
  firstPersonCameraState: FirstPersonCameraState;

  // Dragging State
  dragState: DragState;

  // View State
  showTraverses: boolean;
  
  // Data State
  instancesVersion: number;

  // Actions
  setDialogOpen: (isOpen: boolean) => void;
  startPlacement: (artwork: { id: number; width: number; height: number; url: string }) => void;
  setDragging: (isDragging: boolean, asset: { id: number; width: number; height: number; url: string } | null) => void;
  setDragPosition: (pos: { x: number; y: number } | null) => void;
  setValidPlacement: (placement: { position: [number, number, number]; rotation: [number, number, number]; scale: number } | null) => void; 
  triggerInstancesRefresh: () => void;
  cancelPlacement: () => void;
  completePlacement: () => void;
  setPlannerViewMode: (mode: PlannerViewMode) => void;
  toggleTraverses: () => void;
  updateOrbitCameraState: (state: Partial<OrbitCameraState>) => void;
  updateFirstPersonCameraState: (state: Partial<FirstPersonCameraState>) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  isPlacing: false,
  pendingArtwork: null,
  isDialogOpen: false,

  // Initial Camera State
  plannerViewMode: 'perspective',
  orbitCameraState: {
    position: [20, 20, 20], // High angle view
    target: [0, 0, 0],
    zoom: 40
  },
  firstPersonCameraState: {
    position: [0, 1.7, 5], // Eye level inside room
    rotation: [0, 0, 0]
  },

  dragState: {
    isDragging: false,
    draggedAsset: null,
    dragPosition: null,
    validPlacement: null,
  },

  instancesVersion: 0,
  showTraverses: true, // Default to visible

  setDialogOpen: (isOpen) => set({ isDialogOpen: isOpen }),
  startPlacement: (artwork) => set({ isPlacing: true, pendingArtwork: artwork }),
  cancelPlacement: () => set({ isPlacing: false, pendingArtwork: null }),
  completePlacement: () => set({ isPlacing: false, pendingArtwork: null }),
  
  setPlannerViewMode: (mode) => set({ plannerViewMode: mode }),
  toggleTraverses: () => set((state) => ({ showTraverses: !state.showTraverses })),
  updateOrbitCameraState: (state) => set((prev) => ({ 
    orbitCameraState: { ...prev.orbitCameraState, ...state } 
  })),
  updateFirstPersonCameraState: (state) => set((prev) => ({ 
    firstPersonCameraState: { ...prev.firstPersonCameraState, ...state } 
  })),

  setDragging: (isDragging, asset) => set((state) => ({ 
      dragState: { ...state.dragState, isDragging, draggedAsset: asset } 
  })),
  setDragPosition: (pos) => set((state) => ({ 
      dragState: { ...state.dragState, dragPosition: pos } 
  })),
  setValidPlacement: (placement) => set((state) => ({
      dragState: { ...state.dragState, validPlacement: placement }
  })),
  triggerInstancesRefresh: () => set((state) => ({ instancesVersion: state.instancesVersion + 1 })),
}));
