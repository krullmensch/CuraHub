import { forwardRef, useEffect, useRef, useMemo, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useEditorStore, videoRefMap, WALL_PLACEMENT_OFFSET, type ArtworkInstanceData } from '../store/editorStore';

// Preload the monitor GLB so the first Monitor placement doesn't stall the main scene.
useGLTF.preload('/models/Monitor65.glb');

interface VideoInstanceProps {
    instance: ArtworkInstanceData;
    selected: boolean;
    isEditor?: boolean;
}

export const VideoInstance = forwardRef<THREE.Group, VideoInstanceProps>(
    ({ instance, selected, isEditor = true }, ref) => {
        const asset = instance.artwork.asset;
        const selectInstance = useEditorStore((state) => state.selectInstance);
        const gl = useThree((state) => state.gl);
        const [muted, setMuted] = useState(true);

        // DPI-based sizing (same as SelectableInstance) — used as the base unit before user scale
        const dpi = asset.dpi || 72;
        const width = (asset.width / dpi) * 0.0254;
        const height = (asset.height / dpi) * 0.0254;

        // Tracks the live aspect ratio of the actual decoded video. videoWidth/videoHeight are
        // 0 until the loadedmetadata event fires, so the value is null until then.
        const [videoAspect, setVideoAspect] = useState<number | null>(null);

        // Create a dedicated video element and texture per instance
        const { video, texture } = useMemo(() => {
            const vid = document.createElement('video');
            vid.src = asset.path;
            vid.crossOrigin = 'anonymous';
            vid.loop = true;
            vid.muted = true;
            vid.playsInline = true;
            vid.preload = 'auto';

            const tex = new THREE.VideoTexture(vid);
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4; // updated in effect with actual max

            return { video: vid, texture: tex };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [instance.id]);

        // Read the actual video aspect once metadata is available.
        useEffect(() => {
            const onMeta = () => {
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                    setVideoAspect(video.videoWidth / video.videoHeight);
                }
            };
            video.addEventListener('loadedmetadata', onMeta);
            if (video.videoWidth > 0) onMeta();
            return () => video.removeEventListener('loadedmetadata', onMeta);
        }, [video]);

        // Track the material we attach to the Monitor's VideoScreen mesh so we can dispose it.
        const screenMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);

        // Set max anisotropy, autoplay in viewer mode, and clean up on unmount
        useEffect(() => {
            texture.anisotropy = gl.capabilities.getMaxAnisotropy();
            if (!isEditor) {
                video.play().catch(() => {/* autoplay blocked, user interaction required */ });
            }
            return () => {
                video.pause();
                video.removeAttribute('src');
                video.load();
                texture.dispose();
                screenMaterialRef.current?.dispose();
                screenMaterialRef.current = null;
            };
        }, [video, texture, gl, isEditor]);

        // Register in videoRefMap for PropertiesPanel control
        useEffect(() => {
            videoRefMap.set(instance.id, video);
            return () => { videoRefMap.delete(instance.id); };
        }, [video, instance.id]);

        // Sync muted state — also listen for external changes via videoRefMap
        useEffect(() => {
            video.muted = muted;
        }, [muted, video]);

        useEffect(() => {
            const onVolumeChange = () => setMuted(video.muted);
            video.addEventListener('volumechange', onVolumeChange);
            return () => video.removeEventListener('volumechange', onVolumeChange);
        }, [video]);

        // Use requestVideoFrameCallback to only upload texture when a new decoded frame is ready
        const hasNewFrame = useRef(false);
        const frameCounter = useRef(0);

        useEffect(() => {
            const vid = video as HTMLVideoElement & {
                requestVideoFrameCallback(cb: () => void): number;
                cancelVideoFrameCallback(handle: number): void;
            };
            if ('requestVideoFrameCallback' in vid) {
                let handle: number;
                const onFrame = () => {
                    hasNewFrame.current = true;
                    handle = vid.requestVideoFrameCallback(onFrame);
                };
                handle = vid.requestVideoFrameCallback(onFrame);
                return () => vid.cancelVideoFrameCallback(handle);
            }
            return undefined;
        }, [video]);

        useFrame(() => {
            if (video.paused || video.readyState < 2) return;

            if ('requestVideoFrameCallback' in video) {
                if (hasNewFrame.current) {
                    texture.needsUpdate = true;
                    hasNewFrame.current = false;
                }
            } else {
                // Fallback: update every 2nd frame (~30fps at 60fps render)
                frameCounter.current++;
                if (frameCounter.current % 2 === 0) {
                    texture.needsUpdate = true;
                }
            }
        });

        const handleClick = (e: ThreeEvent<MouseEvent>) => {
            if (!isEditor) return;
            e.stopPropagation();
            selectInstance(instance.id);
        };

        const handleDoubleClick = (e: ThreeEvent<MouseEvent>) => {
            if (!isEditor) return;
            e.stopPropagation();
            setMuted(prev => !prev);
        };

        const medium = instance.medium || 'display';
        const isPortrait = videoAspect !== null && videoAspect < 1;

        // Monitor branch: load Monitor65.glb and map the video texture onto the VideoScreen mesh.
        // useGLTF is always called (rules of hooks) — the result is only mounted when medium === 'monitor'.
        const { scene: monitorGltfScene } = useGLTF('/models/Monitor65.glb');
        const { monitorScene, monitorMaxZ } = useMemo(() => {
            const cloned = monitorGltfScene.clone(true);
            cloned.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    if (mesh.name === 'Display') {
                        const mat = new THREE.MeshBasicMaterial({
                            map: texture,
                            toneMapped: false,
                            side: THREE.FrontSide,
                        });
                        mesh.material = mat;
                        screenMaterialRef.current = mat;
                    }
                }
            });
            // Compute the unrotated BB so we know how far the monitor extends along its
            // local +Z. After the [0, π, 0] rotation applied to the wrapper group, that
            // +Z becomes -Z and would push the back of the model into the wall. We use
            // bbox.max.z to translate the wrapper back out so the rotated back face sits
            // flush with the wall surface (see <group position-z below).
            cloned.updateMatrixWorld(true);
            const bbox = new THREE.Box3().setFromObject(cloned);
            return { monitorScene: cloned, monitorMaxZ: bbox.max.z };
        }, [monitorGltfScene, texture]);

        // Beamer branch: derive the plane size from the live video aspect (fall back to asset metadata, then 16:9).
        const beamerAspect = videoAspect ?? (asset.width && asset.height ? asset.width / asset.height : 16 / 9);
        const beamerHeight = height;
        const beamerWidth = beamerAspect * beamerHeight;

        // Medium-specific styling
        const getFrameProps = () => {
            switch (medium) {
                case 'projector':
                    return {
                        color: selected ? '#3b82f6' : '#111',
                        emissive: selected ? '#1d4ed8' : '#334155',
                        emissiveIntensity: selected ? 0.5 : 0.15,
                        frameSize: 0.01,
                    };
                case 'display':
                    return {
                        color: selected ? '#3b82f6' : '#111',
                        emissive: selected ? '#1d4ed8' : '#000000',
                        emissiveIntensity: selected ? 0.5 : 0,
                        frameSize: 0.03,
                    };
                default: // frame
                    return {
                        color: selected ? '#3b82f6' : '#222',
                        emissive: selected ? '#1d4ed8' : '#000000',
                        emissiveIntensity: selected ? 0.5 : 0,
                        frameSize: 0.04,
                    };
            }
        };

        const fp = getFrameProps();

        // Branch A: Monitor — render the Monitor65.glb with the video mapped onto VideoScreen.
        // Scale is locked to [1,1,1] because the GLB defines the physical dimensions.
        if (medium === 'monitor') {
            return (
                <group
                    ref={ref}
                    position={[instance.position_x, instance.position_y, instance.position_z]}
                    rotation={[instance.rotation_x, instance.rotation_y, instance.rotation_z]}
                    scale={[1, 1, 1]}
                    onClick={handleClick}
                    onDoubleClick={handleDoubleClick}
                >
                    {/* Translate the rotated monitor along outer-group +Z so its back face
                        (originally bbox.max.z, now flipped to -bbox.max.z by the π Y-rotation)
                        sits at outer-group local z = -WALL_PLACEMENT_OFFSET. That cancels the
                        placement offset baked into stored positions and the back becomes
                        flush with the wall surface for both old and new instances. */}
                    <group
                        position={[0, 0, monitorMaxZ - WALL_PLACEMENT_OFFSET]}
                        rotation={[0, Math.PI, isPortrait ? -Math.PI / 2 : 0]}
                    >
                        <primitive object={monitorScene} />
                    </group>
                    {selected && (
                        <mesh position={[0, 0, 0]}>
                            <boxGeometry args={[1.5, 0.9, 0.1]} />
                            <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.4} />
                        </mesh>
                    )}
                </group>
            );
        }

        // Branch B: Beamer — frameless plane sized by user scale × video aspect.
        if (medium === 'beamer') {
            return (
                <group
                    ref={ref}
                    position={[instance.position_x, instance.position_y, instance.position_z]}
                    rotation={[instance.rotation_x, instance.rotation_y, instance.rotation_z]}
                    scale={[instance.scale_x, instance.scale_y, instance.scale_z]}
                    onClick={handleClick}
                    onDoubleClick={handleDoubleClick}
                >
                    <mesh position={[0, 0, 0.001]} frustumCulled>
                        <planeGeometry args={[beamerWidth, beamerHeight]} />
                        <meshBasicMaterial
                            map={texture}
                            side={THREE.DoubleSide}
                            toneMapped={false}
                        />
                    </mesh>
                    {selected && (
                        <mesh position={[0, 0, 0.002]}>
                            <planeGeometry args={[beamerWidth + 0.02, beamerHeight + 0.02]} />
                            <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.6} />
                        </mesh>
                    )}
                </group>
            );
        }

        // Branch C (legacy): keep the previous PlaneGeometry+frame render path for any
        // pre-existing instances stored as 'frame'/'display'/'projector'/'wallpaper'.
        // PropertiesPanel auto-promotes these to 'monitor' on next selection.
        return (
            <group
                ref={ref}
                position={[instance.position_x, instance.position_y, instance.position_z]}
                rotation={[instance.rotation_x, instance.rotation_y, instance.rotation_z]}
                scale={[instance.scale_x, instance.scale_y, instance.scale_z]}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
            >
                {/* Video texture */}
                <mesh position={[0, 0, 0.02]} castShadow={false} receiveShadow={false} frustumCulled>
                    <planeGeometry args={[width, height]} />
                    <meshStandardMaterial
                        map={texture}
                        side={THREE.DoubleSide}
                        roughness={medium === 'display' ? 0.3 : 1}
                        metalness={medium === 'display' ? 0.1 : 0}
                        toneMapped={medium !== 'projector'}
                        emissive={medium === 'projector' ? '#ffffff' : '#000000'}
                        emissiveMap={medium === 'projector' ? texture : undefined}
                        emissiveIntensity={medium === 'projector' ? 0.3 : 0}
                    />
                </mesh>
                {/* Frame / bezel */}
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[width + fp.frameSize * 2, height + fp.frameSize * 2, 0.02]} />
                    <meshStandardMaterial
                        color={fp.color}
                        emissive={fp.emissive}
                        emissiveIntensity={fp.emissiveIntensity}
                        roughness={medium === 'display' ? 0.2 : 0.8}
                        metalness={medium === 'display' ? 0.3 : 0}
                    />
                </mesh>
            </group>
        );
    }
);

VideoInstance.displayName = 'VideoInstance';
