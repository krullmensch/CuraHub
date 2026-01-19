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
                try {
                    const { position, rotation } = validPlacement;
                    
                    const response = await fetch('/api/instances', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            artworkId: draggedAsset.id,
                            position: { x: position[0], y: position[1], z: position[2] },
                            rotation: { x: rotation[0], y: rotation[1], z: rotation[2] },
                            scale: validPlacement.scale // Use calculated scale from placement logic
                        })
                    });

                    if (response.status === 401) {
                         useAuthStore.getState().logout();
                         return;
                    }

                    if (!response.ok) throw new Error('Failed to save placement');
                    
                    toast({
                        title: "Artwork Placed",
                        description: `Placed ${draggedAsset.url.split('/').pop()}`,
                    });
                    
                    useEditorStore.getState().triggerInstancesRefresh();
                    
                } catch (err) {
                    console.error("Placement error:", err);
                    toast({
                        variant: "destructive",
                        title: "Placement Failed",
                        description: "Could not place artwork.",
                    });
                }
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
    </div>
  );
};
