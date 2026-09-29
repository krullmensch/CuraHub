import { useRef } from 'react';
import * as THREE from 'three';
import { useArtworkTexture } from '@/hooks/use-artwork-texture';
import type { BookSize } from '@/lib/book/geometry';

interface BookMeshProps {
  instanceId: number;
  size: BookSize;
  coverPath: string;
  thumbnailPath: string | null;
  pixelWidth: number;
  pixelHeight: number;
  selected: boolean;
}

const PAPER = '#efe9dc';
const BOARD = '#3a3a3a';
const noRaycast = () => {};

/**
 * Closed book lying flat: box with the cover on top (+Y). BoxGeometry face order is
 * +X, −X, +Y, −Y, +Z, −Z → page edges, spine (−X), cover, back board, page edges, page edges.
 * The cover's top edge points to −Z, so someone in front of the pedestal (+Z) reads it upright.
 */
export function BookMesh({ instanceId, size, coverPath, thumbnailPath, pixelWidth, pixelHeight, selected }: BookMeshProps) {
  const objectRef = useRef<THREE.Mesh>(null);
  const coverRef = useArtworkTexture(
    instanceId,
    { path: coverPath, thumbnailPath, pixelWidth: pixelWidth || 1, pixelHeight: pixelHeight || 1, sizeM: Math.max(size.width, size.length), forceMax: selected },
    objectRef,
  );
  return (
    <mesh ref={objectRef} position={[0, size.thickness / 2, 0]} scale={[size.width, size.thickness, size.length]} raycast={noRaycast}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial attach="material-0" color={PAPER} roughness={0.9} />
      <meshStandardMaterial attach="material-1" color={BOARD} roughness={0.7} />
      {/* White: the texture manager assigns `map` but never touches `color`, so any tint would darken the cover. */}
      <meshStandardMaterial attach="material-2" ref={coverRef} color="#ffffff" roughness={0.6} />
      <meshStandardMaterial attach="material-3" color={BOARD} roughness={0.7} />
      <meshStandardMaterial attach="material-4" color={PAPER} roughness={0.9} />
      <meshStandardMaterial attach="material-5" color={PAPER} roughness={0.9} />
    </mesh>
  );
}
