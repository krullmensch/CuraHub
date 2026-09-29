import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { drawLabelPlate, labelPlateLines, LABEL_PLATE_SIZE } from '@/lib/book/labelPlate';
import type { PedestalSize } from '@/lib/book/geometry';

interface LabelPlateProps {
  title?: string | null;
  artist?: string | null;
  year?: string | null;
  pedestal: PedestalSize;
}

const TILT = -(15 * Math.PI) / 180;
const noRaycast = () => {};

/** Werkschild: a thin plate on the pedestal's front (+Z), near the top, tilted back 15°. */
export function LabelPlate({ title, artist, year, pedestal }: LabelPlateProps) {
  const { title: line1, byline } = labelPlateLines({ title, artist, year });
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    drawLabelPlate(canvas, { title: line1, byline });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [line1, byline]);
  useEffect(() => () => texture.dispose(), [texture]);

  // Redraw once the web font is available (first paint may use the fallback font).
  useEffect(() => {
    let cancelled = false;
    document.fonts?.load('600 34px "Albert Sans"').then(() => {
      if (cancelled) return;
      drawLabelPlate(texture.image as HTMLCanvasElement, { title: line1, byline });
      texture.needsUpdate = true;
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [texture, line1, byline]);

  return (
    <mesh
      position={[0, pedestal.height - 0.09, pedestal.depth / 2 + 0.006]}
      rotation={[TILT, 0, 0]}
      raycast={noRaycast}
    >
      <boxGeometry args={[LABEL_PLATE_SIZE.width, LABEL_PLATE_SIZE.height, 0.004]} />
      <meshStandardMaterial attach="material-0" color="#e8e8e6" />
      <meshStandardMaterial attach="material-1" color="#e8e8e6" />
      <meshStandardMaterial attach="material-2" color="#e8e8e6" />
      <meshStandardMaterial attach="material-3" color="#e8e8e6" />
      <meshStandardMaterial attach="material-4" map={texture} roughness={0.8} />
      <meshStandardMaterial attach="material-5" color="#e8e8e6" />
    </mesh>
  );
}
