import { useMemo } from 'react';
import type * as THREE from 'three';
import { bookSize, pedestalSize, PEDESTAL_HEIGHT } from '@/lib/book/geometry';
import type { BookDragInfo } from '@/store/editorStore';

interface BookGhostProps {
  position: THREE.Vector3;
  valid: boolean;
  widthCm?: number;
  heightCm?: number;
  book?: BookDragInfo;
}

const noRaycast = () => {};

/** Drop preview: translucent pedestal + book, green/red like ModelGhostPreview. */
export function BookGhost({ position, valid, widthCm, heightCm, book }: BookGhostProps) {
  const size = useMemo(() => bookSize({ widthCm, heightCm, depthCm: book?.depth, pageCount: book?.pageCount }), [widthCm, heightCm, book?.depth, book?.pageCount]);
  const pedestal = pedestalSize(size);
  const color = valid ? '#22c55e' : '#ef4444';
  return (
    <group position={position}>
      <mesh position={[0, pedestal.height / 2, 0]} raycast={noRaycast}>
        <boxGeometry args={[pedestal.width, pedestal.height, pedestal.depth]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <mesh position={[0, PEDESTAL_HEIGHT + size.thickness / 2, 0]} raycast={noRaycast}>
        <boxGeometry args={[size.width, size.thickness, size.length]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}
