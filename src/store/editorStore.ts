import { create } from 'zustand';
import * as THREE from 'three';
import { useAuthStore } from './authStore';

// Non-reactive shared ref map for accessing instance Three.js groups from outside PlacedArtworks
export const instanceRefMap = new Map<number, THREE.Group>();
export const videoRefMap = new Map<number, HTMLVideoElement>();
// Natural (unscaled) bounding box size of 3D model instances, in Three.js units (meters)
export const modelBBoxMap = new Map<number, THREE.Vector3>();

// Distance (m) the wall-placement code stores between the wall surface and the
// instance group origin (along the wall normal). Each wall-mounted instance
// component must compensate by rendering its back face at local z = -WALL_PLACEMENT_OFFSET
// so the visible back of the artwork sits flush on the wall surface for both old
// and new instances (the offset is baked into stored positions). Single source of truth.
export const WALL_PLACEMENT_OFFSET = 0.01;

/**
 * Mutable cache for the Monitor65.glb bottom extent in its local Y space.
 * Populated by VideoInstance when the GLB is first loaded so artworkMinY()
 * can use the real model height instead of the video asset pixel dimensions.
 */
export const monitorGlbBounds = { minY: 0 };

/**
 * Minimum Y position for an artwork instance so its bottom edge stays at or above the floor (Y=0).
 * Position is the center point, so minY = halfHeight.
 * For 3D models the origin sits on the floor, so minY = 0.
 *
 * Pass `overrideScaleY` when the live Three.js scale differs from the stored value
 * (e.g. right after a scale transform before it is committed to the store).
 */
export function artworkMinY(inst: Pick<ArtworkInstanceData, 'medium' | 'artwork' | 'scale_y'>, overrideScaleY?: number): number {
  if (inst.medium === 'model3d') return 0;
  // Monitor pivot may not be at the model's bottom — use the actual GLB bbox
  if (inst.medium === 'monitor') return Math.max(0, -monitorGlbBounds.minY);
  const hasPhysical = inst.artwork.height != null && inst.artwork.width != null;
  const baseHeight = hasPhysical
    ? (inst.artwork.height! / 100)                                        // cm → m
    : (inst.artwork.asset.height / (inst.artwork.asset.dpi || 72)) * 0.0254; // px / dpi → inches → m
  const scaleY = overrideScaleY ?? inst.scale_y;
  return (baseHeight * Math.abs(scaleY)) / 2;
}

export type PlannerViewMode = 'orthographic' | 'perspective' | 'firstPerson';
export type TransformMode = 'translate' | 'rotate' | 'scale';
export type TransformAxisLock = 'none' | 'x' | 'y' | 'z';

export type AssetType = 'image' | 'video' | 'model3d';
export type MediumType = 'frame' | 'wallpaper' | 'projector' | 'display' | 'model3d' | 'monitor' | 'beamer';

export interface ArtworkInstanceData {
  id: number;
  artworkId?: number;
  assetId?: number;
  wallId?: number | null;
  medium?: MediumType;
  artwork: {
    id?: number;
    title?: string;
    artist?: string | null;
    year?: string | null;
    description?: string | null;
    width?: number | null;
    height?: number | null;
    asset: {
      path: string;
      width: number;
      height: number;
      dpi: number | null;
      type?: AssetType;
      thumbnailPath?: string | null;
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

export interface ModularWallData {
  id: number;
  versionId?: number;
  label?: string | null;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_x: number;
  rotation_y: number;
  rotation_z: number;
  width: number;
  height: number;
  thickness: number;
  color: string;
  isLocked: boolean;
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
  draggedAsset: { id: number; type: 'asset' | 'artwork'; assetType: AssetType; width: number; height: number; dpi: number; url: string; videoUrl?: string; artworkWidth?: number; artworkHeight?: number } | null;
  dragPosition: { x: number; y: number } | null; // NDC coordinates (-1 to 1)
  validPlacement: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
    wallId: number | null;
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
  selectedWallId: number | null;
  selectedZoneId: number | null;
  transformMode: TransformMode;
  isTransforming: boolean;
  liveTransform: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } } | null;
  focusTarget: { target: [number, number, number]; isHoming: boolean } | null;

  // Blender-style modal transform
  modalTransformActive: boolean;
  activeObjectRef: THREE.Object3D | null;

  // Blender-style controls
  transformAxisLock: TransformAxisLock;

  // UI State
  rightSidebarOpen: boolean;

  // View State
  showTraverses: boolean;

  // Data State
  instancesVersion: number;

  // Phase 5: Project & Version State
  activeProjectId: number | null;
  activeProjectName: string | null;
  activeProjectSlug: string | null;
  activeExhibitionId: number | null;
  activeExhibitionSlug: string | null;
  activeVersionId: number | null;

  // Phase 6: Local State & Undo/Redo
  localInstances: ArtworkInstanceData[];
  pastInstances: ArtworkInstanceData[][];
  futureInstances: ArtworkInstanceData[][];
  hasUnsavedChanges: boolean;

  // Modular Walls State
  localWalls: ModularWallData[];

  // FPV Artwork Info
  fpvHoveredInfo: { title: string; artist: string; year: string; description: string; instanceId: number; assetType: string } | null;

  // Actions
  setDialogOpen: (isOpen: boolean) => void;
  startPlacement: (artwork: { id: number; type: 'asset' | 'artwork'; width: number; height: number; url: string }) => void;
  setDragging: (isDragging: boolean, asset: { id: number; type: 'asset' | 'artwork'; assetType: AssetType; width: number; height: number; dpi: number; url: string; videoUrl?: string; artworkWidth?: number; artworkHeight?: number } | null) => void;
  setDragPosition: (pos: { x: number; y: number } | null) => void;
  setValidPlacement: (placement: { position: [number, number, number]; rotation: [number, number, number]; scale: number; wallId: number | null } | null) => void;
  triggerInstancesRefresh: () => void;
  cancelPlacement: () => void;
  completePlacement: () => void;
  setPlannerViewMode: (mode: PlannerViewMode) => void;
  toggleTraverses: () => void;
  updateOrbitCameraState: (state: Partial<OrbitCameraState>) => void;
  updateFirstPersonCameraState: (state: Partial<FirstPersonCameraState>) => void;
  // Phase 4.2 actions
  selectInstance: (id: number | null) => void;
  selectWall: (id: number | null) => void;
  selectZone: (id: number | null) => void;
  setTransformMode: (mode: TransformMode) => void;
  setIsTransforming: (v: boolean) => void;
  setLiveTransform: (t: EditorState['liveTransform']) => void;
  toggleRightSidebar: () => void;
  setFocusTarget: (focus: { target: [number, number, number]; isHoming: boolean } | null) => void;
  // Blender-style actions
  setTransformAxisLock: (axis: TransformAxisLock) => void;
  deleteSelectedInstance: () => void;
  setModalTransformActive: (active: boolean) => void;
  setActiveObjectRef: (ref: THREE.Object3D | null) => void;
  commitActiveObjectTransform: () => void;
  // Phase 5 actions
  setActiveProject: (id: number | null, name: string | null, slug: string | null, exhibitionId: number | null, versionId: number | null, exhibitionSlug?: string | null) => void;
  setActiveVersion: (id: number | null) => void;

  // Phase 6 Actions
  setLocalInstances: (instances: ArtworkInstanceData[]) => void;
  commitLocalChange: (newInstances: ArtworkInstanceData[]) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;

  // Modular Walls Actions
  setLocalWalls: (walls: ModularWallData[]) => void;
  addWall: (wall: ModularWallData) => void;
  updateWall: (id: number, updates: Partial<ModularWallData>) => void;
  deleteWall: (id: number) => void;
  toggleWallLock: (id: number) => void;

  // FPV Actions
  setFpvHoveredInfo: (info: { title: string; artist: string; year: string; description: string; instanceId: number; assetType: string } | null) => void;
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
    position: [-4, 1.7, 5], // Eye level inside room
    rotation: [-Math.PI / 2, -Math.PI / 2, -Math.PI / 2]
  },

  dragState: {
    isDragging: false,
    draggedAsset: null,
    dragPosition: null,
    validPlacement: null,
  },

  instancesVersion: 0,
  showTraverses: true,

  // Phase 4.2 defaults
  selectedInstanceId: null,
  selectedWallId: null,
  selectedZoneId: null,
  transformMode: 'translate',
  isTransforming: false,
  liveTransform: null,
  rightSidebarOpen: true,
  focusTarget: null,

  // Blender-style defaults
  transformAxisLock: 'none',
  modalTransformActive: false,
  activeObjectRef: null,

  // Phase 5 defaults
  activeProjectId: null,
  activeProjectName: null,
  activeProjectSlug: null,
  activeExhibitionId: null,
  activeExhibitionSlug: null,
  activeVersionId: null,

  // Phase 6 defaults
  localInstances: [],
  pastInstances: [],
  futureInstances: [],
  hasUnsavedChanges: false,

  // Modular Walls defaults
  localWalls: [],

  // FPV
  fpvHoveredInfo: null,

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
  selectInstance: (id) => set({ selectedInstanceId: id, selectedWallId: null, selectedZoneId: null }),
  selectWall: (id) => set({ selectedWallId: id, selectedInstanceId: null, selectedZoneId: null }),
  selectZone: (id) => set({ selectedZoneId: id, selectedInstanceId: null, selectedWallId: null }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setIsTransforming: (v) => set({ isTransforming: v }),
  setLiveTransform: (t) => set({ liveTransform: t }),
  toggleRightSidebar: () => set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),
  setFocusTarget: (target) => set({ focusTarget: target }),

  // Blender-style actions
  setTransformAxisLock: (axis) => set({ transformAxisLock: axis }),
  deleteSelectedInstance: () => set((state) => {
    if (!state.selectedInstanceId) return state;
    const newInstances = state.localInstances.filter(inst => inst.id !== state.selectedInstanceId);
    return {
      pastInstances: [...state.pastInstances, state.localInstances],
      localInstances: newInstances,
      futureInstances: [],
      hasUnsavedChanges: true,
      selectedInstanceId: null,
      transformAxisLock: 'none',
    };
  }),
  setModalTransformActive: (active) => set({ modalTransformActive: active }),
  setActiveObjectRef: (ref) => set({ activeObjectRef: ref }),
  commitActiveObjectTransform: () => set((state) => {
    const ref = state.activeObjectRef;
    if (!ref) return state;

    // If instance is selected
    if (state.selectedInstanceId) {
      const id = state.selectedInstanceId;
      const inst = state.localInstances.find(i => i.id === id);
      if (!inst) return state;

      const minY = artworkMinY(inst, ref.scale.y);
      const newInst = {
        ...inst,
        position_x: ref.position.x,
        position_y: Math.max(minY, ref.position.y),
        position_z: ref.position.z,
        rotation_x: ref.rotation.x,
        rotation_y: ref.rotation.y,
        rotation_z: ref.rotation.z,
        scale_x: ref.scale.x,
        scale_y: ref.scale.y,
        scale_z: ref.scale.z,
      };

      return {
        pastInstances: [...state.pastInstances, state.localInstances],
        localInstances: state.localInstances.map(i => i.id === id ? newInst : i),
        futureInstances: [],
        hasUnsavedChanges: true,
      };
    }

    // If wall is selected
    if (state.selectedWallId) {
      const id = state.selectedWallId;
      return {
        localWalls: state.localWalls.map(w => w.id === id ? {
          ...w,
          position_x: ref.position.x,
          // Wall Y is locked to center normally, we allow it slightly but keep it stored as is or read from ref
          position_y: ref.position.y,
          position_z: ref.position.z,
          rotation_y: ref.rotation.y,
        } : w),
        hasUnsavedChanges: true,
      };
    }

    // If zone is selected (handled directly via updateRestrictionZone from Gizmo initially, 
    // but here we can do it via updating its stored OBB position)
    // Wait, zone transforms are complex: we only want to update the bounds + rotation.
    // For zones, we will just trigger a flag or update via direct useEditorStore.getState().updateRestrictionZone
    return state;
  }),

  // Phase 5 actions
  setActiveProject: (id, name, slug, exhibitionId, versionId, exhibitionSlug = null) => set({
    activeProjectId: id,
    activeProjectName: name,
    activeProjectSlug: slug,
    activeExhibitionId: exhibitionId,
    activeExhibitionSlug: exhibitionSlug,
    activeVersionId: versionId,
    selectedInstanceId: null, // Clear selection on project switch
  }),
  setActiveVersion: (id) => set({ activeVersionId: id, selectedInstanceId: null }),

  // Phase 6 actions
  setLocalInstances: (instances) => {
    // Snapshot prevInstances so auto-sync doesn't re-POST API-loaded data
    prevInstances = [...instances];
    return set({
      localInstances: instances,
      pastInstances: [],
      futureInstances: [],
      hasUnsavedChanges: false,
      selectedInstanceId: null
    });
  },
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

  // Modular Walls actions
  setLocalWalls: (walls) => {
    // Only snapshot walls with real (positive) IDs so auto-sync doesn't re-POST API data.
    // Temp negative IDs (defaults) are excluded so auto-sync detects and POSTs them.
    prevWalls = walls.filter(w => w.id > 0);
    return set({ localWalls: walls });
  },
  addWall: (wall) => set((state) => ({
    localWalls: [...state.localWalls, wall],
    hasUnsavedChanges: true,
  })),
  updateWall: (id, updates) => set((state) => ({
    localWalls: state.localWalls.map(w => w.id === id ? { ...w, ...updates } : w),
    hasUnsavedChanges: true,
  })),
  deleteWall: (id) => set((state) => ({
    localWalls: state.localWalls.filter(w => w.id !== id),
    // Detach artworks from deleted wall
    localInstances: state.localInstances.map(inst =>
      inst.wallId === id ? { ...inst, wallId: null } : inst
    ),
    selectedWallId: state.selectedWallId === id ? null : state.selectedWallId,
    hasUnsavedChanges: true,
  })),
  toggleWallLock: (id) => set((state) => ({
    localWalls: state.localWalls.map(w =>
      w.id === id ? { ...w, isLocked: !w.isLocked } : w
    ),
    hasUnsavedChanges: true,
  })),

  // FPV actions
  setFpvHoveredInfo: (info) => set({ fpvHoveredInfo: info }),
}));

// ─── Auto-sync: persist every local change to backend immediately ────────────

const getAuthHeaders = (): Record<string, string> | null => {
  const token = useAuthStore.getState().token;
  if (!token) return null;
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
};

// Track previous state for diffing
let prevInstances: ArtworkInstanceData[] = [];
let prevWalls: ModularWallData[] = [];

// Guards against duplicate POSTs: track temp IDs currently being synced
const syncingInstanceTempIds = new Set<number>();
const syncingWallTempIds = new Set<number>();
let isSyncing = false;

// Debounce to batch rapid changes (e.g. multiple undo steps)
let syncTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleSync = () => {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(syncToBackend, 150);
};

const syncToBackend = () => {
  // Prevent concurrent sync runs — reschedule if already syncing
  if (isSyncing) { scheduleSync(); return; }
  isSyncing = true;

  try {
    const headers = getAuthHeaders();
    if (!headers) return;

    const state = useEditorStore.getState();
    const { localInstances, localWalls, activeVersionId } = state;
    if (!activeVersionId) return;

    const currInstances = localInstances;
    const currWalls = localWalls;

    // ── Instance sync ──
    const prevMap = new Map(prevInstances.map(i => [i.id, i]));
    const currMap = new Map(currInstances.map(i => [i.id, i]));

    // New instances (in curr but not prev)
    for (const inst of currInstances) {
      if (!prevMap.has(inst.id)) {
        // Skip if this temp ID is already being POSTed
        if (syncingInstanceTempIds.has(inst.id)) continue;

        // Determine artwork/asset IDs
        const artworkId = inst.artworkId ?? inst.artwork?.id;
        const assetId = inst.assetId;
        if (!artworkId && !assetId) continue;

        syncingInstanceTempIds.add(inst.id);

        fetch('/api/instances', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            versionId: activeVersionId,
            artworkId: artworkId || undefined,
            assetId: assetId || undefined,
            wallId: inst.wallId ?? null,
            medium: inst.medium ?? 'frame',
            position: { x: inst.position_x, y: inst.position_y, z: inst.position_z },
            rotation: { x: inst.rotation_x, y: inst.rotation_y, z: inst.rotation_z },
            scale: { x: inst.scale_x, y: inst.scale_y, z: inst.scale_z },
          }),
        }).then(res => res.ok ? res.json() : null).then(created => {
          if (created) {
            // Replace temp ID with real DB ID
            const current = useEditorStore.getState();
            useEditorStore.setState({
              localInstances: current.localInstances.map(i =>
                i.id === inst.id ? { ...i, id: created.id, artworkId: created.artworkId } : i
              ),
              // Also update undo history to reference the real ID
              pastInstances: current.pastInstances.map(snapshot =>
                snapshot.map(i => i.id === inst.id ? { ...i, id: created.id, artworkId: created.artworkId } : i)
              ),
              selectedInstanceId: current.selectedInstanceId === inst.id ? created.id : current.selectedInstanceId,
            });
            // Keep prevInstances in sync so the next diff doesn't re-POST the real ID
            prevInstances = prevInstances.map(p =>
              p.id === inst.id ? { ...p, id: created.id, artworkId: created.artworkId } : p
            );
            // Update the shared ref maps
            const ref = instanceRefMap.get(inst.id);
            if (ref) {
              instanceRefMap.set(created.id, ref);
              instanceRefMap.delete(inst.id);
            }
            const videoEl = videoRefMap.get(inst.id);
            if (videoEl) {
              videoRefMap.set(created.id, videoEl);
              videoRefMap.delete(inst.id);
            }
            const bboxSize = modelBBoxMap.get(inst.id);
            if (bboxSize) {
              modelBBoxMap.set(created.id, bboxSize);
              modelBBoxMap.delete(inst.id);
            }
          }
        }).catch(err => console.error('[AutoSync] Failed to create instance:', err))
          .finally(() => syncingInstanceTempIds.delete(inst.id));
      }
    }

    // Deleted instances (in prev but not curr, only for real IDs)
    for (const prev of prevInstances) {
      if (prev.id > 0 && !currMap.has(prev.id)) {
        fetch(`/api/instances/${prev.id}`, { method: 'DELETE', headers })
          .catch(err => console.error('[AutoSync] Failed to delete instance:', err));
      }
    }

    // Updated instances (same ID, different transform or wallId)
    for (const curr of currInstances) {
      if (curr.id < 0) continue; // temp IDs handled above
      const prev = prevMap.get(curr.id);
      if (!prev) continue;
      const posChanged = curr.position_x !== prev.position_x || curr.position_y !== prev.position_y || curr.position_z !== prev.position_z;
      const rotChanged = curr.rotation_x !== prev.rotation_x || curr.rotation_y !== prev.rotation_y || curr.rotation_z !== prev.rotation_z;
      const scaleChanged = curr.scale_x !== prev.scale_x || curr.scale_y !== prev.scale_y || curr.scale_z !== prev.scale_z;
      const wallChanged = curr.wallId !== prev.wallId;
      const mediumChanged = curr.medium !== prev.medium;
      if (posChanged || rotChanged || scaleChanged || wallChanged || mediumChanged) {
        const body: Record<string, unknown> = {};
        if (posChanged) body.position = { x: curr.position_x, y: curr.position_y, z: curr.position_z };
        if (rotChanged) body.rotation = { x: curr.rotation_x, y: curr.rotation_y, z: curr.rotation_z };
        if (scaleChanged) body.scale = { x: curr.scale_x, y: curr.scale_y, z: curr.scale_z };
        if (wallChanged) body.wallId = curr.wallId ?? null;
        if (mediumChanged) body.medium = curr.medium;
        fetch(`/api/instances/${curr.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
          .catch(err => console.error('[AutoSync] Failed to update instance:', err));
      }
    }

    // ── Wall sync ──
    const prevWallMap = new Map(prevWalls.map(w => [w.id, w]));
    const currWallMap = new Map(currWalls.map(w => [w.id, w]));

    // New walls (temp negative IDs → POST)
    for (const wall of currWalls) {
      if (wall.id < 0 && !prevWallMap.has(wall.id)) {
        // Skip if this temp wall ID is already being POSTed
        if (syncingWallTempIds.has(wall.id)) continue;

        syncingWallTempIds.add(wall.id);

        fetch('/api/walls', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            versionId: activeVersionId,
            label: wall.label,
            position_x: wall.position_x, position_y: wall.position_y, position_z: wall.position_z,
            rotation_x: wall.rotation_x, rotation_y: wall.rotation_y, rotation_z: wall.rotation_z,
            width: wall.width, height: wall.height, thickness: wall.thickness,
            color: wall.color, isLocked: wall.isLocked,
          }),
        }).then(res => res.ok ? res.json() : null).then(created => {
          if (created) {
            const current = useEditorStore.getState();
            useEditorStore.setState({
              localWalls: current.localWalls.map(w => w.id === wall.id ? { ...created } : w),
              // Remap wallId on any instances pointing to the temp wall
              localInstances: current.localInstances.map(i =>
                i.wallId === wall.id ? { ...i, wallId: created.id } : i
              ),
              selectedWallId: current.selectedWallId === wall.id ? created.id : current.selectedWallId,
            });
            // Keep prevWalls in sync so the next diff doesn't re-POST the real ID
            prevWalls = prevWalls.map(p =>
              p.id === wall.id ? { ...created } : p
            );
          }
        }).catch(err => console.error('[AutoSync] Failed to create wall:', err))
          .finally(() => syncingWallTempIds.delete(wall.id));
      }
    }

    // Deleted walls (real IDs only)
    for (const prev of prevWalls) {
      if (prev.id > 0 && !currWallMap.has(prev.id)) {
        fetch(`/api/walls/${prev.id}`, { method: 'DELETE', headers })
          .catch(err => console.error('[AutoSync] Failed to delete wall:', err));
      }
    }

    // Updated walls
    for (const curr of currWalls) {
      if (curr.id < 0) continue;
      const prev = prevWallMap.get(curr.id);
      if (!prev) continue;
      const changed = curr.position_x !== prev.position_x || curr.position_z !== prev.position_z ||
        curr.rotation_y !== prev.rotation_y || curr.isLocked !== prev.isLocked ||
        curr.label !== prev.label || curr.color !== prev.color;
      if (changed) {
        fetch(`/api/walls/${curr.id}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({
            position_x: curr.position_x, position_y: curr.position_y, position_z: curr.position_z,
            rotation_x: curr.rotation_x, rotation_y: curr.rotation_y, rotation_z: curr.rotation_z,
            label: curr.label, color: curr.color, isLocked: curr.isLocked,
          }),
        }).catch(err => console.error('[AutoSync] Failed to update wall:', err));
      }
    }

    // Update prev snapshots
    prevInstances = [...currInstances];
    prevWalls = [...currWalls];

  } finally {
    isSyncing = false;
  }
};

// Subscribe to store changes
useEditorStore.subscribe((state, prevState) => {
  if (state.localInstances !== prevState.localInstances || state.localWalls !== prevState.localWalls) {
    scheduleSync();
  }
});

// Reset prev snapshots when version changes — setLocalInstances/setLocalWalls
// will re-snapshot when the fetched data arrives, so no timeout needed.
useEditorStore.subscribe((state, prevState) => {
  if (state.activeVersionId !== prevState.activeVersionId) {
    prevInstances = [];
    prevWalls = [];
    syncingInstanceTempIds.clear();
    syncingWallTempIds.clear();
  }
});
