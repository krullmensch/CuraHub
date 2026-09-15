import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * Calls `onReady` after the first frame that rendered this component. Place it in the same
 * Suspense boundary as the content that must be loaded (e.g. the room model): it only mounts
 * once that content resolved, and R3F only renders frames while the tab is visible — so a
 * viewer opened in a background tab no longer reports "ready" before anything loaded.
 */
export const SceneReadySignal = ({ onReady }: { onReady: () => void }) => {
    const fired = useRef(false);
    useFrame(() => {
        if (fired.current) return;
        fired.current = true;
        // Leave the render loop before touching React state.
        setTimeout(onReady, 0);
    });
    return null;
};
