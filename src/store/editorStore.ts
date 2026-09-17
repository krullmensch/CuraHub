import { create } from 'zustand';
import * as THREE from 'three';
import { useAuthStore } from './authStore';
import { gooeyToast } from 'goey-toast';
import { readStoredRenderQualitySetting, storeRenderQualitySetting, type RenderQualitySetting } from '../lib/renderQuality';
import type { WallSide } from '../lib/wallEditor/geometry';
import type { WallEditorTarget } from '../lib/wallEditor/faces';

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

// STATE-01: cap undo/redo snapshot stacks so they can't grow unbounded during a long session.
const MAX_HISTORY_SIZE = 50;

/**
 * Mutable cache for the Monitor65.glb bottom extent in its local Y space.
 * Populated by VideoInstance when the GLB is first loaded so artworkMinY()
 * can use the real model height instead of the video asset pixel dimensions.
 */
// minY: bottom of the upright (landscape) model; maxX: its right extent, which becomes the bottom
// once a portrait monitor is turned by -90° (see VideoInstance).
export const monitorGlbBounds = { minY: 0, maxX: 0 };

/**
 * Minimum Y position for an artwork instance so its bottom edge stays at or above the floor (Y=0).
 * Position is the center point, so minY = halfHeight.
 * For 3D models and splats the origin sits on the floor, so minY = 0.
 *
 * Pass `overrideScaleY` when the live Three.js scale differs from the stored value
 * (e.g. right after a scale transform before it is committed to the store).
 */
export function artworkMinY(inst: Pick<ArtworkInstanceData, 'medium' | 'artwork' | 'scale_y'>, overrideScaleY?: number): number {
  if (inst.medium === 'model3d' || inst.medium === 'splat') return 0;
  // Monitor pivot may not be at the model's bottom — use the actual GLB bbox
  if (inst.medium === 'monitor') {
    const { width, height } = inst.artwork.asset;
    const isPortrait = !!width && !!height && height > width;
    return Math.max(0, isPortrait ? monitorGlbBounds.maxX : -monitorGlbBounds.minY);
  }
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

export type AssetType = 'image' | 'video' | 'model3d' | 'splat';
export type MediumType = 'frame' | 'wallpaper' | 'projector' | 'display' | 'model3d' | 'monitor' | 'beamer' | 'splat';

/** Assets that stand on the floor (3D models, Gaussian splats) instead of hanging on a wall. */
export function isFloorAssetType(type: string | null | undefined): boolean {
  return type === 'model3d' || type === 'splat';
}

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
      /** VID-04: proxy versions of a video, short edge (px) → path. */
      metadata?: { videoProxies?: Record<string, string> | null } | null;
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

export type { WallEditorTarget };

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
  // STATE-02: reflects the auto-sync module's in-flight/failed state, for a future
  // "Gespeichert / Speichert … / Fehler" status badge in the UI.
  syncStatus: 'idle' | 'saving' | 'error';

  // Modular Walls State
  localWalls: ModularWallData[];

  // FPV Artwork Info
  fpvHoveredInfo: { title: string; artist: string; year: string; description: string; instanceId: number; assetType: string } | null;

  // RND-11: 'auto' resolves via hardware detection (see src/lib/renderQuality.ts)
  renderQualitySetting: RenderQualitySetting;

  // 2D wall editor — null while the normal 3D editor is shown
  wallEditor: WallEditorTarget | null;
  /** Artworks selected inside the 2D wall editor (multi-selection, independent of selectedInstanceId). */
  wallEditorSelection: number[];

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
  setSyncStatus: (status: 'idle' | 'saving' | 'error') => void;

  // Modular Walls Actions
  setLocalWalls: (walls: ModularWallData[]) => void;
  addWall: (wall: ModularWallData) => void;
  updateWall: (id: number, updates: Partial<ModularWallData>) => void;
  deleteWall: (id: number) => void;
  toggleWallLock: (id: number) => void;

  // FPV Actions
  setFpvHoveredInfo: (info: { title: string; artist: string; year: string; description: string; instanceId: number; assetType: string } | null) => void;

  setRenderQualitySetting: (setting: RenderQualitySetting) => void;

  // 2D wall editor actions
  /** Opens a face of a modular wall or a room wall (see lib/wallEditor/faces.ts). */
  openWallEditor: (target: WallEditorTarget, selection?: number[]) => void;
  closeWallEditor: () => void;
  setWallEditorSide: (side: WallSide) => void;
  setWallEditorSelection: (ids: number[]) => void;
}

// STATE-02 / FUNC-04: monotonically incremented by every store action below that marks the
// exhibition dirty (hasUnsavedChanges = true). The auto-sync module at the bottom of this
// file snapshots this counter at the start of a sync batch and only clears
// `hasUnsavedChanges` once the batch (including its retries) finishes if the counter hasn't
// moved since — i.e. no further edits happened while the batch was in flight.
let localEditSeq = 0;

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
  // Updated when leaving the first-person preview; the player respawns here on the next entry.
  // Default = the player's spawn point (body at y 0.8 + eye offset 0.8), looking into the room.
  firstPersonCameraState: {
    position: [-5.99, 1.6, 2.6],
    rotation: [0, -1.1, 0]
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
  syncStatus: 'idle',

  // Modular Walls defaults
  localWalls: [],

  // FPV
  fpvHoveredInfo: null,

  renderQualitySetting: readStoredRenderQualitySetting(),

  wallEditor: null,
  wallEditorSelection: [],

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
    localEditSeq++;
    return {
      pastInstances: [...state.pastInstances, state.localInstances].slice(-MAX_HISTORY_SIZE),
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

      localEditSeq++;
      return {
        pastInstances: [...state.pastInstances, state.localInstances].slice(-MAX_HISTORY_SIZE),
        localInstances: state.localInstances.map(i => i.id === id ? newInst : i),
        futureInstances: [],
        hasUnsavedChanges: true,
      };
    }

    // If wall is selected
    if (state.selectedWallId) {
      const id = state.selectedWallId;
      localEditSeq++;
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
  setActiveProject: (id, name, slug, exhibitionId, versionId, exhibitionSlug = null) => set((state) => ({
    activeProjectId: id,
    activeProjectName: name,
    activeProjectSlug: slug,
    activeExhibitionId: exhibitionId,
    activeExhibitionSlug: exhibitionSlug,
    activeVersionId: versionId,
    selectedInstanceId: null, // Clear selection on project switch
    // The 2D wall editor only survives a re-activation of the same version.
    ...(versionId !== state.activeVersionId ? { wallEditor: null, wallEditorSelection: [] } : {}),
  })),
  setActiveVersion: (id) => set({ activeVersionId: id, selectedInstanceId: null, wallEditor: null, wallEditorSelection: [] }),

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
  commitLocalChange: (newInstances) => {
    localEditSeq++;
    return set((state) => ({
      pastInstances: [...state.pastInstances, state.localInstances].slice(-MAX_HISTORY_SIZE),
      localInstances: newInstances,
      futureInstances: [],
      hasUnsavedChanges: true,
    }));
  },
  undo: () => set((state) => {
    if (state.pastInstances.length === 0) return state;
    const previous = state.pastInstances[state.pastInstances.length - 1];
    const newPast = state.pastInstances.slice(0, state.pastInstances.length - 1);
    localEditSeq++;
    return {
      pastInstances: newPast,
      // Cap from the front — futureInstances[0] is the most-recently-undone state, so
      // dropping from the tail keeps the entries redo can actually reach.
      futureInstances: [state.localInstances, ...state.futureInstances].slice(0, MAX_HISTORY_SIZE),
      localInstances: previous,
      hasUnsavedChanges: true, // Might transition to clean, but typically considered dirty until manually saved
      selectedInstanceId: null,
    };
  }),
  redo: () => set((state) => {
    if (state.futureInstances.length === 0) return state;
    const next = state.futureInstances[0];
    const newFuture = state.futureInstances.slice(1);
    localEditSeq++;
    return {
      pastInstances: [...state.pastInstances, state.localInstances].slice(-MAX_HISTORY_SIZE),
      futureInstances: newFuture,
      localInstances: next,
      hasUnsavedChanges: true,
      selectedInstanceId: null,
    };
  }),
  markSaved: () => set({
    hasUnsavedChanges: false
  }),
  setSyncStatus: (status) => set({ syncStatus: status }),

  // Modular Walls actions
  setLocalWalls: (walls) => {
    // Only snapshot walls with real (positive) IDs so auto-sync doesn't re-POST API data.
    // Temp negative IDs (defaults) are excluded so auto-sync detects and POSTs them.
    prevWalls = walls.filter(w => w.id > 0);
    return set({ localWalls: walls });
  },
  addWall: (wall) => {
    localEditSeq++;
    return set((state) => ({
      localWalls: [...state.localWalls, wall],
      hasUnsavedChanges: true,
    }));
  },
  updateWall: (id, updates) => {
    localEditSeq++;
    return set((state) => ({
      localWalls: state.localWalls.map(w => w.id === id ? { ...w, ...updates } : w),
      hasUnsavedChanges: true,
    }));
  },
  deleteWall: (id) => {
    localEditSeq++;
    return set((state) => ({
      localWalls: state.localWalls.filter(w => w.id !== id),
      // Detach artworks from deleted wall
      localInstances: state.localInstances.map(inst =>
        inst.wallId === id ? { ...inst, wallId: null } : inst
      ),
      selectedWallId: state.selectedWallId === id ? null : state.selectedWallId,
      ...(state.wallEditor?.kind === 'wall' && state.wallEditor.wallId === id ? { wallEditor: null, wallEditorSelection: [] } : {}),
      hasUnsavedChanges: true,
    }));
  },
  toggleWallLock: (id) => {
    localEditSeq++;
    return set((state) => ({
      localWalls: state.localWalls.map(w =>
        w.id === id ? { ...w, isLocked: !w.isLocked } : w
      ),
      hasUnsavedChanges: true,
    }));
  },

  // FPV actions
  setFpvHoveredInfo: (info) => set({ fpvHoveredInfo: info }),

  setRenderQualitySetting: (setting) => {
    storeRenderQualitySetting(setting);
    set({ renderQualitySetting: setting });
  },

  // 2D wall editor actions
  openWallEditor: (target, selection = []) => set((state) => {
    if (state.plannerViewMode === 'firstPerson') return state;
    if (target.kind === 'wall' && !state.localWalls.some(w => w.id === target.wallId)) return state;
    return {
      wallEditor: target,
      wallEditorSelection: selection,
      // The 3D selection (gizmos, halos) stays out of the 2D view.
      selectedInstanceId: null,
      selectedWallId: null,
      selectedZoneId: null,
      transformAxisLock: 'none',
      modalTransformActive: false,
      isTransforming: false,
      liveTransform: null,
    };
  }),
  closeWallEditor: () => set((state) => {
    const target = state.wallEditor;
    if (!target) return state;
    const wallId = target.kind === 'wall' && state.localWalls.some(w => w.id === target.wallId) ? target.wallId : null;
    return {
      wallEditor: null,
      wallEditorSelection: [],
      // Back in 3D an edited modular wall stays selected.
      selectedWallId: wallId,
      selectedInstanceId: null,
    };
  }),
  setWallEditorSide: (side: WallSide) => set((state) => (
    state.wallEditor?.kind === 'wall' && state.wallEditor.side !== side
      ? { wallEditor: { ...state.wallEditor, side }, wallEditorSelection: [] }
      : state
  )),
  setWallEditorSelection: (ids) => set({ wallEditorSelection: ids }),
}));

// ─── Auto-sync: persist every local change to backend immediately ────────────
//
// STATE-02 invariants (read before touching this section):
//
// 1. `isSyncing` now spans the ENTIRE async batch, including retries (up to ~6s per failing
//    request). Because scheduleSync() reschedules itself whenever it fires while isSyncing is
//    true, sync batches are fully serialized — batch N+1 never starts until batch N (and every
//    request it kicked off, success or failure) has completely settled. That means two batches
//    never have requests in flight for the same item at the same time.
// 2. `syncingInstanceTempIds` / `syncingWallTempIds` are kept anyway as defense-in-depth (per
//    the audit's explicit instruction) — with (1) holding, they should always be empty by the
//    time a new batch starts, but they cost nothing and guard against this module ever being
//    invoked re-entrantly in the future.
// 3. `prevInstances` / `prevWalls` represent "what we believe is currently persisted in the
//    DB", not "the last local state we saw". Each batch starts a fresh map seeded from the
//    previous snapshot and only advances an entry when that entry's request actually
//    succeeds. A failed create leaves its (negative) id absent → retried as "new" next time. A
//    failed update leaves the OLD value in place → the next diff sees the same delta again and
//    retries the PATCH. A failed delete leaves the entry in place → the next diff sees it's
//    still "missing from curr" and retries the DELETE. This is what makes failed changes
//    recoverable instead of silently dropped.
// 4. Edits made by the user WHILE a batch is in flight are not lost: they mutate
//    `localInstances`/`localWalls` (and hasUnsavedChanges + localEditSeq) immediately as
//    always; the subscribe listener below calls scheduleSync(), which — since isSyncing is
//    true — reschedules until the current batch finishes. The next batch then reads fresh
//    state via `getState()` and diffs it against the snapshot the just-finished batch produced,
//    so newer edits are always captured, even ones to an item this same batch just
//    created/updated (that item's temp id has already been remapped by then, so the next
//    diff's PATCH targets the real id — no duplicate POST).
// 5. Idempotency keys (Work Package E): every instance/wall POST sends an `Idempotency-Key`
//    header generated once per logical create (`idempotencyKeyFor`: random, NOT derived from
//    the temp id, because temp ids get reused — e.g. default walls are -1…-n for every fresh
//    version) and kept until that POST succeeds — see #3. The server (`server/src/lib/idempotency.ts`)
//    caches the first 2xx response per key and replays it byte-for-byte to any retry of the
//    same POST, so `fetchWithRetry` retrying a POST whose response was lost in transit (but
//    whose insert actually committed) can no longer create a duplicate row. Because the key
//    stays identical across `fetchWithRetry`'s own retries AND
//    across a later batch re-POSTing the same still-unsynced temp id, this covers both cases.
// 6. Automatic recovery: a batch that ends in `syncStatus: 'error'` (i.e. `anyFailure` after
//    `fetchWithRetry` already exhausted its own retries) schedules a follow-up sync on its own
//    — see `scheduleAutoRetry()` below — instead of waiting for the user's next edit. 401 is
//    excluded (no amount of retrying fixes an expired session). The `online` window event also
//    triggers an immediate retry. The failure toast only fires on the transition INTO
//    `'error'` (tracked via `lastSyncStatus`), not on every subsequent automatic attempt that
//    still fails, to avoid spamming the user with toasts while offline.

const RETRY_DELAYS_MS = [500, 1500, 4000];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Stable for the lifetime of this page load. Used to build Idempotency-Key headers (see
// invariant #5 above) — a fresh page load naturally gets a fresh key space, which is fine
// since prevInstances/prevWalls also reset on load and any not-yet-synced temp ids are
// re-POSTed with a key derived from this new session id.
// crypto.randomUUID is only available in secure contexts (https / localhost). Fall back so the
// store module does not crash when the dev server is opened via a LAN IP over plain http.
const randomId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

const SYNC_SESSION_ID = randomId();

// One Idempotency-Key per *logical* create (kind + temp id): generated on the first POST attempt,
// reused by fetchWithRetry's retries and by later batches re-POSTing the same still-unsynced temp
// id, deleted as soon as that POST succeeds, cleared on version change.
const createIdempotencyKeys = new Map<string, string>();
const idempotencyKeyFor = (kind: 'inst' | 'wall', tempId: number): string => {
  const mapKey = `${kind}:${tempId}`;
  let key = createIdempotencyKeys.get(mapKey);
  if (!key) {
    key = `${kind}:${SYNC_SESSION_ID}:${randomId()}`;
    createIdempotencyKeys.set(mapKey, key);
  }
  return key;
};

// Unique negative temp id for locally created instances (STATE-03). `-Date.now()` collided when
// two placements happened in the same millisecond. Stays a safe integer (~1.8e15 < 2^53).
let tempIdSeq = 0;
export const nextTempId = (): number => {
  tempIdSeq = (tempIdSeq + 1) % 1000;
  return -(Date.now() * 1000 + tempIdSeq);
};

/**
 * fetch() with retry + exponential backoff for transient failures.
 * - Network errors (e.g. offline) and 5xx/408/429 responses are retried, up to
 *   RETRY_DELAYS_MS.length times.
 * - Other 4xx responses (400, 403, 404, 409, 422, ...) are caller/data errors a retry can't
 *   fix, so they are NOT retried.
 * - 401 is never retried; the caller is responsible for surfacing a session-expired toast.
 * Returns the last Response received, or null if every attempt threw (fully offline).
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response | null> {
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, init);
    } catch {
      // Network error — fall through to the retryable check below.
    }

    if (res?.ok) return res;
    if (res?.status === 401) return res; // no retry — caller shows the session-expired toast

    const retryable = !res || res.status >= 500 || res.status === 408 || res.status === 429;
    if (!retryable || attempt >= RETRY_DELAYS_MS.length) return res;

    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

const getAuthHeaders = (): Record<string, string> | null => {
  const token = useAuthStore.getState().token;
  if (!token) return null;
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
};

// "Believed persisted in DB" snapshots, used for diffing (see invariant #3 above).
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

// ── Automatic recovery for failed batches (invariant #6 above) ──────────────────────────────
// A batch that ends in error retries itself instead of waiting for the user's next edit.
// Exponential backoff starting at 15s, capped at 2 minutes; reset back to the initial delay as
// soon as a batch succeeds (or goes idle with nothing to do).
const AUTO_RETRY_INITIAL_MS = 15_000;
const AUTO_RETRY_MAX_MS = 120_000;
let autoRetryDelayMs = AUTO_RETRY_INITIAL_MS;
let autoRetryTimer: ReturnType<typeof setTimeout> | null = null;
// Tracks the syncStatus as of the end of the previous batch, so the failure toast only fires
// on the transition INTO 'error' — not on every subsequent automatic retry that still fails.
let lastSyncStatus: 'idle' | 'saving' | 'error' = 'idle';

const scheduleAutoRetry = () => {
  if (autoRetryTimer) return; // already scheduled
  autoRetryTimer = setTimeout(() => {
    autoRetryTimer = null;
    scheduleSync();
  }, autoRetryDelayMs);
  autoRetryDelayMs = Math.min(autoRetryDelayMs * 2, AUTO_RETRY_MAX_MS);
};

const cancelAutoRetry = () => {
  if (autoRetryTimer) {
    clearTimeout(autoRetryTimer);
    autoRetryTimer = null;
  }
  autoRetryDelayMs = AUTO_RETRY_INITIAL_MS;
};

// Retry immediately when connectivity comes back, rather than waiting out the current backoff
// delay. Guarded for non-browser environments (SSR / tests). Registered once at module level.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    cancelAutoRetry();
    scheduleSync();
  });
}

function remapInstanceRefs(oldId: number, newId: number) {
  const ref = instanceRefMap.get(oldId);
  if (ref) { instanceRefMap.set(newId, ref); instanceRefMap.delete(oldId); }
  const videoEl = videoRefMap.get(oldId);
  if (videoEl) { videoRefMap.set(newId, videoEl); videoRefMap.delete(oldId); }
  const bboxSize = modelBBoxMap.get(oldId);
  if (bboxSize) { modelBBoxMap.set(newId, bboxSize); modelBBoxMap.delete(oldId); }
}

const syncToBackend = async () => {
  // Prevent concurrent sync runs — reschedule if already syncing (see invariant #1 above).
  if (isSyncing) { scheduleSync(); return; }
  isSyncing = true;

  // Snapshot the "dirty counter" before doing any work — used at the end to tell whether a
  // newer edit arrived while this batch (including retries) was in flight (FUNC-04).
  const batchStartEditSeq = localEditSeq;
  useEditorStore.setState({ syncStatus: 'saving' });

  let has401 = false;
  let anyFailure = false;

  try {
    const headers = getAuthHeaders();
    if (!headers) {
      useEditorStore.setState({ syncStatus: 'idle' });
      lastSyncStatus = 'idle';
      cancelAutoRetry();
      return;
    }

    const state = useEditorStore.getState();
    const { localInstances, localWalls, activeVersionId } = state;
    if (!activeVersionId) {
      useEditorStore.setState({ syncStatus: 'idle' });
      lastSyncStatus = 'idle';
      cancelAutoRetry();
      return;
    }

    const currInstances = localInstances;
    const currWalls = localWalls;

    const tasks: Promise<void>[] = [];

    // ── Instance sync ──
    const prevMap = new Map(prevInstances.map(i => [i.id, i]));
    const currMap = new Map(currInstances.map(i => [i.id, i]));
    const nextInstancesMap = new Map(prevInstances.map(i => [i.id, i]));

    // New instances (in curr but not prev) → POST
    for (const inst of currInstances) {
      if (prevMap.has(inst.id)) continue;
      // Skip if this temp ID is already being POSTed (see invariant #2 above)
      if (syncingInstanceTempIds.has(inst.id)) continue;

      // Determine artwork/asset IDs
      const artworkId = inst.artworkId ?? inst.artwork?.id;
      const assetId = inst.assetId;
      if (!artworkId && !assetId) continue;

      syncingInstanceTempIds.add(inst.id);
      tasks.push((async () => {
        try {
          const res = await fetchWithRetry('/api/instances', {
            method: 'POST',
            headers: { ...headers, 'Idempotency-Key': idempotencyKeyFor('inst', inst.id) },
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
          });

          if (res?.status === 401) { has401 = true; anyFailure = true; return; }
          if (!res?.ok) {
            anyFailure = true;
            console.error('[AutoSync] Failed to create instance after retries:', inst.id, res?.status);
            return; // absent from nextInstancesMap → treated as "new" again next diff
          }

          const created = await res.json();
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
            wallEditorSelection: current.wallEditorSelection.includes(inst.id)
              ? current.wallEditorSelection.map(id => id === inst.id ? created.id : id)
              : current.wallEditorSelection,
          });
          nextInstancesMap.set(created.id, { ...inst, id: created.id, artworkId: created.artworkId });
          remapInstanceRefs(inst.id, created.id);
          createIdempotencyKeys.delete(`inst:${inst.id}`);
        } finally {
          syncingInstanceTempIds.delete(inst.id);
        }
      })());
    }

    // Deleted instances (in prev but not curr, only for real IDs) → DELETE
    for (const prev of prevInstances) {
      if (prev.id <= 0 || currMap.has(prev.id)) continue;
      tasks.push((async () => {
        const res = await fetchWithRetry(`/api/instances/${prev.id}`, { method: 'DELETE', headers });
        if (res?.status === 401) { has401 = true; anyFailure = true; return; }
        if (!res?.ok) {
          anyFailure = true;
          console.error('[AutoSync] Failed to delete instance after retries:', prev.id, res?.status);
          return; // left in nextInstancesMap (seeded from prevInstances) → retried next diff
        }
        nextInstancesMap.delete(prev.id);
      })());
    }

    // Updated instances (same ID, different transform or wallId) → PATCH
    for (const curr of currInstances) {
      if (curr.id < 0) continue; // temp IDs handled above
      const prev = prevMap.get(curr.id);
      if (!prev) continue;
      const posChanged = curr.position_x !== prev.position_x || curr.position_y !== prev.position_y || curr.position_z !== prev.position_z;
      const rotChanged = curr.rotation_x !== prev.rotation_x || curr.rotation_y !== prev.rotation_y || curr.rotation_z !== prev.rotation_z;
      const scaleChanged = curr.scale_x !== prev.scale_x || curr.scale_y !== prev.scale_y || curr.scale_z !== prev.scale_z;
      const wallChanged = curr.wallId !== prev.wallId;
      const mediumChanged = curr.medium !== prev.medium;
      if (!(posChanged || rotChanged || scaleChanged || wallChanged || mediumChanged)) {
        nextInstancesMap.set(curr.id, curr); // no pending op — keep the snapshot in sync
        continue;
      }

      const body: Record<string, unknown> = {};
      if (posChanged) body.position = { x: curr.position_x, y: curr.position_y, z: curr.position_z };
      if (rotChanged) body.rotation = { x: curr.rotation_x, y: curr.rotation_y, z: curr.rotation_z };
      if (scaleChanged) body.scale = { x: curr.scale_x, y: curr.scale_y, z: curr.scale_z };
      if (wallChanged) body.wallId = curr.wallId ?? null;
      if (mediumChanged) body.medium = curr.medium;

      tasks.push((async () => {
        const res = await fetchWithRetry(`/api/instances/${curr.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
        if (res?.status === 401) { has401 = true; anyFailure = true; return; }
        if (!res?.ok) {
          anyFailure = true;
          console.error('[AutoSync] Failed to update instance after retries:', curr.id, res?.status);
          return; // nextInstancesMap keeps the OLD value (seeded) → retried next diff
        }
        nextInstancesMap.set(curr.id, curr);
      })());
    }

    // ── Wall sync (mirrors instance sync above) ──
    const prevWallMap = new Map(prevWalls.map(w => [w.id, w]));
    const currWallMap = new Map(currWalls.map(w => [w.id, w]));
    const nextWallsMap = new Map(prevWalls.map(w => [w.id, w]));

    // New walls (temp negative IDs) → POST
    for (const wall of currWalls) {
      if (wall.id >= 0 || prevWallMap.has(wall.id)) continue;
      if (syncingWallTempIds.has(wall.id)) continue;

      syncingWallTempIds.add(wall.id);
      tasks.push((async () => {
        try {
          const res = await fetchWithRetry('/api/walls', {
            method: 'POST',
            headers: { ...headers, 'Idempotency-Key': idempotencyKeyFor('wall', wall.id) },
            body: JSON.stringify({
              versionId: activeVersionId,
              label: wall.label,
              position_x: wall.position_x, position_y: wall.position_y, position_z: wall.position_z,
              rotation_x: wall.rotation_x, rotation_y: wall.rotation_y, rotation_z: wall.rotation_z,
              width: wall.width, height: wall.height, thickness: wall.thickness,
              color: wall.color, isLocked: wall.isLocked,
            }),
          });

          if (res?.status === 401) { has401 = true; anyFailure = true; return; }
          if (!res?.ok) {
            anyFailure = true;
            console.error('[AutoSync] Failed to create wall after retries:', wall.id, res?.status);
            return;
          }

          const created = await res.json();
          const current = useEditorStore.getState();
          useEditorStore.setState({
            localWalls: current.localWalls.map(w => w.id === wall.id ? { ...created } : w),
            // Remap wallId on any instances pointing to the temp wall
            localInstances: current.localInstances.map(i =>
              i.wallId === wall.id ? { ...i, wallId: created.id } : i
            ),
            selectedWallId: current.selectedWallId === wall.id ? created.id : current.selectedWallId,
            wallEditor: current.wallEditor?.kind === 'wall' && current.wallEditor.wallId === wall.id
              ? { ...current.wallEditor, wallId: created.id }
              : current.wallEditor,
          });
          nextWallsMap.set(created.id, { ...created });
          createIdempotencyKeys.delete(`wall:${wall.id}`);
        } finally {
          syncingWallTempIds.delete(wall.id);
        }
      })());
    }

    // Deleted walls (real IDs only) → DELETE
    for (const prev of prevWalls) {
      if (prev.id <= 0 || currWallMap.has(prev.id)) continue;
      tasks.push((async () => {
        const res = await fetchWithRetry(`/api/walls/${prev.id}`, { method: 'DELETE', headers });
        if (res?.status === 401) { has401 = true; anyFailure = true; return; }
        if (!res?.ok) {
          anyFailure = true;
          console.error('[AutoSync] Failed to delete wall after retries:', prev.id, res?.status);
          return;
        }
        nextWallsMap.delete(prev.id);
      })());
    }

    // Updated walls → PATCH
    for (const curr of currWalls) {
      if (curr.id < 0) continue;
      const prev = prevWallMap.get(curr.id);
      if (!prev) continue;
      const changed = curr.position_x !== prev.position_x || curr.position_z !== prev.position_z ||
        curr.rotation_y !== prev.rotation_y || curr.isLocked !== prev.isLocked ||
        curr.label !== prev.label || curr.color !== prev.color;
      if (!changed) {
        nextWallsMap.set(curr.id, curr);
        continue;
      }
      tasks.push((async () => {
        const res = await fetchWithRetry(`/api/walls/${curr.id}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({
            position_x: curr.position_x, position_y: curr.position_y, position_z: curr.position_z,
            rotation_x: curr.rotation_x, rotation_y: curr.rotation_y, rotation_z: curr.rotation_z,
            label: curr.label, color: curr.color, isLocked: curr.isLocked,
          }),
        });
        if (res?.status === 401) { has401 = true; anyFailure = true; return; }
        if (!res?.ok) {
          anyFailure = true;
          console.error('[AutoSync] Failed to update wall after retries:', curr.id, res?.status);
          return;
        }
        nextWallsMap.set(curr.id, curr);
      })());
    }

    // Wait for every request in this batch (including its retries) to settle before touching
    // prev*/isSyncing/hasUnsavedChanges — see invariant #1.
    await Promise.allSettled(tasks);

    prevInstances = Array.from(nextInstancesMap.values());
    prevWalls = Array.from(nextWallsMap.values());

    const newSyncStatus: 'idle' | 'error' = anyFailure ? 'error' : 'idle';
    // Only toast on the transition INTO 'error' — repeated automatic retries that keep
    // failing (see invariant #6) must not spam a new toast each time.
    if (newSyncStatus === 'error' && lastSyncStatus !== 'error') {
      if (has401) {
        gooeyToast.error('Sitzung abgelaufen', {
          description: 'Bitte lade die Seite neu und melde dich erneut an, um weiter zu speichern.',
        });
      } else {
        gooeyToast.error('Speichern fehlgeschlagen', {
          description: 'Einige Änderungen konnten nicht gespeichert werden. Wir versuchen es automatisch erneut.',
        });
      }
    }

    useEditorStore.setState({
      syncStatus: newSyncStatus,
      // FUNC-04: only clear the dirty flag if this batch fully succeeded AND no further local
      // edit happened while it (including retries) was in flight.
      ...(!anyFailure && localEditSeq === batchStartEditSeq ? { hasUnsavedChanges: false } : {}),
    });

    // Schedule an automatic follow-up sync so a failed batch recovers on its own instead of
    // waiting for the user's next edit (invariant #6). 401 is excluded — retrying without a
    // fresh login can't succeed, so let it wait for an explicit user action instead of backing
    // off forever in the background.
    if (newSyncStatus === 'error' && !has401) {
      scheduleAutoRetry();
    } else if (newSyncStatus === 'idle') {
      cancelAutoRetry();
    }
    lastSyncStatus = newSyncStatus;
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
    createIdempotencyKeys.clear();
  }
});
