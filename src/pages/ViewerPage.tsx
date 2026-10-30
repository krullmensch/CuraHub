import { Suspense, useCallback, useEffect, useMemo, useState, lazy } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { useProgress, useGLTF, PerformanceMonitor } from '@react-three/drei';
import { SATELLIT_MODEL_URL } from '../lib/modelUrls';
import { CANVAS_SHADOWS, createRendererFactory } from '../lib/rendererBackend';
import { Scene } from '../components/Scene';
import { SceneReadySignal } from '../components/SceneReadySignal';
import { MainCanvasRegistrar } from '../components/MainCanvasRegistrar';
import { RenderQualityControl } from '../components/RenderQualityControl';
import { useRenderQualitySettings } from '../hooks/use-render-quality';
import { usePreparedRenderer } from '../hooks/use-prepared-renderer';
import { ArrowLeft, Hand } from 'lucide-react';
import type { ArtworkInstanceData, ModularWallData, ScaleFigureData } from '../store/editorStore';
import { BookViewerHost } from '../components/book/BookViewerHost';
import { useBookViewerStore } from '../store/bookViewerStore';
import { ArtworkInfoOverlay } from '../components/ArtworkInfoOverlay';
import { useArtworkLoadProgress } from '../lib/artworkLoadProgress';
import { PLAYER_EYE_HEIGHT } from '../lib/playerDimensions';
import { setLiveLocation } from '../lib/live/liveConnection';
import { VisitorCount } from '../components/live/PresenceAvatars';
import { ArButton, type PublicArInfo } from '../components/viewer/ArButton';
import { detectArPlatform } from '../lib/arExport/launch';
import { useTouchViewer } from '../lib/touch/touchMode';
import { isWalking, setTouchWalking, subscribeWalking } from '../lib/touch/walking';
import { touchInput } from '../lib/touch/touchInput';
import { TouchControls } from '../components/touch/TouchControls';
import { TouchTapHandler } from '../components/touch/TouchTapHandler';
import { TouchFov } from '../components/touch/TouchFov';
import { viewerFrameloop } from '../lib/touch/viewerFrameloop';
import { useEditorStore } from '../store/editorStore';
import { Grid } from 'ldrs/react';
import 'ldrs/react/Grid.css';

const MouseLeftIcon = ({ size = 20, color = "white" }: { size?: number, color?: string }) => (
    <svg
        width={size}
        height={size * 1.4}
        viewBox="0 0 20 28"
        fill="none"
        style={{ display: 'block' }}
    >
        <rect x="1" y="1" width="18" height="26" rx="9" stroke={color} strokeWidth="2"/>
        <path d="M10 1V11" stroke={color} strokeWidth="2"/>
        <path d="M1 11H19" stroke={color} strokeWidth="2"/>
        <path
            d="M10 1C5.02944 1 1 5.02944 1 10V11H10V1Z"
            fill={color}
            fillOpacity="0.4"
        />
    </svg>
);

interface ExhibitionData {
    exhibition: { id: number; title: string; slug: string };
    version: { id: number; comment: string; published_at: string | null };
    instances: ArtworkInstanceData[];
    walls: ModularWallData[];
    scaleFigures?: ScaleFigureData[];
    ar?: PublicArInfo;
}

// RND-08: physics (Rapier) + player live in a lazy chunk; the download starts on mount.
const loadPhysicsWorld = () => import('../components/physics/PhysicsWorld');

/** Never keep the door shut longer than this once the room itself is ready (slow or dead image). */
const TEXTURE_WAIT_TIMEOUT_MS = 30_000;
const PhysicsWorld = lazy(loadPhysicsWorld);

/** While the AR export is being prepared the public payload is re-fetched at this interval. */
const AR_POLL_MS = 15_000;

export const ViewerPage = () => {
    const { slug } = useParams<{ slug: string }>();
    // Stepped progress only: subscribing to the whole store re-rendered on every texture load
    // and could exceed React's nested-update limit (#185) with many cached textures.
    const progress = useProgress((s) => Math.floor(s.progress / 5) * 5);
    const [data, setData] = useState<ExhibitionData | null>(null);
    const [apiLoading, setApiLoading] = useState(true);
    // LOAD-07: true after the room model loaded and the first frame rendered. Artwork images
    // load progressively afterwards and no longer block entering the exhibition.
    const [roomReady, setRoomReady] = useState(false);
    // Shader programs of the room/artworks compiled (ShaderWarmup) — entering earlier froze the first frame.
    const [shadersReady, setShadersReady] = useState(false);
    // Every picture shows its first (lowest) texture tier — sharper ones load while walking.
    // Counted against the instances the API sent, so the wait also covers the ones whose
    // component hasn't mounted (and registered a texture) yet.
    const textures = useArtworkLoadProgress();
    const [textureWaitTimedOut, setTextureWaitTimedOut] = useState(false);
    const expectedPictures = useMemo(
        () => (data?.instances ?? []).filter((i) => !['video', 'model3d', 'splat'].includes(i.artwork?.asset?.type ?? '')).length,
        [data],
    );
    const texturesReady = textureWaitTimedOut || textures.settled >= expectedPictures;
    const sceneReady = roomReady && shadersReady && texturesReady;
    const [loading, setLoading] = useState(true);
    const [showLoading, setShowLoading] = useState(true);
    const bookOpen = useBookViewerStore((s) => s.book !== null);
    const [isLocked, setIsLocked] = useState(false);
    // Phones and tablets: two sticks and tap for info instead of pointer lock and crosshair.
    const touch = useTouchViewer();
    const [isTabVisible, setIsTabVisible] = useState(document.visibilityState === 'visible');
    const [error, setError] = useState<string | null>(null);
    const renderSettings = useRenderQualitySettings();
    // Antialiasing is a WebGL context attribute — fixed for the lifetime of this Canvas.
    // WebGPU with the classic WebGLRenderer as fallback. R3F sets ACES tone mapping and sRGB output.
    const preparedRenderer = usePreparedRenderer();
    const [antialias] = useState(renderSettings.antialias);
    const glConfig = useMemo(
        () => (preparedRenderer ? createRendererFactory(preparedRenderer, { antialias, toneMappingExposure: 1.1 }) : null),
        [preparedRenderer, antialias],
    );
    // RND-03 / RND-11: PerformanceMonitor drops the pixel ratio to 1 while frames are too slow.
    const [lowDpr, setLowDpr] = useState(false);
    const handleSceneReady = useCallback(() => setRoomReady(true), []);
    const handleShadersReady = useCallback(() => setShadersReady(true), []);

    // Track the walking state: pointer lock on desktop, the entered state in the touch viewer
    useEffect(() => {
        const handler = () => {
            const locked = isWalking();
            setIsLocked(locked);
            if (!locked && !loading) {
                // If we unlock and data is already ready, show the 'Ready' overlay again
                setShowLoading(true);
            }
        };
        return subscribeWalking(handler);
    }, [loading]);

    // Touch viewer: the page itself must never scroll or zoom under the fixed sticks and panels
    // (iOS: 100vh is the large viewport, double taps zoom).
    useEffect(() => {
        if (!touch) return;
        const root = document.documentElement;
        const prev = {
            overflow: root.style.overflow,
            overscroll: root.style.overscrollBehavior,
            touchAction: root.style.touchAction,
            bodyOverflow: document.body.style.overflow,
        };
        root.style.overflow = 'hidden';
        root.style.overscrollBehavior = 'none';
        root.style.touchAction = 'manipulation';
        document.body.style.overflow = 'hidden';
        return () => {
            root.style.overflow = prev.overflow;
            root.style.overscrollBehavior = prev.overscroll;
            root.style.touchAction = prev.touchAction;
            document.body.style.overflow = prev.bodyOverflow;
        };
    }, [touch]);

    // Leaving the viewer ends the touch walk (a later viewer starts at its entry overlay).
    useEffect(() => () => {
        setTouchWalking(false);
        touchInput.reset();
    }, []);

    const leaveTouchWalk = () => {
        touchInput.reset();
        useEditorStore.getState().setFpvHoveredInfo(null);
        setTouchWalking(false);
    };

    // A missing or very slow image must not lock the exhibition shut forever.
    useEffect(() => {
        if (!roomReady || texturesReady) return;
        const timer = setTimeout(() => setTextureWaitTimedOut(true), TEXTURE_WAIT_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [roomReady, texturesReady]);

    // Track tab visibility — stop rendering when the tab is backgrounded (RND-02)
    useEffect(() => {
        const handler = () => setIsTabVisible(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, []);

    // Preload the room and the monitor model used by placed videos. Moved off module scope so
    // importing these components no longer downloads them eagerly (LOAD-02). Picture frames are
    // generated in code, no model to load.
    useEffect(() => {
        useGLTF.preload(SATELLIT_MODEL_URL);
        useGLTF.preload('/models/Monitor65.glb');
        loadPhysicsWorld();
    }, []);

    useEffect(() => {
        if (!slug) {
            setError('Keine Ausstellung angegeben.');
            setApiLoading(false);
            return;
        }

        const fetchExhibition = async () => {
            try {
                const res = await fetch(`/public/exhibition/${slug}`);
                if (res.status === 404) {
                    const body = await res.json();
                    setError(body.error || 'Ausstellung nicht gefunden.');
                    return;
                }
                if (!res.ok) throw new Error('Fehler beim Laden der Ausstellung.');
                const json: ExhibitionData = await res.json();
                // Filter out instances with missing assets (same as editor mode)
                json.instances = json.instances.filter(i => i.artwork?.asset);
                setData(json);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unbekannter Fehler.');
            } finally {
                setApiLoading(false);
            }
        };

        fetchExhibition();
    }, [slug]);

    // Live: count this tab among the exhibition's visitors while it is open.
    const visitSlug = data?.exhibition.slug ?? null;
    useEffect(() => {
        if (!visitSlug) return;
        setLiveLocation({ t: 'visit', slug: visitSlug });
        return () => setLiveLocation(null);
    }, [visitSlug]);

    // Poll only the AR state while the export is queued/running; the scene itself stays untouched.
    const arStatus = data?.ar?.status;
    useEffect(() => {
        if (!slug || (arStatus !== 'queued' && arStatus !== 'running')) return;
        const timer = setInterval(async () => {
            try {
                const res = await fetch(`/public/exhibition/${slug}`);
                if (!res.ok) return;
                const json: ExhibitionData = await res.json();
                setData((prev) => (prev ? { ...prev, ar: json.ar } : prev));
            } catch {
                // next tick tries again
            }
        }, AR_POLL_MS);
        return () => clearInterval(timer);
    }, [slug, arStatus]);

    // ?ar=1 (QR code scan): big button on a phone — iOS needs a tap, no auto-launch.
    const arEntry = useMemo(
        () =>
            new URLSearchParams(window.location.search).get('ar') === '1' &&
            detectArPlatform(navigator.userAgent, navigator.maxTouchPoints) !== 'desktop',
        [],
    );

    // Handle the transition from loading to showing the scene
    useEffect(() => {
        if (!apiLoading && sceneReady && data) {
            // Room is loaded and rendering
            setLoading(false);

            // Only hide the overlay entirely once the user has clicked (locked)
            if (isLocked) {
                // Wait for the transition-opacity duration (400ms) plus a small buffer before removing from DOM
                const timer = setTimeout(() => setShowLoading(false), 500);
                return () => clearTimeout(timer);
            }
        } else if (error) {
            // If there's an error, hide loading immediately
            setLoading(false);
            setShowLoading(false);
        } else {
            // Still loading something
            setLoading(true);
            setShowLoading(true);
        }
    }, [apiLoading, sceneReady, data, error, isLocked]);

    if (error) {
        return (
            <div className="fixed inset-0 bg-neutral-950 flex flex-col items-center justify-center gap-6">
                <p className="text-white/80 text-lg">{error}</p>
                <Link to="/" className="text-white/50 hover:text-white text-sm flex items-center gap-2 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Zurück zur Startseite
                </Link>
            </div>
        );
    }

    // While the room loads: drei's loader progress. Afterwards: the artworks' first tier.
    const loadingPercent = roomReady && expectedPictures > 0
        ? (Math.min(textures.settled, expectedPictures) / expectedPictures) * 100
        : progress;

    // RND-02: render continuously only while the player is actually in the scene
    // (pointer-locked) and the tab is visible. Otherwise render on demand — the entry
    // overlay is static HTML on top of the canvas, not a reason to keep rendering.
    const frameloop = viewerFrameloop(isLocked, isTabVisible, bookOpen);

    return (
        <>
            {glConfig && (
                <Canvas
                    dpr={lowDpr ? [1, 1] : renderSettings.dpr}
                    frameloop={frameloop}
                    camera={{ position: [0, PLAYER_EYE_HEIGHT, 0], fov: 60 }}
                    style={{
                        width: '100vw',
                        height: '100vh',
                        ...(touch ? { position: 'fixed', inset: 0, height: '100dvh', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } : {}),
                    }}
                    gl={glConfig}
                    shadows={CANVAS_SHADOWS}
                >
                    <MainCanvasRegistrar />
                    {/* Frame timing is only meaningful with a continuous render loop. */}
                    {frameloop === 'always' && (
                        <PerformanceMonitor
                            flipflops={3}
                            onDecline={() => setLowDpr(true)}
                            onIncline={() => setLowDpr(false)}
                            onFallback={() => setLowDpr(true)}
                        />
                    )}
                    {data && (
                        <>
                            <Suspense fallback={null}>
                                <Scene
                                    isEditor={false}
                                    viewerInstances={data.instances}
                                    viewerWalls={data.walls}
                                    viewerScaleFigures={data.scaleFigures ?? []}
                                    onShadersReady={handleShadersReady}
                                />
                            </Suspense>
                            {/* Separate boundary: the room renders while Rapier still loads. PhysicsWorld
                                suspends until the room collider exists, so the player never spawns early;
                                SceneReadySignal fires after the first frame with the player in place. */}
                            {touch && <TouchTapHandler instances={data.instances} />}
                            {touch && <TouchFov />}
                            <Suspense fallback={null}>
                                <PhysicsWorld mode="viewer" viewerWalls={data.walls} viewerInstances={data.instances}>
                                    <SceneReadySignal onReady={handleSceneReady} />
                                </PhysicsWorld>
                            </Suspense>
                        </>
                    )}
                </Canvas>
            )}

            {/* FPV Crosshair + Artwork Info Overlay */}
            <ArtworkInfoOverlay touch={touch} />
            <BookViewerHost />

            {/* Touch viewer while walking: the sticks and a way back to the entry overlay (Esc on desktop). */}
            {touch && isLocked && !loading && (
                <>
                    <TouchControls />
                    <button
                        type="button"
                        aria-label="Zurück"
                        onClick={leaveTouchWalk}
                        className="fixed z-[1010] p-2.5 rounded-lg text-white/80 bg-black/25 border border-white/20 backdrop-blur-sm"
                        style={{ top: 'calc(env(safe-area-inset-top) + 16px)', left: 'calc(env(safe-area-inset-left) + 16px)' }}
                    >
                        <ArrowLeft size={18} />
                    </button>
                </>
            )}

            {/* Exhibition title overlay */}
            {data?.exhibition.title && (
                <div className={`fixed top-6 z-20 pointer-events-none select-none ${touch && isLocked ? 'left-20' : 'left-6'}`}>
                    <h1
                        className={`text-white font-bold tracking-tight drop-shadow-xl ${touch ? 'text-xl max-w-[45vw]' : 'text-3xl'}`}
                        style={{ fontFamily: '"Funnel Display", sans-serif' }}
                    >
                        {data.exhibition.title}
                    </h1>
                </div>
            )}

            {/* Top-right nav button */}
            {/* Above the entry overlay (z-[1000]) — it comes back on Escape and swallowed the click. */}
            {/* Touch viewer while walking: only the AR button stays, so the row never covers the back button. */}
            <div className={`fixed top-4 right-4 sm:top-6 sm:right-6 z-[1010] flex items-center justify-end gap-2 sm:gap-3 ${touch && isLocked ? 'left-20' : 'left-4 sm:left-auto'}`}>
                {!(touch && isLocked) && <VisitorCount />}
                {data && <ArButton ar={data.ar} slug={data.exhibition.slug} title={data.exhibition.title} />}
                {!(touch && isLocked) && <button
                    onClick={() => window.open('/exhibitions', '_blank')}
                    className="whitespace-nowrap text-white/70 hover:text-white text-xs sm:text-sm font-medium uppercase tracking-[0.1em] sm:tracking-[0.15em] bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 backdrop-blur-sm px-3 sm:px-4 py-2 rounded-lg transition-all duration-200"
                >
                    Ausstellungen
                </button>}
            </div>

            {/* ?ar=1 phone entry: above the loading overlay, so the tap is not taken as „enter". */}
            {arEntry && data && (
                <div className="fixed inset-x-0 bottom-16 z-[1010] flex justify-center px-6">
                    <ArButton ar={data.ar} slug={data.exhibition.slug} title={data.exhibition.title} large label="In AR öffnen" />
                </div>
            )}

            {/* Fading Loading Overlay (Unifies API and Asset loading) */}
            {showLoading && !bookOpen && (
                <div
                    className={`fixed inset-0 z-[1000] bg-black/30 backdrop-blur-sm flex flex-col items-center justify-center transition-opacity duration-400 ease-in-out ${
                        !loading && isLocked ? 'opacity-0 pointer-events-none' : 'opacity-100 cursor-pointer'
                    }`}
                    onClick={() => {
                        if (!loading && !isLocked) {
                            if (touch) setTouchWalking(true);
                            else document.querySelector('canvas')?.requestPointerLock();
                        }
                    }}
                >
                    <div className="flex flex-col items-center gap-8">
                        {/* Icon Container with shared Glow */}
                        <div className="relative flex items-center justify-center">
                            <div className="absolute inset-0 bg-white/10 blur-3xl rounded-full animate-pulse scale-150" />

                            <div className="relative">
                                {loading ? (
                                    <div className="animate-in fade-in duration-500">
                                        <Grid size="60" speed="1.5" color="white" />
                                    </div>
                                ) : !isLocked ? (
                                    <div className="animate-in fade-in zoom-in duration-500 bg-white/5 border border-white/10 backdrop-blur-md p-8 rounded-full">
                                        {touch ? <Hand size={42} color="white" /> : <MouseLeftIcon size={42} color="white" />}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {/* Text and Progress Container */}
                        <div className="flex flex-col items-center gap-4 text-center px-6">
                            {loading ? (
                                <>
                                    {loadingPercent > 0 && loadingPercent < 100 && (
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-white transition-all duration-300 ease-out"
                                                    style={{ width: `${loadingPercent}%` }}
                                                />
                                            </div>
                                            <p className="text-white/60 text-[10px] uppercase tracking-[0.2em] font-medium">
                                                {Math.round(loadingPercent)}%
                                            </p>
                                        </div>
                                    )}
                                    <p className="text-white/60 text-[11px] uppercase tracking-[0.3em] font-medium animate-pulse">
                                        {apiLoading ? 'Initialisierung' : roomReady && !texturesReady ? 'Bilder werden geladen' : 'Asset-Synchronisation'}
                                    </p>
                                </>
                            ) : !isLocked ? (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
                                    <h2
                                        className="text-white text-4xl font-bold max-w-2xl"
                                        style={{ fontFamily: '"Funnel Display", sans-serif' }}
                                    >
                                        {data?.exhibition.title}
                                    </h2>
                                    <p className="text-white/60 text-sm uppercase tracking-[0.4em] font-bold mt-4">
                                        {touch ? 'Tippen zum Betreten' : 'Klicken zum Betreten'}
                                    </p>
                                    {/* Choosing the quality must not enter the exhibition */}
                                    <div
                                        className="mt-8 flex justify-center cursor-default"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <RenderQualityControl className="flex-wrap justify-center gap-x-4 gap-y-2" />
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

