import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { canvasBridge } from '@/lib/book/canvasBridge';

/** Mount directly under the main <Canvas>: registers its DOM element with canvasBridge. */
export const MainCanvasRegistrar = () => {
  const domElement = useThree((state) => state.gl.domElement) as HTMLCanvasElement;
  useEffect(() => {
    canvasBridge.set(domElement);
    return () => {
      if (canvasBridge.get() === domElement) canvasBridge.set(null);
    };
  }, [domElement]);
  return null;
};
