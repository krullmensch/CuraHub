import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { touchInput } from '@/lib/touch/touchInput';
import { applyLook } from '@/lib/touch/stick';
import { firstPersonTransition } from '@/lib/cameraTransition';

/**
 * Touch viewer's look: the right stick turns the camera (rate control), in the same 'YXZ' order
 * PointerLockControls uses on desktop. Mounted instead of PointerLockControls in touch mode.
 */
export function TouchLook({ paused }: { paused: boolean }) {
  const camera = useThree((state) => state.camera);
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), []);

  useFrame((_, delta) => {
    if (paused || firstPersonTransition.active) return;
    const look = touchInput.look;
    if (look.x === 0 && look.y === 0) return;
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    const next = applyLook(euler.y, euler.x, look, delta);
    euler.set(next.pitch, next.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
  });

  return null;
}
