import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { Scene } from '../components/Scene';
// Player is now handled inside PlannerCameraSystem
import { ArtworkPlacement } from '../components/ArtworkPlacement';
import { useEditorStore } from '../store/editorStore';

export const EditorPage = () => {
  const isPlacing = useEditorStore((state) => state.isPlacing);
  const viewMode = useEditorStore((state) => state.plannerViewMode);

  return (
    <>
      <Canvas 
        shadows 
        // Camera is managed by PlannerCameraSystem in Scene
        style={{ width: '100vw', height: '100vh' }}
        gl={{
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.2,
            outputColorSpace: THREE.SRGBColorSpace,
        }}
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
    </>
  );
};
