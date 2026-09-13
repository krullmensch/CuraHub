import { lazy, Suspense } from 'react';

// The player's RigidBody-driven movement + camera sync now live in
// src/components/physics/PhysicsLayer.tsx, the only place that imports
// @react-three/rapier (LOAD-01 / RND-08). This wrapper stays a thin,
// non-rapier entry point so the Viewer (always FPV) can keep using <Player />.
const PhysicsLayer = lazy(() => import('./physics/PhysicsLayer'));

export const Player = ({
    viewerWalls,
    viewerInstances,
}: {
    viewerWalls?: import('../store/editorStore').ModularWallData[];
    viewerInstances?: import('../store/editorStore').ArtworkInstanceData[];
} = {}) => {
    return (
        <Suspense fallback={null}>
            <PhysicsLayer isEditor={false} viewerWalls={viewerWalls} viewerInstances={viewerInstances} />
        </Suspense>
    );
};
