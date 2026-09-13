import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useEditorStore } from '../store/editorStore';

interface FrameloopControllerProps {
    /**
     * When this flips from false to true (e.g. the canvas moving from the
     * hidden `/assets` route back to `/edit`, frameloop 'never' -> 'demand'),
     * force one fresh render so the scene isn't stuck on a stale frame.
     */
    isVisible?: boolean;
}

/**
 * Lives inside the R3F tree (mount it directly under <Canvas>). Bridges
 * Zustand store changes to R3F's `invalidate()` so `frameloop="demand"`
 * still re-renders on selection/instance/wall changes that don't flow
 * through a JSX prop the reconciler diffs (e.g. plain store subscriptions
 * read via getState() inside event handlers). Subscribes outside React's
 * render cycle per RND-02 so it adds no re-renders of its own.
 */
export const FrameloopController = ({ isVisible = true }: FrameloopControllerProps) => {
    const invalidate = useThree((state) => state.invalidate);
    const wasVisible = useRef(isVisible);

    useEffect(() => {
        const unsubscribe = useEditorStore.subscribe(() => {
            invalidate();
        });
        return unsubscribe;
    }, [invalidate]);

    useEffect(() => {
        if (isVisible && !wasVisible.current) {
            invalidate();
        }
        wasVisible.current = isVisible;
    }, [isVisible, invalidate]);

    return null;
};
