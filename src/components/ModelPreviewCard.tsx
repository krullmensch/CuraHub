import { useState, useRef, useEffect, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Center, Environment } from '@react-three/drei';
import { Box, Loader2 } from 'lucide-react';
import * as THREE from 'three';

interface ModelPreviewCardProps {
    url: string;
    compact?: boolean;
}

function AutoRotate({ children }: { children: React.ReactNode }) {
    const groupRef = useRef<THREE.Group>(null);

    useFrame((_, delta) => {
        if (groupRef.current) {
            groupRef.current.rotation.y += delta * 0.4;
        }
    });

    return <group ref={groupRef}>{children}</group>;
}

function PreviewModel({ url }: { url: string }) {
    const { scene } = useGLTF(url);

    const clonedScene = useMemo(() => {
        const clone = scene.clone(true);
        clone.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
            }
        });
        return clone;
    }, [scene]);

    return (
        <Center>
            <primitive object={clonedScene} />
        </Center>
    );
}

function FallbackSpinner() {
    return (
        <div className="flex items-center justify-center w-full h-full">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
        </div>
    );
}

export function ModelPreviewCard({ url, compact = false }: ModelPreviewCardProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);

    // IntersectionObserver — mount canvas when card scrolls into view
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => setIsVisible(entry.isIntersecting),
            { threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Preload the model
    useEffect(() => {
        useGLTF.preload(url);
    }, [url]);

    // Show canvas when visible (or keep it if it already loaded once)
    const showCanvas = isVisible || hasLoaded;

    // Once loaded, keep it alive to avoid re-loading on scroll
    useEffect(() => {
        if (isVisible && !hasLoaded) {
            setHasLoaded(true);
        }
    }, [isVisible, hasLoaded]);

    const iconSize = compact ? 'h-8 w-8' : 'h-12 w-12';

    return (
        <div
            ref={containerRef}
            className="flex flex-col items-center justify-center gap-1 w-full h-full"
        >
            {showCanvas ? (
                <Suspense fallback={<FallbackSpinner />}>
                    <Canvas
                        dpr={compact ? [1, 1] : [1, 1.5]}
                        style={{ width: '100%', height: '100%' }}
                        camera={{ fov: 45, near: 0.01, far: 100, position: [0, 0.5, 2] }}
                        gl={{ antialias: true, alpha: true }}
                    >
                        <ambientLight intensity={1.0} />
                        <directionalLight position={[2, 3, 4]} intensity={1.2} />
                        <Environment preset="warehouse" background={false} environmentIntensity={0.3} />
                        <Suspense fallback={null}>
                            <AutoRotate>
                                <PreviewModel url={url} />
                            </AutoRotate>
                        </Suspense>
                    </Canvas>
                </Suspense>
            ) : (
                <Box className={`${iconSize} text-purple-400`} />
            )}
        </div>
    );
}
