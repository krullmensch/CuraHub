import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { Scene } from '../components/Scene';
// Player is now handled inside PlannerCameraSystem
import { ArtworkPlacement } from '../components/ArtworkPlacement';
import { useEditorStore } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const GL_CONFIG = {
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.2,
    outputColorSpace: THREE.SRGBColorSpace,
};

export const EditorPage = () => {
  const isPlacing = useEditorStore((state) => state.isPlacing);
  const viewMode = useEditorStore((state) => state.plannerViewMode);
  const setDragPosition = useEditorStore((state) => state.setDragPosition);
  const setDragging = useEditorStore((state) => state.setDragging);
  // Do not subscribe to dragState here to avoid re-renders on every mouse move/raycast
  
  const token = useAuthStore((state) => state.token);
  const { toast } = useToast();
  const selectInstance = useEditorStore((state) => state.selectInstance);
  const setTransformMode = useEditorStore((state) => state.setTransformMode);
  const showTraverses = useEditorStore((state) => state.showTraverses);
  const toggleTraverses = useEditorStore((state) => state.toggleTraverses);
  const selectedInstanceId = useEditorStore((state) => state.selectedInstanceId);
  const rightSidebarOpen = useEditorStore((state) => state.rightSidebarOpen);

  // Keyboard shortcuts: T/R/S for transform mode, Escape to deselect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const shift = e.shiftKey;

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

      switch (e.key.toLowerCase()) {
        case 't': setTransformMode('translate'); break;
        case 'r': setTransformMode('rotate'); break;
        case 's': setTransformMode('scale'); break;
        case 'escape': selectInstance(null); break;
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
  }, [selectInstance, setTransformMode]);
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
                    
                    store.commitLocalChange([...store.localInstances, {
                        id: newInstanceId,
                        artwork: {
                            asset: {
                                path: draggedAsset.url,
                                width: draggedAsset.width,
                                height: draggedAsset.height,
                                dpi: draggedAsset.dpi
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
                    
                    toast({
                        title: "Artwork Placed",
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
                    description: "Cannot place here. Try a wall.",
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
        onPointerMissed={() => selectInstance(null)}
      >
        <Physics gravity={[0, -9.81, 0]}>
            <Scene />
            <ArtworkPlacement />
        </Physics>
      </Canvas>
      <Loader />
      
      {/* Reticle - Only valid in First Person Mode */}
      {viewMode === 'firstPerson' && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: '10px', height: '10px', background: 'white',
            borderRadius: '50%', transform: 'translate(-50%, -50%)',
            pointerEvents: 'none', zIndex: 10
          }} />
      )}

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
