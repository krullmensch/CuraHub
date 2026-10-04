import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Scene } from '../components/Scene';
// Player + colliders: components/physics/PhysicsWorld (lazy, first person only — RND-08)
import { ArtworkPlacement } from '../components/ArtworkPlacement';
import { FrameloopController } from '../components/FrameloopController';
import { MainCanvasRegistrar } from '../components/MainCanvasRegistrar';
import { SceneLoadingIndicator } from '../components/SceneLoadingIndicator';
import { SATELLIT_MODEL_URL } from '../lib/modelUrls';
import { CANVAS_SHADOWS, createRendererFactory } from '../lib/rendererBackend';
import { RenderQualityControl } from '../components/RenderQualityControl';
import { ToolbarPopoverButton } from '../components/ToolbarPopoverButton';
import { MeasurementsControl } from '../components/MeasurementsControl';
import { SelectionOutlineSvg, SelectionOutlineTracker } from '../components/SelectionOutline';
import { LiveSceneLayer } from '../components/live/LiveSceneLayer';
import { RemoteSelectionSvg } from '../components/live/RemoteSelections';
import { useRenderQualitySettings } from '../hooks/use-render-quality';
import { usePreparedRenderer } from '../hooks/use-prepared-renderer';
import { BookViewerHost } from '../components/book/BookViewerHost';
import { useBookViewerStore } from '../store/bookViewerStore';
import { useEditorStore, nextTempId, isFloorAssetType, isFixedSizeMedium, type MediumType } from '../store/editorStore';
import { gooeyToast } from 'goey-toast';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { Eye, EyeOff, Move, RotateCw, Maximize2, Footprints, PanelsTopLeft, Settings, PersonStanding } from 'lucide-react';
import { ArtworkInfoOverlay } from '../components/ArtworkInfoOverlay';
import { VideoMediumPickerDialog } from '../components/VideoMediumPickerDialog';
import { placementFeedback, placementResolver, type PlacementIssue } from '../lib/placementFeedback';
import { framedArtworkLayout } from '../lib/frameStyles';
import { WallEditor } from '../components/wall-editor/WallEditorChrome';
import { useWallEditorView } from '../store/wallEditorViewStore';
import { sideSeenFrom } from '../lib/wallEditor/geometry';
import { roomFaceAt, targetForInstance, targetKey } from '../lib/wallEditor/faces';
import { commonFaceTarget } from '../lib/selectionFaces';
import { consumeMarqueeClick } from '../lib/selectionBridge';
import { duplicateCurrentSelection, openFaceWithSelection } from '../lib/selectionActions';
import { focusSelection } from '../lib/focusSelection';
import { SelectionMarquee } from '../components/SelectionMarquee';
import { wallEditorBridge } from '../lib/wallEditor/bridge';
import { MAX_SCALE_FIGURES_PER_VERSION, scaleFigureBridge } from '../lib/scaleFigure';
import { startWallLayoutSync } from '../lib/wallEditor/layoutSync';
import { openBookForInstance } from '../lib/book/viewerActions';
import { isFormControlTarget } from '../lib/keyboardTargets';

/** Explains a rejected drop (ArtworkPlacement records why the last drag position was invalid). */
const placementIssueText = (assetType: string | undefined, issue: PlacementIssue | null) => {
  if (issue === 'unlocked-wall') return 'Die Wand ist nicht gesperrt. Wand sperren, dann Werke daran platzieren.';
  if (assetType === 'model3d') return '3D-Modelle lassen sich nur auf dem Boden platzieren.';
  if (assetType === 'splat') return 'Splats lassen sich nur auf dem Boden platzieren.';
  if (assetType === 'book') return 'Bücher lassen sich nur auf dem Boden platzieren.';
  if (issue === 'not-vertical') return 'Werke lassen sich nur an senkrechten Wandflächen platzieren.';
  return 'Hier lässt sich nichts platzieren. Werk auf eine Wand ziehen.';
};

// Snapshot of a pending placement awaiting user choice (used for the video drop modal)
type DraggedAssetSnapshot = NonNullable<ReturnType<typeof useEditorStore.getState>['dragState']['draggedAsset']>;
interface PendingVideoDrop {
  position: [number, number, number];
  rotation: [number, number, number];
  wallId: number | null;
  draggedAsset: DraggedAssetSnapshot;
}

// ── Tool bar button ──────────────────────────────────────────────────────────

interface ToolButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  active?: boolean;
  activeColor?: string;
  onClick: () => void;
  disabled?: boolean;
}

const ToolButton = ({ icon, tooltip, active, activeColor, onClick, disabled }: ToolButtonProps) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          border: 'none',
          background: active ? (activeColor || 'rgba(59,130,246,0.7)') : hovered && !disabled ? 'rgba(255,255,255,0.08)' : 'transparent',
          color: disabled ? 'rgba(255,255,255,0.2)' : active ? '#fff' : 'rgba(255,255,255,0.7)',
          cursor: disabled ? 'default' : 'pointer',
          transition: 'background 0.15s ease, color 0.15s ease',
          fontSize: 13,
          fontWeight: 700,
          fontFamily: '"Albert Sans", sans-serif',
        }}
      >
        {icon}
      </button>
      {hovered && !disabled && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '4px 10px',
          borderRadius: 6,
          background: 'rgba(0,0,0,0.92)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          fontFamily: '"Albert Sans", sans-serif',
        }}>
          {tooltip}
        </div>
      )}
    </div>
  );
};

const ToolSeparator = () => (
  <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />
);

/**
 * Opens the 2D wall editor for the selected wall (on the face the camera looks at), or for the wall
 * and face the selected artwork hangs on (with that artwork selected). Returns false if neither applies.
 */
function openWallEditorForSelection(): boolean {
  const store = useEditorStore.getState();
  if (store.selectedWallId !== null) {
    const wall = store.localWalls.find(w => w.id === store.selectedWallId);
    if (!wall) return false;
    const camera = wallEditorBridge.getCameraPosition();
    store.openWallEditor({ kind: 'wall', wallId: wall.id, side: camera ? sideSeenFrom(wall, camera) : 'front' });
    return true;
  }
  const selected = store.localInstances.filter(i => store.selectedInstanceIds.includes(i.id));
  const target = commonFaceTarget(selected, store.localWalls, useWallEditorView.getState().roomFaces);
  if (!target) return false;
  store.openWallEditor(target, selected.map(i => i.id));
  return true;
}

/**
 * Double-click on a room wall (or on an artwork hanging on one) opens it in the 2D wall editor.
 * Modular walls handle their own double-click (ModularWallMesh).
 */
function handleCanvasDoubleClick(e: MouseEvent) {
  if (!(e.target instanceof HTMLCanvasElement)) return;
  const store = useEditorStore.getState();
  if (store.plannerViewMode !== 'perspective') return;
  const hit = wallEditorBridge.pick(e.clientX, e.clientY);
  if (!hit) return;
  const rooms = useWallEditorView.getState().roomFaces;

  let instanceId: number | undefined;
  for (let o: typeof hit.object | null = hit.object; o && instanceId === undefined; o = o.parent) {
    if (typeof o.userData.instanceId === 'number') instanceId = o.userData.instanceId;
  }
  if (instanceId !== undefined) {
    const inst = store.localInstances.find(i => i.id === instanceId);
    if (inst?.artwork.asset.type === 'book') {
      openBookForInstance(inst, false);
      return;
    }
    // Videos keep their double-click (mute toggle).
    if (!inst || inst.artwork.asset.type === 'video') return;
    const target = targetForInstance(inst, store.localWalls, rooms);
    if (!target) return;
    // ⇧-double-click keeps the other selected artworks of that wall in the 2D selection.
    if (!store.wallEditor) openFaceWithSelection(target, [inst.id]);
    else if (targetKey(store.wallEditor) === targetKey(target)) store.setWallEditorSelection([inst.id]);
    return;
  }
  if (store.wallEditor || hit.object.name !== 'Wall' || !hit.normal) return;
  const room = roomFaceAt(hit.point, hit.normal, rooms);
  if (room) store.openWallEditor({ kind: 'room', faceId: room.id });
}

// RND-08: Rapier (~2.3 MB chunk + WASM) is only needed for the first-person preview.
const PhysicsWorld = lazy(() => import('../components/physics/PhysicsWorld'));

// WebGPU with the classic WebGLRenderer as fallback. R3F sets ACES tone mapping and sRGB output.
const TONE_MAPPING_EXPOSURE = 1.1;

interface EditorPageProps {
  /** false while the editor Canvas is hidden behind another route (e.g. /assets) — stops the render loop entirely. */
  isVisible?: boolean;
}

export const EditorPage = ({ isVisible = true }: EditorPageProps) => {
  const isPlacing = useEditorStore((state) => state.isPlacing);
  const viewMode = useEditorStore((state) => state.plannerViewMode);
  const setPlannerViewMode = useEditorStore((state) => state.setPlannerViewMode);
  const setDragPosition = useEditorStore((state) => state.setDragPosition);
  const setDragging = useEditorStore((state) => state.setDragging);
  // Do not subscribe to dragState here to avoid re-renders on every mouse move/raycast
  
  const selectInstance = useEditorStore((state) => state.selectInstance);
  const setTransformMode = useEditorStore((state) => state.setTransformMode);
  const setTransformAxisLock = useEditorStore((state) => state.setTransformAxisLock);
  const showTraverses = useEditorStore((state) => state.showTraverses);
  const toggleTraverses = useEditorStore((state) => state.toggleTraverses);
  const hasInstanceSelection = useEditorStore((state) => state.selectedInstanceIds.length > 0);
  const selectedFigureId = useEditorStore((state) => state.selectedFigureId);
  // An unlocked wall can be moved and turned by its gizmo (G/R), same as by the shortcuts.
  const isMovableWallSelected = useEditorStore((state) =>
    state.selectedWallId !== null && state.localWalls.some(w => w.id === state.selectedWallId && !w.isLocked));
  // Monitors and books keep their size — one in the selection locks scaling for all.
  const isFixedSizeSelected = useEditorStore((state) =>
    state.localInstances.some(i => isFixedSizeMedium(i.medium) && state.selectedInstanceIds.includes(i.id)));
  const transformMode = useEditorStore((state) => state.transformMode);
  const transformAxisLock = useEditorStore((state) => state.transformAxisLock);
  const selectWall = useEditorStore((state) => state.selectWall);
  const selectZone = useEditorStore((state) => state.selectZone);
  const wallEditorOpen = useEditorStore((state) => !!state.wallEditor);
  // Hanging height and ruler guides of the 2D wall editor, per exhibition version
  useEffect(() => startWallLayoutSync(), []);
  // 2D wall editor: the selected wall, or the wall the selected artwork hangs on
  const canOpenWallEditor = useEditorStore((state) => {
    if (state.selectedWallId !== null) return true;
    const selected = state.localInstances.filter(i => state.selectedInstanceIds.includes(i.id));
    return commonFaceTarget(selected, state.localWalls, useWallEditorView.getState().roomFaces) !== null;
  });
  // RND-11: preset-dependent pixel ratio; antialiasing is a context attribute and stays as
  // chosen when the Canvas was created.
  const renderSettings = useRenderQualitySettings();
  const [antialias] = useState(renderSettings.antialias);
  const preparedRenderer = usePreparedRenderer();
  const glConfig = useMemo(
    () => (preparedRenderer ? createRendererFactory(preparedRenderer, { antialias, toneMappingExposure: TONE_MAPPING_EXPOSURE }) : null),
    [preparedRenderer, antialias],
  );

  // Captured placement awaiting the user's Monitor/Beamer choice (video drops only)
  const [pendingVideoDrop, setPendingVideoDrop] = useState<PendingVideoDrop | null>(null);

  // Ref to the canvas container — used by capture-phase drag listeners
  const containerRef = useRef<HTMLDivElement>(null);
  // Stable ref to placeInstance so the drag useEffect doesn't need it as a dep
  const placeInstanceRef = useRef<(medium: MediumType, snapshot: PendingVideoDrop) => number>(null!);

  // Shared instance-creation helper used by both the immediate drop path (image / model3d)
  // and the deferred video-drop path (after Monitor/Beamer is picked).
  const placeInstance = (medium: MediumType, snapshot: PendingVideoDrop): number => {
    const store = useEditorStore.getState();
    const newInstanceId = nextTempId(); // Unique temporary ID until saved (STATE-03)
    const { draggedAsset } = snapshot;
    const assetType = draggedAsset.assetType || 'image';

    // Compute minimum Y so the bottom edge of the artwork (frame and passepartout included for
    // pictures) stays at or above the floor
    const hasPhysical = draggedAsset.artworkHeight != null && draggedAsset.artworkWidth != null;
    const baseWidthM = hasPhysical
      ? (draggedAsset.artworkWidth! / 100)
      : (draggedAsset.width / (draggedAsset.dpi || 72)) * 0.0254;
    const baseHeightM = hasPhysical
      ? (draggedAsset.artworkHeight! / 100)
      : (draggedAsset.height / (draggedAsset.dpi || 72)) * 0.0254;
    const pictureBottom = assetType === 'image'
      ? -framedArtworkLayout({
          width: baseWidthM,
          height: baseHeightM,
          frameStyle: store.defaultFrameStyle,
          passepartoutWidth: store.defaultPassepartout.width,
          passepartoutPlacement: store.defaultPassepartout.placement,
        }).bottom
      : baseHeightM / 2;
    const placementMinY = isFloorAssetType(medium) ? 0 : pictureBottom; // scale = 1 at placement
    const clampedY = Math.max(placementMinY, snapshot.position[1]);

    store.commitLocalChange([...store.localInstances, {
      id: newInstanceId,
      artworkId: draggedAsset.type === 'artwork' ? draggedAsset.id : undefined,
      assetId: draggedAsset.type === 'asset' ? draggedAsset.id : undefined,
      wallId: snapshot.wallId,
      medium,
      // New works use the frame style and passepartout last picked in the properties panel (the
      // drag ghost previews the same).
      frameStyle: store.defaultFrameStyle,
      passepartoutWidth: store.defaultPassepartout.width,
      passepartoutPlacement: store.defaultPassepartout.placement,
      artwork: {
        id: draggedAsset.type === 'artwork' ? draggedAsset.id : undefined,
        width: draggedAsset.artworkWidth,
        height: draggedAsset.artworkHeight,
        ...(draggedAsset.book ? {
          title: draggedAsset.book.title,
          artist: draggedAsset.book.artist,
          year: draggedAsset.book.year,
          depth: draggedAsset.book.depth,
          publicReadable: draggedAsset.book.publicReadable,
        } : {}),
        asset: {
          id: draggedAsset.book?.assetId,
          thumbnailPath: draggedAsset.book?.thumbnailPath ?? undefined,
          metadata: draggedAsset.book ? { pageCount: draggedAsset.book.pageCount } : undefined,
          path: draggedAsset.videoUrl || draggedAsset.url,
          width: draggedAsset.width,
          height: draggedAsset.height,
          dpi: draggedAsset.dpi,
          type: assetType,
        }
      },
      position_x: snapshot.position[0],
      position_y: clampedY,
      position_z: snapshot.position[2],
      rotation_x: medium === 'book' ? 0 : snapshot.rotation[0],
      rotation_y: snapshot.rotation[1],
      rotation_z: medium === 'book' ? 0 : snapshot.rotation[2],
      scale_x: 1,
      scale_y: 1,
      scale_z: 1,
    }]);

    return newInstanceId;
  };
  // Keep ref in sync after every render (drop handlers read it later)
  useLayoutEffect(() => {
    placeInstanceRef.current = placeInstance;
  });

  // Selects a freshly placed artwork — in the 2D wall editor its own multi-selection.
  const selectPlaced = (id: number) => {
    const store = useEditorStore.getState();
    if (store.wallEditor) store.setWallEditorSelection([id]);
    else store.selectInstance(id);
  };

  // Keep the 2D wall editor's view size in sync with the canvas container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('dblclick', handleCanvasDoubleClick);
    const update = () => useWallEditorView.getState().setViewport(el.clientWidth, el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.removeEventListener('dblclick', handleCanvasDoubleClick);
    };
  }, []);

  // Preload the room model and the monitor model used by placed videos once the editor actually
  // mounts — moved off module scope so the home page no longer downloads them (LOAD-02). Picture
  // frames are generated in code (frameProfileGeometry), no model to load.
  useEffect(() => {
    useGLTF.preload(SATELLIT_MODEL_URL);
    useGLTF.preload('/models/Monitor65.glb');
  }, []);

  // ── Capture-phase drag listeners ──────────────────────────────────────────
  // UploadDropzone (a common ancestor) calls e.stopPropagation() in its
  // onDragOver handler, and Chrome does not honour pointer-events:none for
  // drag events, so the JSX onDragOver/onDrop on this component's own div
  // are never reached. Document-level capture listeners fire before any
  // child handler and are bounds-checked against the canvas container.
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('asset-id')) return;
      // Skip when the target is inside a zone that handles its own asset drops
      // (Asset Library overlay, sidebar folder strip, etc.)
      if ((e.target as Element).closest?.('[data-asset-drop-zone]')) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top  || e.clientY > rect.bottom) return;
      e.preventDefault();
      e.stopPropagation();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      setDragPosition({ x: ndcX, y: ndcY });
      // Update ghost + placement right away instead of waiting for the next frame.
      placementResolver.resolve?.({ x: ndcX, y: ndcY });
    };

    const handleDrop = async (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('asset-id')) return;
      if ((e.target as Element).closest?.('[data-asset-drop-zone]')) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top  || e.clientY > rect.bottom) return;
      e.preventDefault();
      e.stopPropagation();

      // Resolve the placement at the drop point — don't rely on a frame having rendered since the
      // last dragover (Firefox can hold back rendering during a native drag).
      const dropNdc = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };
      const resolvedPlacement = placementResolver.resolve?.(dropNdc);
      const { isDragging, draggedAsset } = useEditorStore.getState().dragState;
      const validPlacement = resolvedPlacement !== undefined
        ? resolvedPlacement
        : useEditorStore.getState().dragState.validPlacement;

      if (isDragging && validPlacement && draggedAsset) {
        if (!useEditorStore.getState().activeVersionId) {
          gooeyToast.error('Kein Projekt ausgewählt', {
            description: 'Bitte zuerst ein Projekt auswählen oder anlegen.',
          });
        } else {
          try {
            const { position, rotation } = validPlacement;
            const assetType = draggedAsset.assetType || 'image';
            const snapshot: PendingVideoDrop = {
              position,
              rotation,
              wallId: validPlacement.wallId ?? null,
              draggedAsset,
            };
            if (assetType === 'video') {
              setPendingVideoDrop(snapshot);
            } else {
              const medium: MediumType = assetType === 'model3d' || assetType === 'splat' || assetType === 'book' ? assetType : 'frame';
              const placedId = placeInstanceRef.current(medium, snapshot);
              if (useEditorStore.getState().wallEditor) useEditorStore.getState().setWallEditorSelection([placedId]);
              const label = assetType === 'model3d' ? '3D-Modell' : assetType === 'splat' ? 'Splat' : assetType === 'book' ? 'Buch' : 'Werk';
              gooeyToast.success(`${label} platziert`, {
                description: draggedAsset.url.split('/').pop(),
              });
            }
          } catch (err) {
            console.error('Placement error:', err);
            gooeyToast.error('Platzieren fehlgeschlagen', {
              description: 'Das Werk konnte nicht platziert werden.',
            });
          }
        }
      } else if (isDragging && !validPlacement) {
        gooeyToast.error('Platzieren nicht möglich', {
          description: placementIssueText(draggedAsset?.assetType, placementFeedback.issue),
        });
      }

      setDragging(false, null);
      setDragPosition(null);
    };

    document.addEventListener('dragover', handleDragOver, true);
    document.addEventListener('drop', handleDrop, true);
    return () => {
      document.removeEventListener('dragover', handleDragOver, true);
      document.removeEventListener('drop', handleDrop, true);
    };
  }, [setDragPosition, setDragging]);

  // Scale figure: placed on the floor where the view hits it (or in front of the wall it hits),
  // facing the camera, then selected.
  const placeScaleFigure = () => {
    const store = useEditorStore.getState();
    // The server refuses more; a POST it rejects would be retried forever by the auto-sync.
    if (store.localScaleFigures.length >= MAX_SCALE_FIGURES_PER_VERSION) {
      gooeyToast.error(`Maximal ${MAX_SCALE_FIGURES_PER_VERSION} Maßstabsfiguren pro Version`);
      return;
    }
    const pose = scaleFigureBridge.spawnPose();
    if (!pose) return;
    const id = nextTempId();
    store.addScaleFigure({ id, ...pose, isPublic: false });
    store.selectFigure(id);
    store.setTransformMode('translate');
  };

  // Blender-style keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Delete/Backspace after a click on a panel button or control must not remove the selection
      if ((e.key === 'Delete' || e.key === 'Backspace') && isFormControlTarget(e.target)) return;
      if (useBookViewerStore.getState().book) return; // the book viewer handles its own keys

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const shift = e.shiftKey;

      // Undo / Redo
      if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (shift) {
          useEditorStore.getState().redo();
        } else {
          useEditorStore.getState().undo();
        }
        return;
      }

      if (cmdOrCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useEditorStore.getState().redo();
        return;
      }

      const store = useEditorStore.getState();
      const hasSelection = store.selectedInstanceIds.length > 0 || !!store.selectedWallId || !!store.selectedZoneId;
      const hasInstances = store.selectedInstanceIds.length > 0;
      const key = e.key.toLowerCase();

      // The 2D wall editor handles its own keys (WallEditorOverlay); only undo/redo above apply.
      if (store.wallEditor) return;

      // Focus the camera on the selection
      if (key === 'f' && !cmdOrCtrl && isVisible && store.plannerViewMode === 'perspective') {
        if (focusSelection()) e.preventDefault();
        return;
      }

      // Open the 2D wall editor for the selected wall / the wall of the selected artwork
      if (key === 'e' && !cmdOrCtrl && store.plannerViewMode !== 'firstPerson') {
        if (openWallEditorForSelection()) e.preventDefault();
        return;
      }

      // Select all artworks of the version
      // Only while the editor is shown — it stays mounted (hidden) behind the asset library.
      if (cmdOrCtrl && key === 'a' && isVisible && store.plannerViewMode !== 'firstPerson') {
        e.preventDefault();
        store.selectAllInstances();
        return;
      }

      // Duplicate the selected artworks (the copies become the selection)
      if (cmdOrCtrl && key === 'd' && isVisible && store.plannerViewMode !== 'firstPerson') {
        e.preventDefault();
        duplicateCurrentSelection();
        return;
      }

      // Escape always works — deselect everything, and leave first-person mode if active
      if (key === 'escape') {
        if (useEditorStore.getState().plannerViewMode === 'firstPerson') {
          setPlannerViewMode('perspective');
          if (document.pointerLockElement) document.exitPointerLock();
        }
        selectInstance(null);
        selectWall(null);
        selectZone(null);
        setTransformAxisLock('none');
        return;
      }

      // First-person preview toggle — works regardless of current selection
      if (key === 'v' && !cmdOrCtrl) {
        e.preventDefault();
        if (useEditorStore.getState().plannerViewMode !== 'firstPerson') {
          setPlannerViewMode('firstPerson');
        }
        return;
      }

      // Wall-specific hotkeys (no pointer lock — uses TransformControls gizmo directly)
      if (store.selectedWallId) {
        if (key === 'r') {
          e.preventDefault();
          setTransformMode('rotate');
        } else if (key === 'g') {
          e.preventDefault();
          setTransformMode('translate');
        }
        return;
      }

      // Scale figure: G/R pick the gizmo mode, Entf/Backspace removes it
      if (store.selectedFigureId !== null) {
        if (key === 'r' || key === 'g') {
          e.preventDefault();
          setTransformMode(key === 'r' ? 'rotate' : 'translate');
        } else if (key === 'delete' || key === 'backspace') {
          e.preventDefault();
          store.deleteScaleFigure(store.selectedFigureId);
        }
        return;
      }

      // Skip all other hotkeys when a zone is selected
      if (store.selectedZoneId) return;

      switch (key) {
        // Transform modes (Blender-style)
        case 'g':
          if (!hasSelection) break;
          e.preventDefault();
          setTransformMode('translate');
          setTransformAxisLock('none');
          store.setModalTransformActive(true);
          // pointer lock removed — keep cursor visible during transforms
          break;
        case 'r':
          if (!hasSelection) break;
          e.preventDefault();
          setTransformMode('rotate');
          setTransformAxisLock('none');
          store.setModalTransformActive(true);
          // pointer lock removed — keep cursor visible during transforms
          break;
        case 's':
          if (!cmdOrCtrl && hasSelection) { // Don't conflict with Cmd+S
            // Monitor and book sizes are fixed — scaling is disabled
            if (store.localInstances.some(i => isFixedSizeMedium(i.medium) && store.selectedInstanceIds.includes(i.id))) break;
            e.preventDefault();
            setTransformMode('scale');
            setTransformAxisLock('none');
            store.setModalTransformActive(true);
            // pointer lock removed — keep cursor visible during transforms
          }
          break;

        // Axis lock
        case 'x':
          if (hasInstances) {
            setTransformAxisLock(store.transformAxisLock === 'x' ? 'none' : 'x');
          }
          break;
        case 'y':
          if (hasInstances) {
            setTransformAxisLock(store.transformAxisLock === 'y' ? 'none' : 'y');
          }
          break;
        case 'z':
          if (!cmdOrCtrl && hasInstances) {
            setTransformAxisLock(store.transformAxisLock === 'z' ? 'none' : 'z');
          }
          break;

        // Delete selected instance
        case 'delete':
        case 'backspace':
          if (hasInstances) {
            e.preventDefault();
            store.deleteSelectedInstance();
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Unsaved changes warning
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [selectInstance, selectWall, selectZone, setTransformMode, setTransformAxisLock, setPlannerViewMode, isVisible]);
  // We need a ref to the container to calculate relative coordinates if needed,
  // but for full screen editor, window coordinates are fine for NDC.

  // RND-02: render continuously only in first-person mode (player movement, idle head
  // bob). Otherwise render on demand (orbit/transform/drag already call invalidate()).
  // While the editor is hidden behind another route (e.g. /assets) stop rendering
  // entirely — FrameloopController fires one invalidate() when isVisible flips back on.
  const frameloop: 'always' | 'demand' | 'never' =
    viewMode === 'firstPerson' ? 'always' : (isVisible ? 'demand' : 'never');

  return (
    <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {glConfig && (
        <Canvas
          dpr={renderSettings.dpr}
          frameloop={frameloop}
          // Camera is managed by PlannerCameraSystem in Scene
          style={{ width: '100%', height: '100%' }}
          gl={glConfig}
          shadows={CANVAS_SHADOWS}
          onPointerMissed={() => {
            // The pointer-up of a ⇧-drag marquee is no click into the void.
            if (consumeMarqueeClick()) return;
            selectInstance(null); selectWall(null); selectZone(null);
          }}
        >
          <MainCanvasRegistrar />
          <FrameloopController isVisible={isVisible} />
          <Scene />
          <ArtworkPlacement />
          <SelectionOutlineTracker />
          <LiveSceneLayer />
          {viewMode === 'firstPerson' && (
            <Suspense fallback={null}>
              <PhysicsWorld mode="editor" />
            </Suspense>
          )}
        </Canvas>
      )}
      <SceneLoadingIndicator />
      {/* Outline of the selected artwork (projected by SelectionOutlineTracker) */}
      <SelectionOutlineSvg />
      {/* Other people's selections (live collaboration) */}
      <RemoteSelectionSvg />
      <BookViewerHost />
      
      {/* ⇧ + drag: selection marquee over the 3D view */}
      {viewMode === 'perspective' && !wallEditorOpen && isVisible && <SelectionMarquee containerRef={containerRef} />}

      {/* 2D wall editor (overlay, top bar, tool bar) */}
      {viewMode !== 'firstPerson' && isVisible && <WallEditor />}

      {/* FPV Crosshair + Artwork Info Overlay */}
      {viewMode === 'firstPerson' && <ArtworkInfoOverlay />}

      {/* Placement UI Overlay */}
      {isPlacing && (
           <div style={{
               position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
               background: 'rgba(0,0,0,0.7)', color: 'white', padding: '10px 20px', borderRadius: '20px',
               zIndex: 20
           }}>
               Werk wird platziert … Klicken zum Platzieren.
           </div>
      )}

      {/* ── Tool Bar — bottom center ── */}
      {viewMode !== 'firstPerson' && !wallEditorOpen && (
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 15,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: 4,
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(12px)',
        }}>
          {/* Transform modes */}
          <ToolButton icon={<Move size={16} />} tooltip="Grab (G)" active={transformMode === 'translate'} onClick={() => setTransformMode('translate')} disabled={!hasInstanceSelection && selectedFigureId === null && !isMovableWallSelected} />
          <ToolButton icon={<RotateCw size={16} />} tooltip="Rotate (R)" active={transformMode === 'rotate'} onClick={() => setTransformMode('rotate')} disabled={!hasInstanceSelection && selectedFigureId === null && !isMovableWallSelected} />
          <ToolButton icon={<Maximize2 size={16} />} tooltip="Scale (S)" active={transformMode === 'scale'} onClick={() => setTransformMode('scale')} disabled={!hasInstanceSelection || isFixedSizeSelected} />

          <ToolSeparator />

          {/* Axis lock */}
          <ToolButton icon="X" tooltip="Lock X (X)" active={transformAxisLock === 'x'} activeColor="rgba(239,68,68,0.7)" onClick={() => setTransformAxisLock(transformAxisLock === 'x' ? 'none' : 'x')} disabled={!hasInstanceSelection} />
          <ToolButton icon="Y" tooltip="Lock Y (Y)" active={transformAxisLock === 'y'} activeColor="rgba(34,197,94,0.7)" onClick={() => setTransformAxisLock(transformAxisLock === 'y' ? 'none' : 'y')} disabled={!hasInstanceSelection} />
          <ToolButton icon="Z" tooltip="Lock Z (Z)" active={transformAxisLock === 'z'} activeColor="rgba(59,130,246,0.7)" onClick={() => setTransformAxisLock(transformAxisLock === 'z' ? 'none' : 'z')} disabled={!hasInstanceSelection} />

          <ToolSeparator />

          {/* Traverses */}
          <ToolButton icon={showTraverses ? <Eye size={16} /> : <EyeOff size={16} />} tooltip={showTraverses ? 'Traverses ausblenden' : 'Traverses einblenden'} active={showTraverses} onClick={toggleTraverses} />

          <ToolSeparator />

          {/* 2D wall editor */}
          <ToolButton icon={<PanelsTopLeft size={16} />} tooltip="2D-Wandeditor (E)" onClick={openWallEditorForSelection} disabled={!canOpenWallEditor} />

          {/* First-person preview */}
          <ToolButton icon={<Footprints size={16} />} tooltip="Ego-Perspektive (V)" onClick={() => setPlannerViewMode('firstPerson')} />

          {/* Scale figure (1.73 m) */}
          <ToolButton icon={<PersonStanding size={16} />} tooltip="Maßstabsfigur hinzufügen (1,73 m)" onClick={placeScaleFigure} />

          <ToolSeparator />

          <MeasurementsControl />
          <ToolbarPopoverButton icon={<Settings size={16} />} tooltip="Darstellung">
            <RenderQualityControl className="flex-col items-stretch gap-3" />
          </ToolbarPopoverButton>
        </div>
      )}

      {/* Video drop: Monitor / Beamer picker */}
      <VideoMediumPickerDialog
        open={!!pendingVideoDrop}
        onOpenChange={(o) => { if (!o) setPendingVideoDrop(null); }}
        onSelect={(medium) => {
          if (!pendingVideoDrop) return;
          const id = placeInstance(medium, pendingVideoDrop);
          selectPlaced(id);
          gooeyToast.success('Video platziert', {
            description: medium === 'monitor' ? 'Monitor' : 'Beamer',
          });
          setPendingVideoDrop(null);
        }}
      />
    </div>
  );
};
