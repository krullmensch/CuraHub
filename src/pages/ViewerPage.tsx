import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { Scene } from '../components/Scene';
import { Player } from '../components/Player';
import { ArrowLeft } from 'lucide-react';
import type { ArtworkInstanceData, ModularWallData } from '../store/editorStore';
import { ArtworkInfoOverlay } from '../components/ArtworkInfoOverlay';

import * as THREE from 'three';

interface ExhibitionData {
    exhibition: { id: number; title: string; slug: string };
    version: { id: number; comment: string; published_at: string | null };
    instances: ArtworkInstanceData[];
    walls: ModularWallData[];
}

export const ViewerPage = () => {
    const { slug } = useParams<{ slug: string }>();
    const [data, setData] = useState<ExhibitionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!slug) {
            setError('Keine Ausstellung angegeben.');
            setLoading(false);
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
                setLoading(false);
            }
        };

        fetchExhibition();
    }, [slug]);

    if (loading) {
        return (
            <div className="fixed inset-0 bg-neutral-950 flex flex-col items-center justify-center gap-4">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <p className="text-white/60 text-sm tracking-wide">Ausstellung wird geladen…</p>
            </div>
        );
    }

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
                    <Scene
                        isEditor={false}
                        viewerInstances={data!.instances}
                        viewerWalls={data!.walls}
                    />
                    <Player />
                </Physics>
            </Canvas>
            <Loader />

            {/* FPV Crosshair + Artwork Info Overlay */}
            <ArtworkInfoOverlay />

            {/* Exhibition title overlay */}
            {data?.exhibition.title && (
                <div className="fixed top-4 left-4 z-20 pointer-events-none">
                    <p className="text-white/70 text-sm font-medium tracking-wide drop-shadow-lg">
                        {data.exhibition.title}
                    </p>
                </div>
            )}
        </>
    );
};
