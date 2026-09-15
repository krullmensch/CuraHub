import { Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { FRAME_MODEL, extractFrameParts } from '../lib/modularFrameParts';
import { FrameInstancerContext, FrameInstancerRegistry, type FrameSlot } from '../lib/frameInstancerRegistry';
import { ModularFrame } from './ModularFrame';

// RND-01: every picture frame used to be 8 meshes (4 corners + 4 edges) = 8 draw calls per
// artwork (~580 of the 661 draw calls in "Yol"). All frames now share two InstancedMeshes.

const CAPACITY_STEP = 64;
const capacityFor = (frames: number) => Math.max(CAPACITY_STEP, Math.ceil((frames * 4) / CAPACITY_STEP) * CAPACITY_STEP);
// Frames are 8 mm profiles: clicks and FPV info raycasts go to the picture plane instead.
const NO_RAYCAST = () => {};

const FrameInstances = ({ registry }: { registry: FrameInstancerRegistry }) => {
    const { scene } = useGLTF(FRAME_MODEL);
    const parts = useMemo(() => extractFrameParts(scene), [scene]);
    const invalidate = useThree((state) => state.invalidate);
    const [capacity, setCapacity] = useState(() => capacityFor(registry.slots.size));
    const cornersRef = useRef<THREE.InstancedMesh>(null);
    const edgesRef = useRef<THREE.InstancedMesh>(null);
    const lastCorners = useRef<THREE.InstancedMesh | null>(null);
    const matrix = useMemo(() => new THREE.Matrix4(), []);

    useEffect(() => {
        const onChange = () => {
            const needed = capacityFor(registry.slots.size);
            setCapacity((current) => (needed > current ? needed : current));
            invalidate();
        };
        const unsubscribe = registry.subscribe(onChange);
        // Slots registered between this component's render and the subscription.
        queueMicrotask(onChange);
        return unsubscribe;
    }, [registry, invalidate]);

    useFrame(() => {
        const corners = cornersRef.current;
        const edges = edgesRef.current;
        if (!corners || !edges) return;

        // A capacity change re-creates the meshes with empty instance buffers.
        const meshesReplaced = lastCorners.current !== corners;
        lastCorners.current = corners;
        registry.writeInstances(corners, edges, matrix, meshesReplaced);
    });

    return (
        <>
            <instancedMesh
                key={`frame-corners-${capacity}`}
                ref={cornersRef}
                args={[parts.cornerGeometry, parts.cornerMaterial, capacity]}
                count={0}
                frustumCulled={false}
                raycast={NO_RAYCAST}
            />
            <instancedMesh
                key={`frame-edges-${capacity}`}
                ref={edgesRef}
                args={[parts.edgeGeometry, parts.edgeMaterial, capacity]}
                count={0}
                frustumCulled={false}
                raycast={NO_RAYCAST}
            />
        </>
    );
};

export const FrameInstancerProvider = ({ children }: { children: ReactNode }) => {
    const registry = useMemo(() => new FrameInstancerRegistry(), []);
    return (
        <FrameInstancerContext.Provider value={registry}>
            {children}
            <Suspense fallback={null}>
                <FrameInstances registry={registry} />
            </Suspense>
        </FrameInstancerContext.Provider>
    );
};

interface InstancedFrameSlotProps {
    width: number;  // inner picture width in meters
    height: number; // inner picture height in meters
}

/** Marks where a frame goes; rendered by FrameInstancerProvider, or as a plain ModularFrame outside of it. */
export const InstancedFrameSlot = ({ width, height }: InstancedFrameSlotProps) => {
    const registry = useContext(FrameInstancerContext);
    const anchorRef = useRef<THREE.Group>(null);
    const slotRef = useRef<FrameSlot | null>(null);

    useLayoutEffect(() => {
        const anchor = anchorRef.current;
        if (!registry || !anchor) return;
        const slot = registry.add(anchor, width, height);
        slotRef.current = slot;
        return () => {
            registry.remove(slot);
            slotRef.current = null;
        };
        // Size changes are applied by the effect below without re-registering.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registry]);

    useLayoutEffect(() => {
        if (registry && slotRef.current) registry.setSize(slotRef.current, width, height);
    }, [registry, width, height]);

    if (!registry) return <ModularFrame width={width} height={height} />;
    return <group ref={anchorRef} />;
};
