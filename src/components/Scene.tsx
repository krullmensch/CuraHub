import { Suspense } from 'react';
import { Grid, Environment } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';
import { Satellit } from './Satellit';
import { PlacedArtworks } from './PlacedArtworks';
import { ModularWallsController } from './ModularWallsController';
import { PlannerCameraSystem } from './PlannerCameraSystem';
import { FPVArtworkRaycaster } from './FPVArtworkRaycaster';
import { useEditorStore, type ArtworkInstanceData, type ModularWallData } from '../store/editorStore';

interface SceneProps {
    isEditor?: boolean;
    viewerInstances?: ArtworkInstanceData[];
    viewerWalls?: ModularWallData[];
}

export const Scene = ({ isEditor = true, viewerInstances, viewerWalls }: SceneProps) => {
    const plannerViewMode = useEditorStore(state => state.plannerViewMode);

    // In Viewer mode (not editor), always force First Person
    const viewMode = isEditor ? plannerViewMode : 'firstPerson';

    return (
        <>
            {/* Only use Planner Camera System in Editor Mode */}
            {isEditor && <PlannerCameraSystem />}

            {/* Lighting Setup — bright gallery with soft ambient bounces */}
            <ambientLight intensity={1.2} />

            {/* Environment map for indirect light bounces on materials */}
            <Environment preset="warehouse" background={false} environmentIntensity={0.25} />

            {/* Key light — soft overhead from skylight direction */}
            <directionalLight
                position={[0, 8, 2]}
                intensity={0.8}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-bias={-0.0003}
                shadow-normalBias={0.04}
                shadow-radius={4}
            >
                <orthographicCamera attach="shadow-camera" args={[-15, 15, 15, -15]} near={0.1} far={25} />
            </directionalLight>

            {/* Fill light — simulate bounce off white walls */}
            <directionalLight position={[-6, 6, -4]} intensity={0.3} color="#f8f8ff" />

            {/* Hemisphere light — sky/ground bounce */}
            <hemisphereLight args={['#ffffff', '#f0ece6', 0.4]} />

            {isEditor && viewMode !== 'firstPerson' && (
                <Grid args={[20, 20]} cellColor="white" sectionColor="gray" infiniteGrid fadeDistance={50} position={[0, -0.01, 0]} />
            )}

            <RigidBody type="fixed" colliders="trimesh">
                <Satellit viewMode={viewMode} />
            </RigidBody>

            <Suspense fallback={null}>
                <PlacedArtworks viewerInstances={viewerInstances} isEditor={isEditor} />
                <ModularWallsController viewerWalls={viewerWalls} isEditor={isEditor} />
            </Suspense>

            <FPVArtworkRaycaster isEditor={isEditor} />
        </>
    );
};


