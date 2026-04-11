import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { ModularFrame } from './ModularFrame';

interface ArtworkInstanceProps {
  id: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  artwork: {
    title: string;
    artist: string;
    width?: number;
    height?: number;
    asset: {
      path: string;
      width: number;
      height: number;
      dpi: number | null;
    };
  };
}

// Halbe_Classic_Alu8 frame profile depth (Z) extracted via Blender MCP.
const FRAME_PROFILE_DEPTH = 0.027;
// Inset the image plane 4 mm behind the front face of the frame.
const IMAGE_INSET_FROM_FRONT = 0.004;
const IMAGE_Z = FRAME_PROFILE_DEPTH - IMAGE_INSET_FROM_FRONT;

export const ArtworkInstanceMesh = ({ position, rotation, scale, artwork }: ArtworkInstanceProps) => {
  const textureUrl = `http://localhost:3000${artwork.asset.path}`;
  const texture = useLoader(THREE.TextureLoader, textureUrl);

  const hasPhysicalSize = artwork.width != null && artwork.height != null;
  const width = hasPhysicalSize ? (artwork.width! / 100) : (artwork.asset.width / (artwork.asset.dpi || 72)) * 0.0254;
  const height = hasPhysicalSize ? (artwork.height! / 100) : (artwork.asset.height / (artwork.asset.dpi || 72)) * 0.0254;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <ModularFrame width={width} height={height} />

      {/* Image plane, inset 4mm behind the front face of the frame */}
      <mesh position={[0, 0, IMAGE_Z]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};
