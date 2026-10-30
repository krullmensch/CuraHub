import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as THREE from 'three';
import { useParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { CANVAS_SHADOWS, createRendererFactory } from '../lib/rendererBackend';
import { Scene } from '../components/Scene';
import { ExportPart } from '../components/arExport/ExportPart';
import { ExportErrorBoundary } from '../components/arExport/ExportErrorBoundary';
import { hasWebGL } from '../lib/arExport/webglSupport';
import { ExportModeContext, ExportSession, readExportParams, type ExportModeValue } from '../lib/arExport/exportMode';
import { useSettledExport } from '../components/arExport/useSettledExport';
import { prepareExportScene } from '../lib/arExport/prepareScene';
import { exportScene } from '../lib/arExport/exportScene';
import { type ArtworkInstanceData, type ModularWallData, type ScaleFigureData } from '../store/editorStore';
import { PLAYER_EYE_HEIGHT } from '../lib/playerDimensions';

// AR export page, opened by the server's export job in headless Chromium:
// /ar-export/:versionId?maxTexture=2048#token=…
// Renders the version with the viewer's components in export mode, waits until everything has
// loaded, flattens the scene and uploads GLB + USDZ. The job fails fast only on console errors
// carrying FATAL — a work that fails to load is no such error, it is counted as skipped.

const FATAL = '[ar-export]';

interface SceneData {
    instances: ArtworkInstanceData[];
    walls: ModularWallData[];
    scaleFigures?: ScaleFigureData[];
}

function fatal(err: unknown): void {
    console.error(FATAL, err);
}

interface RunnerProps {
    session: ExportSession;
    versionId: string;
    token: string;
    maxTexture: number;
}

/** Inside the Canvas: waits until the scene has settled, then exports and uploads once. */
const ExportRunner = ({ session, versionId, token, maxTexture }: RunnerProps) => {
    const run = useCallback(async (_deadline: boolean, skipped: Set<number>, scene: THREE.Scene) => {
        const prepared = prepareExportScene(scene, { maxTexture });
        const { glb, usdz } = await exportScene(prepared);
        const form = new FormData();
        form.append('glb', glb, `${versionId}.glb`);
        form.append('usdz', usdz, `${versionId}.usdz`);
        form.append('skipped', String(skipped.size));
        const res = await fetch(`/api/ar-export/${versionId}/files`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        });
        if (!res.ok) throw new Error(`Upload abgelehnt (HTTP ${res.status})`);
        console.info(`AR-Export hochgeladen: GLB ${glb.size} B, USDZ ${usdz.size} B, ${skipped.size} ausgelassen`);
    }, [versionId, token, maxTexture]);

    useSettledExport(session, run, fatal, { requireRoom: true });
    return null;
};

export const ArExportPage = () => {
    const { versionId } = useParams<{ versionId: string }>();
    const [{ token, maxTexture }] = useState(() => readExportParams(window.location.search, window.location.hash));
    const session = useMemo(() => new ExportSession(), []);
    const [data, setData] = useState<SceneData | null>(null);
    const exportMode = useMemo<ExportModeValue>(() => ({ active: true, maxTexture, session }), [maxTexture, session]);
    const glConfig = useMemo(
        () => createRendererFactory({ backend: 'webgl' }, { antialias: false, toneMappingExposure: 1.1 }),
        [],
    );

    // The token must not stay in the address (history, anything reading location later).
    useEffect(() => {
        if (window.location.hash) {
            window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
        }
    }, []);

    useEffect(() => {
        const meta = document.createElement('meta');
        meta.name = 'robots';
        meta.content = 'noindex';
        document.head.appendChild(meta);
        return () => meta.remove();
    }, []);

    // R3F creates the renderer inside an un-awaited async configure(), so a failing gl factory
    // never reaches the error boundary; it only shows up here.
    useEffect(() => {
        const onRejection = (e: PromiseRejectionEvent) => fatal(e.reason);
        const onError = (e: ErrorEvent) => fatal(e.error ?? e.message);
        window.addEventListener('unhandledrejection', onRejection);
        window.addEventListener('error', onError);
        return () => {
            window.removeEventListener('unhandledrejection', onRejection);
            window.removeEventListener('error', onError);
        };
    }, []);

    useEffect(() => {
        session.setFatalHandler(fatal);
        return () => session.setFatalHandler(null);
    }, [session]);

    useEffect(() => {
        if (!token || !versionId) return;
        let cancelled = false;
        (async () => {
            const res = await fetch(`/api/ar-export/${versionId}/scene`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`Szene nicht geladen (HTTP ${res.status})`);
            const json = (await res.json()) as SceneData;
            if (cancelled) return;
            // Same filter as the viewer: instances whose asset is gone are not drawn.
            setData({ ...json, instances: json.instances.filter((i) => i.artwork?.asset) });
        })().catch(fatal);
        return () => {
            cancelled = true;
        };
    }, [token, versionId]);

    const webgl = useMemo(() => hasWebGL(), []);
    useEffect(() => {
        if (!webgl && token && versionId) fatal('WebGL nicht verfügbar');
    }, [webgl, token, versionId]);

    if (!token || !versionId || !webgl) return null;

    return data && (
        <ExportErrorBoundary onError={fatal}>
            <Canvas
                dpr={1}
                frameloop="demand"
                camera={{ position: [0, PLAYER_EYE_HEIGHT, 0], fov: 60 }}
                style={{ width: 256, height: 256 }}
                gl={glConfig}
                shadows={CANVAS_SHADOWS}
            >
                <ExportModeContext.Provider value={exportMode}>
                    <ExportPart part="room">
                        <Scene
                            isEditor={false}
                            viewerInstances={data.instances}
                            viewerWalls={data.walls}
                            viewerScaleFigures={data.scaleFigures ?? []}
                        />
                    </ExportPart>
                    <ExportRunner session={session} versionId={versionId} token={token} maxTexture={maxTexture} />
                </ExportModeContext.Provider>
            </Canvas>
        </ExportErrorBoundary>
    );
};

export default ArExportPage;
