import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { Scene } from '../components/Scene';
// Player is now handled inside PlannerCameraSystem
import { ArtworkPlacement } from '../components/ArtworkPlacement';
import { useEditorStore, artworkMinY, type MediumType } from '../store/editorStore';
import { gooeyToast } from 'goey-toast';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, Move, RotateCw, Maximize2 } from 'lucide-react';
import { ArtworkInfoOverlay } from '../components/ArtworkInfoOverlay';
import { VideoMediumPickerDialog } from '../components/VideoMediumPickerDialog';

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

const GL_CONFIG = {
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.1,
    outputColorSpace: THREE.SRGBColorSpace,
};

export const EditorPage = () => {
  const isPlacing = useEditorStore((state) => state.isPlacing);
  const viewMode = useEditorStore((state) => state.plannerViewMode);
  const setDragPosition = useEditorStore((state) => state.setDragPosition);
  const setDragging = useEditorStore((state) => state.setDragging);
  // Do not subscribe to dragState here to avoid re-renders on every mouse move/raycast
  
  const selectInstance = useEditorStore((state) => state.selectInstance);
  const setTransformMode = useEditorStore((state) => state.setTransformMode);
  const setTransformAxisLock = useEditorStore((state) => state.setTransformAxisLock);
  const showTraverses = useEditorStore((state) => state.showTraverses);
  const toggleTraverses = useEditorStore((state) => state.toggleTraverses);
  const selectedInstanceId = useEditorStore((state) => state.selectedInstanceId);
  const isMonitorSelected = useEditorStore((state) => {
    if (!state.selectedInstanceId) return false;
    const inst = state.localInstances.find(i => i.id === state.selectedInstanceId);
    return inst?.medium === 'monitor';
  });
  const transformMode = useEditorStore((state) => state.transformMode);
  const transformAxisLock = useEditorStore((state) => state.transformAxisLock);
  const selectWall = useEditorStore((state) => state.selectWall);
  const selectZone = useEditorStore((state) => state.selectZone);

  // Captured placement awaiting the user's Monitor/Beamer choice (video drops only)
  const [pendingVideoDrop, setPendingVideoDrop] = useState<PendingVideoDrop | null>(null);

  // Shared instance-creation helper used by both the immediate drop path (image / model3d)
  // and the deferred video-drop path (after Monitor/Beamer is picked).
  const placeInstance = (medium: MediumType, snapshot: PendingVideoDrop): number => {
    const store = useEditorStore.getState();
    const newInstanceId = -Date.now(); // Temporary ID until saved
    const { draggedAsset } = snapshot;
    const assetType = draggedAsset.assetType || 'image';

    // Compute minimum Y so the bottom edge of the artwork stays at or above the floor
    const hasPhysical = draggedAsset.artworkHeight != null && draggedAsset.artworkWidth != null;
    const baseHeightM = hasPhysical
      ? (draggedAsset.artworkHeight! / 100)
      : (draggedAsset.height / (draggedAsset.dpi || 72)) * 0.0254;
    const placementMinY = medium === 'model3d' ? 0 : baseHeightM / 2; // scale = 1 at placement
    const clampedY = Math.max(placementMinY, snapshot.position[1]);

    store.commitLocalChange([...store.localInstances, {
      id: newInstanceId,
      artworkId: draggedAsset.type === 'artwork' ? draggedAsset.id : undefined,
      assetId: draggedAsset.type === 'asset' ? draggedAsset.id : undefined,
      wallId: snapshot.wallId,
      medium,
      artwork: {
        id: draggedAsset.type === 'artwork' ? draggedAsset.id : undefined,
        width: draggedAsset.artworkWidth,
        height: draggedAsset.artworkHeight,
        asset: {
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
      rotation_x: snapshot.rotation[0],
      rotation_y: snapshot.rotation[1],
      rotation_z: snapshot.rotation[2],
      scale_x: 1,
      scale_y: 1,
      scale_z: 1,
    }]);

    return newInstanceId;
  };

  // Blender-style keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
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
      const hasSelection = !!(store.selectedInstanceId || store.selectedWallId || store.selectedZoneId);
      const key = e.key.toLowerCase();

      // Escape always works — deselect everything
      if (key === 'escape') {
        selectInstance(null);
        selectWall(null);
        selectZone(null);
        setTransformAxisLock('none');
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
            // Monitor size is fixed by the 3D model — scaling is disabled
            if (store.localInstances.find(i => i.id === store.selectedInstanceId)?.medium === 'monitor') break;
            e.preventDefault();
            setTransformMode('scale');
            setTransformAxisLock('none');
            store.setModalTransformActive(true);
            // pointer lock removed — keep cursor visible during transforms
          }
          break;

        // Axis lock
        case 'x':
          if (store.selectedInstanceId) {
            setTransformAxisLock(store.transformAxisLock === 'x' ? 'none' : 'x');
          }
          break;
        case 'y':
          if (store.selectedInstanceId) {
            setTransformAxisLock(store.transformAxisLock === 'y' ? 'none' : 'y');
          }
          break;
        case 'z':
          if (!cmdOrCtrl && store.selectedInstanceId) {
            setTransformAxisLock(store.transformAxisLock === 'z' ? 'none' : 'z');
          }
          break;

        // Delete selected instance
        case 'delete':
        case 'backspace':
          if (store.selectedInstanceId) {
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
  }, [selectInstance, selectWall, selectZone, setTransformMode, setTransformAxisLock]);
  // We need a ref to the container to calculate relative coordinates if needed, 
  // but for full screen editor, window coordinates are fine for NDC.
  
  return (
    <div 
        style={{ width: '100%', height: '100%', position: 'relative' }}
        onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Calculate properties relative to the generic container
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Calculate NDC
            const ndcX = (x / rect.width) * 2 - 1;
            const ndcY = -(y / rect.height) * 2 + 1;
            
            setDragPosition({ x: ndcX, y: ndcY });
        }}
        onDrop={async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const { isDragging, validPlacement, draggedAsset } = useEditorStore.getState().dragState;

            // If we have a valid placement from the Raycaster (via store), place it.
            if (isDragging && validPlacement && draggedAsset) {
                if (!useEditorStore.getState().activeVersionId) {
                    gooeyToast.error("No Project Selected", {
                        description: "Please select or create a project first.",
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
                        // Defer placement until the user picks Monitor or Beamer in the modal.
                        setPendingVideoDrop(snapshot);
                    } else {
                        const medium: MediumType = assetType === 'model3d' ? 'model3d' : 'frame';
                        placeInstance(medium, snapshot);

                        const label = assetType === 'model3d' ? '3D Model' : 'Artwork';
                        gooeyToast.success(`${label} Placed`, {
                            description: `Placed ${draggedAsset.url.split('/').pop()}`,
                        });
                    }
                } catch (err) {
                    console.error("Placement error:", err);
                    gooeyToast.error("Placement Failed", {
                        description: "Could not place artwork.",
                    });
                }
                } // end else for version check
            } else if (isDragging && !validPlacement) {
                 gooeyToast.error("Invalid Placement", {
                    description: draggedAsset?.assetType === 'model3d'
                        ? "Cannot place here. Try the floor."
                        : "Cannot place here. Try a wall.",
                });
            }

            // Reset dragging state (the modal, if shown, owns its own captured snapshot)
            setDragging(false, null);
            setDragPosition(null);
        }}
    >
      <Canvas 
        shadows 
        // Camera is managed by PlannerCameraSystem in Scene
        style={{ width: '100%', height: '100%' }}
        gl={GL_CONFIG}
        onPointerMissed={() => { selectInstance(null); selectWall(null); selectZone(null); }}
      >
        <Physics gravity={[0, -9.81, 0]}>
            <Scene />
            <ArtworkPlacement />
        </Physics>
      </Canvas>
      <Loader />
      
      {/* FPV Crosshair + Artwork Info Overlay */}
      {viewMode === 'firstPerson' && <ArtworkInfoOverlay />}

      {/* Placement UI Overlay */}
      {isPlacing && (
           <div style={{
               position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
               background: 'rgba(0,0,0,0.7)', color: 'white', padding: '10px 20px', borderRadius: '20px',
               zIndex: 20
           }}>
               Placing Artwork... Click to place.
           </div>
      )}

      {/* ── Tool Bar — bottom center ── */}
      {viewMode !== 'firstPerson' && (
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
          <ToolButton icon={<Move size={16} />} tooltip="Grab (G)" active={transformMode === 'translate'} onClick={() => setTransformMode('translate')} disabled={!selectedInstanceId} />
          <ToolButton icon={<RotateCw size={16} />} tooltip="Rotate (R)" active={transformMode === 'rotate'} onClick={() => setTransformMode('rotate')} disabled={!selectedInstanceId} />
          <ToolButton icon={<Maximize2 size={16} />} tooltip="Scale (S)" active={transformMode === 'scale'} onClick={() => setTransformMode('scale')} disabled={!selectedInstanceId || isMonitorSelected} />

          <ToolSeparator />

          {/* Axis lock */}
          <ToolButton icon="X" tooltip="Lock X (X)" active={transformAxisLock === 'x'} activeColor="rgba(239,68,68,0.7)" onClick={() => setTransformAxisLock(transformAxisLock === 'x' ? 'none' : 'x')} disabled={!selectedInstanceId} />
          <ToolButton icon="Y" tooltip="Lock Y (Y)" active={transformAxisLock === 'y'} activeColor="rgba(34,197,94,0.7)" onClick={() => setTransformAxisLock(transformAxisLock === 'y' ? 'none' : 'y')} disabled={!selectedInstanceId} />
          <ToolButton icon="Z" tooltip="Lock Z (Z)" active={transformAxisLock === 'z'} activeColor="rgba(59,130,246,0.7)" onClick={() => setTransformAxisLock(transformAxisLock === 'z' ? 'none' : 'z')} disabled={!selectedInstanceId} />

          <ToolSeparator />

          {/* Traverses */}
          <ToolButton icon={showTraverses ? <Eye size={16} /> : <EyeOff size={16} />} tooltip={showTraverses ? 'Traverses ausblenden' : 'Traverses einblenden'} active={showTraverses} onClick={toggleTraverses} />
        </div>
      )}

      {/* Video drop: Monitor / Beamer picker */}
      <VideoMediumPickerDialog
        open={!!pendingVideoDrop}
        onOpenChange={(o) => { if (!o) setPendingVideoDrop(null); }}
        onSelect={(medium) => {
          if (!pendingVideoDrop) return;
          const id = placeInstance(medium, pendingVideoDrop);
          useEditorStore.getState().selectInstance(id);
          gooeyToast.success('Video platziert', {
            description: medium === 'monitor' ? 'Monitor' : 'Beamer',
          });
          setPendingVideoDrop(null);
        }}
      />
    </div>
  );
};
