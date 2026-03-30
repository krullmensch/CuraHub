import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { Scene } from '../components/Scene';
// Player is now handled inside PlannerCameraSystem
import { ArtworkPlacement } from '../components/ArtworkPlacement';
import { useEditorStore } from '../store/editorStore';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { Eye, EyeOff, Move, RotateCw, Maximize2, Magnet } from 'lucide-react';
import { ArtworkInfoOverlay } from '../components/ArtworkInfoOverlay';

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
  
  const { toast } = useToast();
  const selectInstance = useEditorStore((state) => state.selectInstance);
  const setTransformMode = useEditorStore((state) => state.setTransformMode);
  const setTransformAxisLock = useEditorStore((state) => state.setTransformAxisLock);
  const showTraverses = useEditorStore((state) => state.showTraverses);
  const toggleTraverses = useEditorStore((state) => state.toggleTraverses);
  const selectedInstanceId = useEditorStore((state) => state.selectedInstanceId);
  const rightSidebarOpen = useEditorStore((state) => state.rightSidebarOpen);
  const transformMode = useEditorStore((state) => state.transformMode);
  const transformAxisLock = useEditorStore((state) => state.transformAxisLock);
  const snapEnabled = useEditorStore((state) => state.snapEnabled);
  const selectWall = useEditorStore((state) => state.selectWall);
  const selectZone = useEditorStore((state) => state.selectZone);

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

        // Snap toggle
        case 'n':
          store.setSnapEnabled(!store.snapEnabled);
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
                    toast({
                        variant: "destructive",
                        title: "No Project Selected",
                        description: "Please select or create a project first.",
                    });
                } else {
                try {
                    const { position, rotation } = validPlacement;
                    
                    const store = useEditorStore.getState();
                    const newInstanceId = -Date.now(); // Temporary ID until saved
                    
                    // Determine medium based on asset type
                    const assetType = draggedAsset.assetType || 'image';
                    const medium = assetType === 'model3d' ? 'model3d' as const
                        : assetType === 'video' ? 'display' as const
                        : 'frame' as const;

                    store.commitLocalChange([...store.localInstances, {
                        id: newInstanceId,
                        artworkId: draggedAsset.type === 'artwork' ? draggedAsset.id : undefined,
                        assetId: draggedAsset.type === 'asset' ? draggedAsset.id : undefined,
                        wallId: validPlacement.wallId ?? null,
                        medium,
                        artwork: {
                            asset: {
                                path: draggedAsset.videoUrl || draggedAsset.url,
                                width: draggedAsset.width,
                                height: draggedAsset.height,
                                dpi: draggedAsset.dpi,
                                type: assetType,
                            }
                        },
                        position_x: position[0],
                        position_y: position[1],
                        position_z: position[2],
                        rotation_x: rotation[0],
                        rotation_y: rotation[1],
                        rotation_z: rotation[2],
                        scale_x: 1,
                        scale_y: 1,
                        scale_z: 1,
                    }]);
                    
                    const label = assetType === 'model3d' ? '3D Model' : assetType === 'video' ? 'Video' : 'Artwork';
                    toast({
                        title: `${label} Placed`,
                        description: `Placed ${draggedAsset.url.split('/').pop()}`,
                    });
                    
                } catch (err) {
                    console.error("Placement error:", err);
                    toast({
                        variant: "destructive",
                        title: "Placement Failed",
                        description: "Could not place artwork.",
                    });
                }
                } // end else for version check
            } else if (isDragging && !validPlacement) {
                 toast({
                    variant: "destructive",
                    title: "Invalid Placement",
                    description: draggedAsset?.assetType === 'model3d'
                        ? "Cannot place here. Try the floor."
                        : "Cannot place here. Try a wall.",
                });
            }
            
            // Reset dragging state
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

      {/* Transform HUD — mode, axis lock, snap */}
      {viewMode !== 'firstPerson' && selectedInstanceId && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          zIndex: 15,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          fontSize: '11px',
          fontWeight: 500,
          backdropFilter: 'blur(8px)',
          fontFamily: '"Albert Sans", sans-serif',
        }}>
          {/* Mode icon */}
          {transformMode === 'translate' && <Move size={14} />}
          {transformMode === 'rotate' && <RotateCw size={14} />}
          {transformMode === 'scale' && <Maximize2 size={14} />}
          <span style={{ textTransform: 'capitalize' }}>{transformMode === 'translate' ? 'Grab' : transformMode}</span>

          {/* Axis lock */}
          {transformAxisLock !== 'none' && (
            <span style={{
              marginLeft: '4px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: transformAxisLock === 'x' ? 'rgba(239,68,68,0.7)' :
                           transformAxisLock === 'y' ? 'rgba(34,197,94,0.7)' :
                           'rgba(59,130,246,0.7)',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}>
              {transformAxisLock}
            </span>
          )}

          {/* Snap indicator */}
          {snapEnabled && (
            <span style={{
              marginLeft: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              color: 'rgb(250, 204, 21)',
            }}>
              <Magnet size={12} />
              <span style={{ fontSize: '10px' }}>Snap</span>
            </span>
          )}
        </div>
      )}

      {/* Traverses Toggle Button */}
      {viewMode !== 'firstPerson' && (
          <button
            onClick={toggleTraverses}
            title={showTraverses ? 'Hide Traverses' : 'Show Traverses'}
            style={{
              position: 'absolute',
              bottom: '20px',
              right: (selectedInstanceId && rightSidebarOpen) ? '312px' : '20px',
              zIndex: 15,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: showTraverses ? 'rgba(59,130,246,0.8)' : 'rgba(0,0,0,0.6)',
              color: 'white',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.3s ease',
            }}
          >
            {showTraverses ? <Eye size={14} /> : <EyeOff size={14} />}
            Traverses
          </button>
      )}
    </div>
  );
};
