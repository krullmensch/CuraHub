import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { Loader, useProgress } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { Scene } from '../components/Scene';
import { Player } from '../components/Player';
import { ArrowLeft } from 'lucide-react';
import type { ArtworkInstanceData, ModularWallData } from '../store/editorStore';
import { ArtworkInfoOverlay } from '../components/ArtworkInfoOverlay';
import { Grid } from 'ldrs/react';
import 'ldrs/react/Grid.css';
import * as THREE from 'three';

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
}

export const ViewerPage = () => {
    const { slug } = useParams<{ slug: string }>();
    const { progress, active } = useProgress();
    const [data, setData] = useState<ExhibitionData | null>(null);
    const [apiLoading, setApiLoading] = useState(true);
    const [loading, setLoading] = useState(true);
    const [showLoading, setShowLoading] = useState(true);
    const [isLocked, setIsLocked] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Track pointer lock state
    useEffect(() => {
        const handler = () => {
            const locked = !!document.pointerLockElement;
            setIsLocked(locked);
            if (!locked && !loading) {
                // If we unlock and data is already ready, show the 'Ready' overlay again
                setShowLoading(true);
            }
        };
        document.addEventListener('pointerlockchange', handler);
        return () => document.removeEventListener('pointerlockchange', handler);
    }, [loading]);

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

    // Handle the transition from loading to showing the scene
    useEffect(() => {
        // We are ready when API is done AND assets are loaded (or none to load)
        const assetsReady = !active && (progress === 100 || progress === 0);
        
        if (!apiLoading && assetsReady && data) {
            // Assets and API are done
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
    }, [apiLoading, active, progress, data, error, isLocked]);

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

    return (
        <>
            <Canvas
                shadows
                camera={{ position: [0, 1.7, 0], fov: 60 }}
                style={{ width: '100vw', height: '100vh' }}
                gl={{
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.1,
                    outputColorSpace: THREE.SRGBColorSpace,
                }}
            >
                <Physics gravity={[0, -9.81, 0]}>
                    {data && (
                        <Scene
                            isEditor={false}
                            viewerInstances={data.instances}
                            viewerWalls={data.walls}
                        />
                    )}
                    <Player />
                </Physics>
            </Canvas>

            {/* FPV Crosshair + Artwork Info Overlay */}
            <ArtworkInfoOverlay />

            {/* Exhibition title overlay */}
            {data?.exhibition.title && (
                <div className="fixed top-6 left-6 z-20 pointer-events-none select-none">
                    <h1 
                        className="text-white text-3xl font-bold tracking-tight drop-shadow-xl" 
                        style={{ fontFamily: '"Funnel Display", sans-serif' }}
                    >
                        {data.exhibition.title}
                    </h1>
                </div>
            )}

            {/* Fading Loading Overlay (Unifies API and Asset loading) */}
            {showLoading && (
                <div 
                    className={`fixed inset-0 z-[1000] bg-black/30 backdrop-blur-sm flex flex-col items-center justify-center transition-opacity duration-400 ease-in-out ${
                        !loading && isLocked ? 'opacity-0 pointer-events-none' : 'opacity-100 cursor-pointer'
                    }`}
                    onClick={() => {
                        if (!loading && !isLocked) {
                            document.querySelector('canvas')?.requestPointerLock();
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
                                        <MouseLeftIcon size={42} color="white" />
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {/* Text and Progress Container */}
                        <div className="flex flex-col items-center gap-4 text-center px-6">
                            {loading ? (
                                <>
                                    {progress > 0 && progress < 100 && (
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-white transition-all duration-300 ease-out"
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                            <p className="text-white/40 text-[10px] uppercase tracking-[0.2em] font-medium">
                                                {Math.round(progress)}%
                                            </p>
                                        </div>
                                    )}
                                    <p className="text-white/40 text-[11px] uppercase tracking-[0.3em] font-medium animate-pulse">
                                        {apiLoading ? 'Initialisierung' : 'Asset-Synchronisation'}
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
                                        Klicken zum Betreten
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

