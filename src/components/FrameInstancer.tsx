import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getFrameParts } from '../lib/frameProfileGeometry';
import { FrameInstancerContext, FrameInstancerRegistry, type FrameSlot } from '../lib/frameInstancerRegistry';
import { getFrameStyleMaterial, onFrameTexturesReady } from '../lib/frameMaterials';
import { DEFAULT_FRAME_STYLE, frameStyle, type FrameStyleId } from '../lib/frameStyles';
import { ModularFrame } from './ModularFrame';

// RND-01: every picture frame used to be 8 meshes (4 corners + 4 edges) = 8 draw calls per
// artwork (~580 of the 661 draw calls in "Yol"). Frames now share two InstancedMeshes *per
// frame style* — one style in the room still costs two draw calls, and a style nobody uses
// costs nothing because its meshes are never mounted.

const CAPACITY_STEP = 64;
const capacityFor = (frames: number) => Math.max(CAPACITY_STEP, Math.ceil((frames * 4) / CAPACITY_STEP) * CAPACITY_STEP);
// Frames are thin profiles: clicks and FPV info raycasts go to the picture plane instead.
const NO_RAYCAST = () => {};

interface StyleInstancesProps {
    styleId: FrameStyleId;
    registry: FrameInstancerRegistry;
}

/** The two instanced meshes that draw every frame of one style. */
const StyleInstances = ({ styleId, registry }: StyleInstancesProps) => {
    const invalidate = useThree((state) => state.invalidate);
    const [capacity, setCapacity] = useState(() => capacityFor(registry.slotCount(styleId)));
    const cornersRef = useRef<THREE.InstancedMesh>(null);
    const edgesRef = useRef<THREE.InstancedMesh>(null);
    const lastCorners = useRef<THREE.InstancedMesh | null>(null);
    const matrix = useMemo(() => new THREE.Matrix4(), []);
    // Geometry per profile, material per finish (plus the spacer's for a box frame) — all
    // generated on first use and cached, so these are stable objects across renders.
    const style = frameStyle(styleId);
    const parts = style ? getFrameParts(style.profile.id) : null;
    const material = style ? getFrameStyleMaterial(style) : null;

    useEffect(() => {
        const onChange = () => {
            const needed = capacityFor(registry.slotCount(styleId));
            setCapacity((current) => (needed > current ? needed : current));
            invalidate();
        };
        const unsubscribe = registry.subscribe(onChange);
        // Slots registered between this component's render and the subscription.
        queueMicrotask(onChange);
        return unsubscribe;
    }, [registry, styleId, invalidate]);

    // Wood grain arrives from a worker after the frame is first drawn in its average colour.
    useEffect(() => onFrameTexturesReady(invalidate), [invalidate]);

    useFrame(() => {
        const corners = cornersRef.current;
        const edges = edgesRef.current;
        if (!corners || !edges) return;

        // A capacity change re-creates the meshes with empty instance buffers.
        const meshesReplaced = lastCorners.current !== corners;
        lastCorners.current = corners;
        registry.writeInstances(styleId, corners, edges, matrix, meshesReplaced);
    });

    if (!parts || !material) return null;
    return (
        <>
            <instancedMesh
                key={`frame-corners-${capacity}`}
                ref={cornersRef}
                args={[parts.cornerGeometry, material, capacity]}
                count={0}
                frustumCulled={false}
                raycast={NO_RAYCAST}
            />
            <instancedMesh
                key={`frame-edges-${capacity}`}
                ref={edgesRef}
                args={[parts.edgeGeometry, material, capacity]}
                count={0}
                frustumCulled={false}
                raycast={NO_RAYCAST}
            />
        </>
    );
};

const sameStyles = (a: FrameStyleId[], b: FrameStyleId[]) =>
    a.length === b.length && a.every((id, i) => id === b[i]);

const FrameInstances = ({ registry }: { registry: FrameInstancerRegistry }) => {
    const [styles, setStyles] = useState<FrameStyleId[]>(() => registry.activeStyles());

    useEffect(() => {
        const onChange = () => {
            const next = registry.activeStyles();
            setStyles((current) => (sameStyles(current, next) ? current : next));
        };
        const unsubscribe = registry.subscribe(onChange);
        queueMicrotask(onChange);
        return unsubscribe;
    }, [registry]);

    return (
        <>
            {styles.map((styleId) => (
                <StyleInstances key={styleId} styleId={styleId} registry={registry} />
            ))}
        </>
    );
};

export const FrameInstancerProvider = ({ children }: { children: ReactNode }) => {
    const registry = useMemo(() => new FrameInstancerRegistry(), []);
    return (
        <FrameInstancerContext.Provider value={registry}>
            {children}
            <FrameInstances registry={registry} />
        </FrameInstancerContext.Provider>
    );
};

interface InstancedFrameSlotProps {
    width: number;  // frame opening width in meters (picture or passepartout)
    height: number; // frame opening height in meters
    styleId?: FrameStyleId;
}

/** Marks where a frame goes; rendered by FrameInstancerProvider, or as a plain ModularFrame outside of it. */
export const InstancedFrameSlot = ({ width, height, styleId = DEFAULT_FRAME_STYLE }: InstancedFrameSlotProps) => {
    const registry = useContext(FrameInstancerContext);
    const anchorRef = useRef<THREE.Group>(null);
    const slotRef = useRef<FrameSlot | null>(null);

    useLayoutEffect(() => {
        const anchor = anchorRef.current;
        if (!registry || !anchor) return;
        const slot = registry.add(anchor, styleId, width, height);
        slotRef.current = slot;
        return () => {
            registry.remove(slot);
            slotRef.current = null;
        };
        // Size and style changes are applied by the effects below without re-registering.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registry]);

    useLayoutEffect(() => {
        if (registry && slotRef.current) registry.setSize(slotRef.current, width, height);
    }, [registry, width, height]);

    useLayoutEffect(() => {
        // Moves the frame to the other style's instanced meshes; the size effect above keeps
        // width/height current, so they are read here rather than tracked as dependencies.
        if (registry && slotRef.current) registry.setStyle(slotRef.current, styleId, width, height);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registry, styleId]);

    if (!registry) return <ModularFrame width={width} height={height} styleId={styleId} />;
    return <group ref={anchorRef} />;
};
