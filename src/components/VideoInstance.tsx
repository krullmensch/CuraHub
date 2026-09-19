import { forwardRef, useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getMaxAnisotropy, isWebGPURenderer } from '../lib/rendererBackend';
import { useEditorStore, videoRefMap, monitorGlbBounds, WALL_PLACEMENT_OFFSET, type ArtworkInstanceData } from '../store/editorStore';
import { useRenderQualitySettings } from '../hooks/use-render-quality';
import { pickVideoSource, videoStreamUrl } from '../lib/videoSource';

// Monitor GLB preload moved to EditorPage/ViewerPage (mount-time useEffect) so importing
// this component no longer downloads the model on every route, including the home page
// (LOAD-02).

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
        const invalidate = useThree((state) => state.invalidate);
        const [muted, setMuted] = useState(true);
        // VID-04: low/medium presets play a smaller proxy version when one exists.
        const { videoMaxShortEdge } = useRenderQualitySettings();
        const src = videoStreamUrl(pickVideoSource(asset, videoMaxShortEdge));

        // DPI-based sizing (same as SelectableInstance) — used as the base unit before user scale
        const dpi = asset.dpi || 72;
        const width = (asset.width / dpi) * 0.0254;
        const height = (asset.height / dpi) * 0.0254;

        // Tracks the live aspect ratio of the actual decoded video. videoWidth/videoHeight are
        // 0 until the loadedmetadata event fires, so the value is null until then.
        const [videoAspect, setVideoAspect] = useState<number | null>(null);

        // Create a dedicated video element and texture per instance
        const { video, texture, canvas } = useMemo(() => {
            const vid = document.createElement('video');
            vid.src = src;
            vid.crossOrigin = 'anonymous';
            vid.loop = true;
            vid.muted = true;
            vid.playsInline = true;
            // Load metadata only — full data loads on play() (VID-01). The viewer still
            // autoplays because play() itself triggers loading.
            vid.preload = 'metadata';

            // WebGPURenderer uploads THREE.VideoTexture via copyExternalImageToTexture()
            // directly from the <video> element. On some GPUs/drivers that intermittently
            // fails to produce a valid frame — three.js itself silently discards the error
            // (see r186 WebGPUTextureUtils._copyImageToTexture, "fix bad video frame data on
            // certain devices", three.js#32391) — leaving the plane stuck on a stale frame.
            // Route WebGPU through an offscreen canvas instead: copyExternalImageToTexture()
            // from a canvas source is the same, far more battle-tested path images/photos
            // already use. Costs one CPU-side drawImage() per decoded frame; WebGL keeps the
            // zero-copy VideoTexture it always used.
            let canvasEl: HTMLCanvasElement | null = null;
            let tex: THREE.Texture;
            if (isWebGPURenderer(gl)) {
                canvasEl = document.createElement('canvas');
                canvasEl.width = 16;
                canvasEl.height = 9; // placeholder until video metadata is known
                tex = new THREE.CanvasTexture(canvasEl);
            } else {
                tex = new THREE.VideoTexture(vid);
            }
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4; // updated in effect with actual max

            return { video: vid, texture: tex, canvas: canvasEl };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [instance.id, gl]);

        // WebGPU only: blits the current video frame into `canvas` right before the texture is
        // marked dirty (see the rVFC callback and the no-rVFC fallback in useFrame below).
        const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
        const drawVideoFrame = useCallback(() => {
            if (!canvas || video.videoWidth === 0) return;
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                // WebGPU allocates the GPU texture once, at the canvas size of the first upload
                // (the 16×9 placeholder), and later copies only that many pixels — the plane
                // showed one flat colour instead of the video. dispose() drops the GPU texture
                // and its bind groups; the next render re-creates it at the new size.
                texture.dispose();
            }
            canvasCtxRef.current ??= canvas.getContext('2d');
            canvasCtxRef.current?.drawImage(video, 0, 0, canvas.width, canvas.height);
        }, [canvas, video, texture]);

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

        // Preset switched to another version: keep playback position and play state.
        useEffect(() => {
            if (video.getAttribute('src') === src) return;
            const time = video.currentTime;
            const wasPlaying = !video.paused;
            const onLoaded = () => {
                if (time > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(time, video.duration);
                if (wasPlaying) video.play().catch(() => { /* autoplay blocked */ });
            };
            video.addEventListener('loadedmetadata', onLoaded, { once: true });
            video.src = src;
            return () => video.removeEventListener('loadedmetadata', onLoaded);
        }, [video, src]);

        // Track the material we attach to the Monitor's VideoScreen mesh so we can dispose it.
        const screenMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);

        // Set max anisotropy, autoplay in viewer mode, and clean up on unmount
        useEffect(() => {
            texture.anisotropy = getMaxAnisotropy(gl);
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
                    drawVideoFrame();
                    hasNewFrame.current = true;
                    // RND-02: under frameloop="demand" nothing else requests a new frame
                    // while a video plays — ask for one whenever a decoded frame is ready.
                    invalidate();
                    handle = vid.requestVideoFrameCallback(onFrame);
                };
                handle = vid.requestVideoFrameCallback(onFrame);
                return () => vid.cancelVideoFrameCallback(handle);
            }
            return undefined;
        }, [video, invalidate, drawVideoFrame]);

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
                    drawVideoFrame();
                    texture.needsUpdate = true;
                }
                // No requestVideoFrameCallback here to drive invalidate() — keep requesting
                // frames every tick while playing so the texture actually advances under demand.
                invalidate();
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

        // Portrait video on a monitor: the whole monitor is turned by -90° (see the Monitor branch),
        // but the display's UVs are landscape — without counter-rotating the texture the video
        // appeared sideways and stretched. Beamer planes already match the video aspect.
        useEffect(() => {
            texture.center.set(0.5, 0.5);
            texture.rotation = medium === 'monitor' && isPortrait ? -Math.PI / 2 : 0;
            invalidate();
        }, [texture, medium, isPortrait, invalidate]);

        // Monitor branch: load Monitor65.glb and map the video texture onto the VideoScreen mesh.
        // useGLTF is always called (rules of hooks) — the result is only mounted when medium === 'monitor'.
        const { scene: monitorGltfScene } = useGLTF('/models/Monitor65.glb');
        const { monitorScene, monitorMaxZ, monitorSize, monitorCenter } = useMemo(() => {
            const cloned = monitorGltfScene.clone(true);
            cloned.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
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
            // Cache the GLB's local bottom extent so artworkMinY() can clamp correctly
            monitorGlbBounds.minY = bbox.min.y;
            monitorGlbBounds.maxX = bbox.max.x;
            return {
                monitorScene: cloned,
                monitorMaxZ: bbox.max.z,
                monitorSize: bbox.getSize(new THREE.Vector3()),
                monitorCenter: bbox.getCenter(new THREE.Vector3()),
            };
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
                        // Selection box from the model's real bounds, following the portrait rotation
                        // (Ry(π) then Rz(-π/2) maps the model's (x, y) to (-y, -x); landscape to (-x, y)).
                        <mesh position={isPortrait ? [-monitorCenter.y, -monitorCenter.x, 0] : [-monitorCenter.x, monitorCenter.y, 0]}>
                            <boxGeometry args={isPortrait ? [monitorSize.y, monitorSize.x, 0.1] : [monitorSize.x, monitorSize.y, 0.1]} />
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
