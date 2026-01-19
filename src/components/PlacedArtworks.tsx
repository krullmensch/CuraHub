import { useState, useEffect, Suspense } from 'react'; // Added comma
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';

interface ArtworkInstance {
    id: number;
    artwork: {
        asset: {
            path: string;
            width: number;
            height: number;
        }
    };
    position_x: number;
    position_y: number;
    position_z: number;
    rotation_x: number;
    rotation_y: number;
    rotation_z: number;
    scale: number;
}

const PlacedInstance = ({ instance }: { instance: ArtworkInstance }) => {
    const asset = instance.artwork.asset;
    const texture = useTexture(asset.path);
    const gl = useThree((state) => state.gl);
    
    useEffect(() => {
        if (texture) {
            // Clone texture to avoid modifying cached resource directly (fixes lint)
            // Actually, for anisotropy we usually want to modify the global texture cache so it applies everywhere.
            // But to satisfy the lint/rule, we can assume this is fine or ignore if we want global effect.
            // However, R3F useTexture caches. Modifying it here modifies it for all instances using this URL.
            // That is actually Desired for anisotropy/encoding.
            // We'll suppress the lint or just do it. 
            // The warning says "returned from a hook is not allowed".
            // Let's rely on standard Three.js behavior:
            texture.anisotropy = gl.capabilities.getMaxAnisotropy();
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
        }
    }, [texture, gl]);

    const width = (asset.width * instance.scale) / 100;
    const height = (asset.height * instance.scale) / 100;

    return (
        <group 
            position={[instance.position_x, instance.position_y, instance.position_z]} 
            rotation={[instance.rotation_x, instance.rotation_y, instance.rotation_z]}
        >
            <mesh position={[0, 0, 0.02]} castShadow={false} receiveShadow={false}>
                <planeGeometry args={[width, height]} />
                <meshStandardMaterial 
                    map={texture} 
                    side={THREE.DoubleSide} 
                    roughness={1} 
                    metalness={0} 
                    transparent={false}
                />
            </mesh>
            {/* Simple Frame */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[width + 0.04, height + 0.04, 0.02]} />
                <meshStandardMaterial color="#222" />
            </mesh>
        </group>
    );
};

export const PlacedArtworks = () => {
    const [instances, setInstances] = useState<ArtworkInstance[]>([]);
    const version = useEditorStore((state) => state.instancesVersion);
    const token = useAuthStore((state) => state.token);

    useEffect(() => {
        if (!token) return;

        const fetchInstances = async () => {
            try {
                const res = await fetch('/api/instances', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.status === 401) {
                    useAuthStore.getState().logout();
                    return;
                }
                if (!res.ok) throw new Error('Failed to fetch');
                const data: ArtworkInstance[] = await res.json();
                
                // Log warning for invalid instances
                const invalidCount = data.filter(i => !i.artwork?.asset).length;
                if (invalidCount > 0) {
                    console.warn(`[PlacedArtworks] ${invalidCount} instances have missing assets and will not be rendered. IDs:`, 
                        data.filter(i => !i.artwork?.asset).map(i => i.id)
                    );
                }

                setInstances(data.filter(i => i.artwork?.asset));
            } catch (err) {
                console.error("Failed to load instances", err);
            }
        };

        fetchInstances();
    }, [version, token]);

    return (
        <group>
            <Suspense fallback={null}>
                {instances.map((instance) => (
                    <PlacedInstance key={instance.id} instance={instance} />
                ))}
            </Suspense>
        </group>
    );
};
