import { Suspense } from 'react';
import { Grid } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';
import { Satellit } from './Satellit';
import { PlacedArtworks } from './PlacedArtworks';
import { ModularWallsController } from './ModularWallsController';
import { PlannerCameraSystem } from './PlannerCameraSystem';
import { FPVArtworkRaycaster } from './FPVArtworkRaycaster';
import { ArtworkTextureProvider } from './ArtworkTextureProvider';
import { FrameInstancerProvider } from './FrameInstancer';
import { useEditorStore, type ArtworkInstanceData, type ModularWallData } from '../store/editorStore';
import { useRenderQualitySettings } from '../hooks/use-render-quality';

interface SceneProps {
    isEditor?: boolean;
    viewerInstances?: ArtworkInstanceData[];
    viewerWalls?: ModularWallData[];
}

export const Scene = ({ isEditor = true, viewerInstances, viewerWalls }: SceneProps) => {
    const plannerViewMode = useEditorStore(state => state.plannerViewMode);
    const { rectAreaLights } = useRenderQualitySettings();

    // In Viewer mode (not editor), always force First Person
    const viewMode = isEditor ? plannerViewMode : 'firstPerson';

    return (
        <ArtworkTextureProvider>
            <FrameInstancerProvider>
                {/* Only use Planner Camera System in Editor Mode */}
                {isEditor && <PlannerCameraSystem />}

                {/* Lighting Setup — bright gallery with soft ambient bounces */}
                <ambientLight intensity={0.4} />

                {/* Environment map for indirect light bounces on materials */}
                {/* <Environment preset="warehouse" background={false} environmentIntensity={0.25} /> */}

                {/* Key light — soft overhead from skylight direction */}
                {/* <directionalLight
                    position={[-4, 8, -8]}
                    intensity={0.8}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                    shadow-bias={-0.0003}
                    shadow-normalBias={0.04}
                    shadow-radius={4}
                >
                    <orthographicCamera attach="shadow-camera" args={[-15, 15, 15, -15]} near={0.1} far={25} />
                </directionalLight> */}

                {/* Fill light — simulate bounce off white walls */}
                <directionalLight position={[-6, 6, -4]} intensity={0.3} color="#f8f8ff" />

                {/* RND-04: the "low" preset drops the two ceiling RectAreaLights (per-fragment LTC
                    shading); a hemisphere light keeps the room roughly as bright. */}
                {!rectAreaLights && (
                    <>
                        <hemisphereLight args={['#fff5e0', '#f4efe8', 1.7]} />
                        {/* Replaces the upward area light that brightens the ceiling */}
                        <directionalLight position={[0, -10, 0]} intensity={1.2} color="#fff5e0" />
                    </>
                )}

                {isEditor && viewMode !== 'firstPerson' && (
                    <Grid args={[20, 20]} cellColor="white" sectionColor="gray" infiniteGrid fadeDistance={50} position={[0, -0.01, 0]} />
                )}

                <RigidBody type="fixed" colliders="trimesh">
                    <Satellit viewMode={viewMode} rectAreaLights={rectAreaLights} />
                </RigidBody>

                <Suspense fallback={null}>
                    <PlacedArtworks viewerInstances={viewerInstances} isEditor={isEditor} />
                    <ModularWallsController viewerWalls={viewerWalls} isEditor={isEditor} />
                </Suspense>

                <FPVArtworkRaycaster isEditor={isEditor} />
            </FrameInstancerProvider>
        </ArtworkTextureProvider>
    );
};


