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
import { WallEditorRoomFace } from './wall-editor/WallEditorRoomFace';
import { ScaleFigures } from './ScaleFigures';
import { WallMeasurements3D } from './WallMeasurements3D';
import { RoomCutawayTracker } from './RoomCutawayTracker';
import { useEditorStore, type ArtworkInstanceData, type ModularWallData, type ScaleFigureData } from '../store/editorStore';
import { useRenderQualitySettings } from '../hooks/use-render-quality';
import { useExportMode } from '../lib/arExport/exportMode';
import { ExportPart } from './arExport/ExportPart';
import { roomLightRig } from '../lib/roomLighting';
import { RoomAmbientOcclusion } from './RoomAmbientOcclusion';

interface SceneProps {
    isEditor?: boolean;
    viewerInstances?: ArtworkInstanceData[];
    viewerWalls?: ModularWallData[];
    /** Viewer: public scale figures of the published version. */
    viewerScaleFigures?: ScaleFigureData[];
    /** Called once the shaders of the loaded room/artworks are compiled (ShaderWarmup). */
    onShadersReady?: () => void;
    /** Without the Satellit room (mobile planner's single-artwork AR model). */
    roomless?: boolean;
}

export const Scene = ({ isEditor = true, viewerInstances, viewerWalls, viewerScaleFigures, onShadersReady, roomless = false }: SceneProps) => {
    const plannerViewMode = useEditorStore(state => state.plannerViewMode);
    // 2D wall editor: the room and the floor grid make way for the open wall
    const wallEditorOpen = useEditorStore(state => isEditor && !!state.wallEditor);
    const { rectAreaLights } = useRenderQualitySettings();
    const lightRig = roomLightRig(rectAreaLights);
    const [windowViewReady, setWindowViewReady] = useState(false);
    // AR export page: no camera system, player, street view, info raycast or shader warmup.
    const exportMode = useExportMode().active;
    const mobilePlanner = useEditorStore(state => state.mobilePlanner);

    // In Viewer mode (not editor), always force First Person. The AR export takes the orbit
    // view's room: no ceiling (a model seen from outside), no street behind the windows.
    const viewMode = isEditor ? plannerViewMode : exportMode ? 'perspective' : 'firstPerson';
    const showWindowView = viewMode === 'firstPerson';

    return (
        <ArtworkTextureProvider>
            <FrameInstancerProvider>
                {/* Only use Planner Camera System in Editor Mode */}
                {isEditor && <PlannerCameraSystem />}

                {/* Room light rig (lib/roomLighting.ts): little directionless light, a key light from
                    the window wall and a weak counter light, so wall corners and edges read. RND-04:
                    the "low" preset has no ceiling RectAreaLights (Satellit), a hemisphere light instead. */}
                <ambientLight intensity={lightRig.ambient} />
                {lightRig.hemisphere && (
                    <hemisphereLight args={[lightRig.hemisphere.sky, lightRig.hemisphere.ground, lightRig.hemisphere.intensity]} />
                )}
                {lightRig.directional.map((light, i) => (
                    <directionalLight key={i} position={light.position} intensity={light.intensity} color={light.color} />
                ))}

                {/* Soft corner darkening (GTAO, WebGPU, "Hoch"); renders the frame while on. */}
                {!exportMode && <RoomAmbientOcclusion />}

                {isEditor && viewMode !== 'firstPerson' && !wallEditorOpen && (
                    <EditorGrid />
                )}

                {/* Room collider lives in physics/PhysicsWorld.tsx (RND-08: Rapier loads only for first person). */}
                {!roomless && (
                    <Satellit
                        viewMode={viewMode}
                        rectAreaLights={rectAreaLights}
                        clearGlass={showWindowView && windowViewReady}
                        hideGeometry={wallEditorOpen}
                        publishWallFaces={isEditor}
                    />
                )}

                {/* Orbit view: room walls on the camera side cut away (toolbar toggle) */}
                {isEditor && <RoomCutawayTracker />}

                {/* 2D wall editor: the open room wall, drawn on its own */}
                {isEditor && <WallEditorRoomFace />}

                {/* Hanging line, heights above floor and gaps on the walls (orbit view only) */}
                {/* Phone planning view: no hanging lines or distances */}
                {isEditor && !mobilePlanner && <WallMeasurements3D />}

                {/* Street outside the windows — first person only; loads when entering it. */}
                {showWindowView && (
                    <Suspense fallback={null}>
                        <WindowView onReadyChange={setWindowViewReady} />
                    </Suspense>
                )}

                {/* A plain Suspense boundary, except on the AR export page (reports when it loaded). */}
                <ExportPart part="walls">
                    <PlacedArtworks viewerInstances={viewerInstances} isEditor={isEditor} />
                    <ModularWallsController viewerWalls={viewerWalls} isEditor={isEditor} />
                </ExportPart>

                {/* Own boundary: the figure model doesn't hold back the artworks. The viewer
                    only loads it when the version has public figures. */}
                {(isEditor || (viewerScaleFigures && viewerScaleFigures.length > 0)) && (
                    <ExportPart part="figures">
                        <ScaleFigures viewerFigures={viewerScaleFigures} isEditor={isEditor} />
                    </ExportPart>
                )}

                {!exportMode && <FPVArtworkRaycaster isEditor={isEditor} instances={viewerInstances} />}

                {/* Mounts together with the room (same Suspense boundary). */}
                {!exportMode && <ShaderWarmup onDone={onShadersReady} />}
            </FrameInstancerProvider>
        </ArtworkTextureProvider>
    );
};


