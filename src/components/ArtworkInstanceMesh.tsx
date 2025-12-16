import { useRef, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

interface ArtworkInstanceProps {
  id: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  artwork: {
    title: string;
    artist: string;
    width: number;
    height: number;
    asset: {
      path: string;
    };
  };
}

export const ArtworkInstanceMesh = ({ position, rotation, scale, artwork }: ArtworkInstanceProps) => {
  // Load texture
  // Note: In a production app you might want to use useTexture from drei which has suspense support better handled sometimes,
  // or handle loading states. For now standard useLoader<TextureLoader> is fine.
  const textureUrl = `http://localhost:3000${artwork.asset.path}`;
  const texture = useLoader(THREE.TextureLoader, textureUrl);

  // Geometry dimensions
  // artwork.width/height are in cm, we convert to meters
  const width = (artwork.width || 50) / 100;
  const height = (artwork.height || 50) / 100;
  
  // Frame settings
  const frameThickness = 0.02; // 2cm frame
  const frameDepth = 0.03; // 3cm deep

  return (
    <group position={position} rotation={rotation} scale={scale}>
      
      {/* The Artwork Canvas/Print - Simple Plane */}
      <mesh>
        <planeGeometry args={[width, height]} />
        {/* Use meshBasicMaterial to ensure it's visible regardless of lighting */}
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} /> 
      </mesh>

    </group>
  );
};
