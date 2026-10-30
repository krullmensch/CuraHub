import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { touchFov } from '@/lib/touch/touchFov';

/** Touch viewer: a wider field of view on narrow screens, updated on rotation. */
export function TouchFov() {
  const get = useThree((s) => s.get);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const camera = get().camera;
    if (!(camera instanceof THREE.PerspectiveCamera) || height === 0) return;
    camera.fov = touchFov(width / height);
    camera.updateProjectionMatrix();
    invalidate();
  }, [get, width, height, invalidate]);

  return null;
}
