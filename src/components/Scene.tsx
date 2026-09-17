import { Suspense, useState } from 'react';
import { Satellit } from './Satellit';
import { PlacedArtworks } from './PlacedArtworks';
import { ModularWallsController } from './ModularWallsController';
import { PlannerCameraSystem } from './PlannerCameraSystem';
import { FPVArtworkRaycaster } from './FPVArtworkRaycaster';
import { ArtworkTextureProvider } from './ArtworkTextureProvider';
import { FrameInstancerProvider } from './FrameInstancer';
import { ShaderWarmup } from './ShaderWarmup';
import { WindowView } from './WindowView';
import { EditorGrid } from './EditorGrid';
import { useEditorStore, type ArtworkInstanceData, type ModularWallData } from '../store/editorStore';
import { useRenderQualitySettings } from '../hooks/use-render-quality';

interface SceneProps {
    isEditor?: boolean;
    viewerInstances?: ArtworkInstanceData[];
    viewerWalls?: ModularWallData[];
    /** Called once the shaders of the loaded room/artworks are compiled (ShaderWarmup). */
    onShadersReady?: () => void;
}

export const Scene = ({ isEditor = true, viewerInstances, viewerWalls, onShadersReady }: SceneProps) => {
    const plannerViewMode = useEditorStore(state => state.plannerViewMode);
    // 2D wall editor: the room and the floor grid make way for the open wall
    const wallEditorOpen = useEditorStore(state => isEditor && !!state.wallEditor);
    const { rectAreaLights } = useRenderQualitySettings();
    const [windowViewReady, setWindowViewReady] = useState(false);

    // In Viewer mode (not editor), always force First Person
    const viewMode = isEditor ? plannerViewMode : 'firstPerson';
    const showWindowView = viewMode === 'firstPerson';

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

                {isEditor && viewMode !== 'firstPerson' && !wallEditorOpen && (
                    <EditorGrid />
                )}

                {/* Room collider lives in physics/PhysicsWorld.tsx (RND-08: Rapier loads only for first person). */}
                <Satellit
                    viewMode={viewMode}
                    rectAreaLights={rectAreaLights}
                    clearGlass={showWindowView && windowViewReady}
                    hideGeometry={wallEditorOpen}
                />

                {/* Street outside the windows — first person only; loads when entering it. */}
                {showWindowView && (
                    <Suspense fallback={null}>
                        <WindowView onReadyChange={setWindowViewReady} />
                    </Suspense>
                )}

                <Suspense fallback={null}>
                    <PlacedArtworks viewerInstances={viewerInstances} isEditor={isEditor} />
                    <ModularWallsController viewerWalls={viewerWalls} isEditor={isEditor} />
                </Suspense>

                <FPVArtworkRaycaster isEditor={isEditor} />

                {/* Mounts together with the room (same Suspense boundary). */}
                <ShaderWarmup onDone={onShadersReady} />
            </FrameInstancerProvider>
        </ArtworkTextureProvider>
    );
};


