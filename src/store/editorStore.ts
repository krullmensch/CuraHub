import { create } from 'zustand';

export type PlannerViewMode = 'orthographic' | 'perspective' | 'firstPerson';
export type TransformMode = 'translate' | 'rotate' | 'scale';

export interface ArtworkInstanceData {
    id: number;
    artworkId?: number;
    assetId?: number;
    artwork: {
        id?: number;
        asset: {
            path: string;
            width: number;
            height: number;
            dpi: number | null;
        }
    };
    position_x: number;
    position_y: number;
    position_z: number;
    rotation_x: number;
    rotation_y: number;
    rotation_z: number;
    scale_x: number;
    scale_y: number;
    scale_z: number;
}

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
  draggedAsset: { id: number; type: 'asset' | 'artwork'; width: number; height: number; dpi: number; url: string } | null;
  dragPosition: { x: number; y: number } | null; // NDC coordinates (-1 to 1)
  validPlacement: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
  } | null;
}

interface EditorState {
  isPlacing: boolean;
  pendingArtwork: { id: number; type: 'asset' | 'artwork'; width: number; height: number; url: string } | null;
  isDialogOpen: boolean;
  
  // Camera State
  plannerViewMode: PlannerViewMode;
  orbitCameraState: OrbitCameraState;
  firstPersonCameraState: FirstPersonCameraState;

  // Dragging State
  dragState: DragState;

  // Selection & Transform State (Phase 4.2)
  selectedInstanceId: number | null;
  transformMode: TransformMode;
  isTransforming: boolean;
  liveTransform: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } } | null;
  focusTarget: { target: [number, number, number]; isHoming: boolean } | null;

  // UI State
  rightSidebarOpen: boolean;

  // View State
  showTraverses: boolean;
  
  // Data State
  instancesVersion: number;

  // Phase 5: Project & Version State
  activeProjectId: number | null;
  activeProjectName: string | null;
  activeExhibitionId: number | null;
  activeVersionId: number | null;

  // Phase 6: Local State & Undo/Redo
  localInstances: ArtworkInstanceData[];
  pastInstances: ArtworkInstanceData[][];
  futureInstances: ArtworkInstanceData[][];
  hasUnsavedChanges: boolean;

  // Actions
  setDialogOpen: (isOpen: boolean) => void;
  startPlacement: (artwork: { id: number; type: 'asset' | 'artwork'; width: number; height: number; url: string }) => void;
  setDragging: (isDragging: boolean, asset: { id: number; type: 'asset' | 'artwork'; width: number; height: number; dpi: number; url: string } | null) => void;
  setDragPosition: (pos: { x: number; y: number } | null) => void;
  setValidPlacement: (placement: { position: [number, number, number]; rotation: [number, number, number]; scale: number } | null) => void; 
  triggerInstancesRefresh: () => void;
  cancelPlacement: () => void;
  completePlacement: () => void;
  setPlannerViewMode: (mode: PlannerViewMode) => void;
  toggleTraverses: () => void;
  updateOrbitCameraState: (state: Partial<OrbitCameraState>) => void;
  updateFirstPersonCameraState: (state: Partial<FirstPersonCameraState>) => void;
  // Phase 4.2 actions
  selectInstance: (id: number | null) => void;
  setTransformMode: (mode: TransformMode) => void;
  setIsTransforming: (v: boolean) => void;
  setLiveTransform: (t: EditorState['liveTransform']) => void;
  toggleRightSidebar: () => void;
  setFocusTarget: (focus: { target: [number, number, number]; isHoming: boolean } | null) => void;
  // Phase 5 actions
  setActiveProject: (id: number | null, name: string | null, exhibitionId: number | null, versionId: number | null) => void;
  setActiveVersion: (id: number | null) => void;

  // Phase 6 Actions
  setLocalInstances: (instances: ArtworkInstanceData[]) => void;
  commitLocalChange: (newInstances: ArtworkInstanceData[]) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
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

  // Phase 4.2 defaults
  selectedInstanceId: null,
  transformMode: 'translate',
  isTransforming: false,
  liveTransform: null,
  rightSidebarOpen: true,
  focusTarget: null,

  // Phase 5 defaults
  activeProjectId: null,
  activeProjectName: null,
  activeExhibitionId: null,
  activeVersionId: null,

  // Phase 6 defaults
  localInstances: [],
  pastInstances: [],
  futureInstances: [],
  hasUnsavedChanges: false,

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

  // Phase 4.2 actions
  selectInstance: (id) => set({ selectedInstanceId: id }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setIsTransforming: (v) => set({ isTransforming: v }),
  setLiveTransform: (t) => set({ liveTransform: t }),
  toggleRightSidebar: () => set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),
  setFocusTarget: (target) => set({ focusTarget: target }),

  // Phase 5 actions
  setActiveProject: (id, name, exhibitionId, versionId) => set({ 
    activeProjectId: id, 
    activeProjectName: name,
    activeExhibitionId: exhibitionId, 
    activeVersionId: versionId,
    selectedInstanceId: null, // Clear selection on project switch
  }),
  setActiveVersion: (id) => set({ activeVersionId: id, selectedInstanceId: null }),

  // Phase 6 actions
  setLocalInstances: (instances) => set({
    localInstances: instances,
    pastInstances: [],
    futureInstances: [],
    hasUnsavedChanges: false,
    selectedInstanceId: null
  }),
  commitLocalChange: (newInstances) => set((state) => ({
    pastInstances: [...state.pastInstances, state.localInstances],
    localInstances: newInstances,
    futureInstances: [],
    hasUnsavedChanges: true,
  })),
  undo: () => set((state) => {
    if (state.pastInstances.length === 0) return state;
    const previous = state.pastInstances[state.pastInstances.length - 1];
    const newPast = state.pastInstances.slice(0, state.pastInstances.length - 1);
    return {
      pastInstances: newPast,
      futureInstances: [state.localInstances, ...state.futureInstances],
      localInstances: previous,
      hasUnsavedChanges: true, // Might transition to clean, but typically considered dirty until manually saved
      selectedInstanceId: null,
    };
  }),
  redo: () => set((state) => {
    if (state.futureInstances.length === 0) return state;
    const next = state.futureInstances[0];
    const newFuture = state.futureInstances.slice(1);
    return {
      pastInstances: [...state.pastInstances, state.localInstances],
      futureInstances: newFuture,
      localInstances: next,
      hasUnsavedChanges: true,
      selectedInstanceId: null,
    };
  }),
  markSaved: () => set({ 
      hasUnsavedChanges: false 
  }),
}));
