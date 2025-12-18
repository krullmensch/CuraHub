import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { Scene } from '../components/Scene';
import { Player } from '../components/Player';

import * as THREE from 'three';

export const ViewerPage = () => {
  return (
    <>
      <Canvas 
        shadows 
        camera={{ position: [0, 1.7, 0], fov: 60 }} 
        style={{ width: '100vw', height: '100vh' }}
        gl={{
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.2,
            outputColorSpace: THREE.SRGBColorSpace, // Ensure correct color space
        }}
      >
        <Physics gravity={[0, -9.81, 0]}>
            <Scene isEditor={false} />
            <Player />
        </Physics>
      </Canvas>
      <Loader />
      
      {/* UI Overlay */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '10px',
        height: '10px',
        background: 'white',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 10
      }} />
    </>
  );
};
