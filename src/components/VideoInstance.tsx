import { forwardRef, useEffect, useRef, useMemo, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, videoRefMap, type ArtworkInstanceData } from '../store/editorStore';

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

        // DPI-based sizing (same as SelectableInstance)
        const dpi = asset.dpi || 72;
        const width = (asset.width / dpi) * 0.0254;
        const height = (asset.height / dpi) * 0.0254;

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

        // Set max anisotropy, autoplay in viewer mode, and clean up on unmount
        useEffect(() => {
            texture.anisotropy = gl.capabilities.getMaxAnisotropy();
            if (!isEditor) {
                video.play().catch(() => {/* autoplay blocked, user interaction required */});
            }
            return () => {
                video.pause();
                video.removeAttribute('src');
                video.load();
                texture.dispose();
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
