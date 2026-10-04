import { forwardRef, useEffect, useMemo, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { gooeyToast } from 'goey-toast';
import { useEditorStore, modelBBoxMap, type ArtworkInstanceData } from '../store/editorStore';
import { SPLAT_UP_FLIP, loadSplat, splatAnchor, splatRealScale, type SplatHandle } from '../lib/splats';
import { BoxHitProxy } from '../lib/boxHitProxy';
import { consumeMarqueeClick } from '@/lib/selectionBridge';

interface SplatInstanceProps {
    instance: ArtworkInstanceData;
    selected: boolean;
    isEditor?: boolean;
}

/** Stand-in size while the capture loads or when it failed. */
const PLACEHOLDER_SIZE = 0.5;

type LoadState =
    | { status: 'loading' }
    | { status: 'ready'; handle: SplatHandle }
    | { status: 'error' };

const LOADING: LoadState = { status: 'loading' };
const noRaycast = () => {};

/**
 * Gaussian splat artwork. Stands on the floor like a 3D model: the capture is turned upright
 * (SPLAT_UP_FLIP), moved so the center of its robust bounds sits on the instance origin, and
 * brought to its real height when the curator gave one (splatRealScale).
 * WebGPU renders it with three.js' GaussianSplat, the WebGL fallback with Spark (lib/splats).
 */
export const SplatInstance = forwardRef<THREE.Group, SplatInstanceProps>(
    ({ instance, isEditor = true }, ref) => {
        const url = instance.artwork.asset.path;
        const pickInstance = useEditorStore((state) => state.pickInstance);
        const gl = useThree((state) => state.gl);
        const scene = useThree((state) => state.scene);
        const invalidate = useThree((state) => state.invalidate);
        // Result per URL; a different path (asset replaced) counts as loading until its result arrives.
        const [result, setResult] = useState<{ url: string; state: LoadState } | null>(null);
        const load = result?.url === url ? result.state : LOADING;
        const hitProxy = useMemo(() => {
            const proxy = new BoxHitProxy();
            // SelectionOutline measures the splat by this box
            proxy.userData.selectionBounds = true;
            return proxy;
        }, []);

        useEffect(() => {
            let cancelled = false;
            let handle: SplatHandle | null = null;
            loadSplat({ url, gl, scene, invalidate }).then(
                (loaded) => {
                    if (cancelled) {
                        loaded.dispose();
                        return;
                    }
                    handle = loaded;
                    setResult({ url, state: { status: 'ready', handle: loaded } });
                    invalidate();
                },
                (err: unknown) => {
                    if (cancelled) return;
                    console.error('Splat konnte nicht geladen werden:', url, err);
                    if (isEditor) {
                        gooeyToast.error('Splat konnte nicht geladen werden', {
                            description: url.split('/').pop(),
                        });
                    }
                    setResult({ url, state: { status: 'error' } });
                },
            );
            return () => {
                cancelled = true;
                handle?.dispose();
                invalidate();
            };
        }, [url, gl, scene, invalidate, isEditor]);

        const anchor = useMemo(() => (load.status === 'ready' ? splatAnchor(load.handle.frame) : null), [load]);
        // Real height set by the curator (Artwork.height, cm); otherwise the file's units are metres.
        const heightCm = instance.artwork.height;
        const realScale = anchor ? splatRealScale(anchor.size.y, heightCm) : 1;
        const size = useMemo(
            () => anchor?.size.clone().multiplyScalar(realScale)
                ?? new THREE.Vector3(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE),
            [anchor, realScale],
        );

        useEffect(() => {
            hitProxy.box.min.set(-size.x / 2, 0, -size.z / 2);
            hitProxy.box.max.set(size.x / 2, size.y, size.z / 2);
        }, [hitProxy, size.x, size.y, size.z]);

        // Size in file units for PropertiesPanel (same map 3D models use); the panel applies the
        // real height itself, so it never waits for this effect.
        useEffect(() => {
            if (!anchor) return;
            modelBBoxMap.set(instance.id, anchor.size.clone());
            return () => { modelBBoxMap.delete(instance.id); };
        }, [instance.id, anchor]);

        const handleClick = (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (consumeMarqueeClick()) return;
            pickInstance(instance.id, e.nativeEvent.shiftKey);
        };

        return (
            <group
                ref={ref}
                position={[instance.position_x, instance.position_y, instance.position_z]}
                rotation={[instance.rotation_x, instance.rotation_y, instance.rotation_z]}
                scale={[instance.scale_x, instance.scale_y, instance.scale_z]}
                onClick={handleClick}
            >
                {load.status === 'ready' && anchor && (
                    <group scale={realScale}>
                        <group position={anchor.offset}>
                            <group rotation={SPLAT_UP_FLIP}>
                                <primitive object={load.handle.object} />
                            </group>
                        </group>
                    </group>
                )}

                <primitive object={hitProxy} />

                {/* Placeholder while loading / after an error, and the selection box */}
                {load.status !== 'ready' && (
                    <mesh position={[0, size.y / 2, 0]} raycast={noRaycast}>
                        <boxGeometry args={[size.x, size.y, size.z]} />
                        <meshBasicMaterial
                            color={load.status === 'error' ? '#ef4444' : '#3b82f6'}
                            wireframe
                            transparent
                            opacity={0.35}
                        />
                    </mesh>
                )}
            </group>
        );
    },
);

SplatInstance.displayName = 'SplatInstance';
