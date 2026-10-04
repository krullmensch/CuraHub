import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { avatarPose, avatarSessions, onAvatarPose, onAvatarSessionsChanged } from '@/lib/live/avatarPoses';
import { reportCamera } from '@/lib/live/cameraPose';
import { BlobChain, ballStrength, blobColor, blobTarget } from '@/lib/live/blobChain';

/**
 * Public viewer (live collaboration, step 5): every other visitor as a soft, glossy blob of slime
 * at chest height that trails behind when it moves and wobbles back when it stops. The body is a
 * spring chain (lib/live/blobChain.ts) whose segments are metaballs, melted into one surface by
 * three's MarchingCubes (plain material, so WebGPU and WebGL alike). Also reports this visitor's
 * own camera so the others see them. Mounted inside the viewer's Canvas.
 */

/** More blobs than this are not drawn (each one polygonises its own field every frame). */
const MAX_BLOBS = 16;
const RESOLUTION = 32;
/** Half the edge of a blob's field cube in metres: room for the head and a stretched tail. */
const HALF_SIZE = 1.1;
const ISOLATION = 80;
const SUBTRACT = 12;

export const VisitorBlobs = () => {
    const sessions = useSyncExternalStore(onAvatarSessionsChanged, avatarSessions);
    const invalidate = useThree((s) => s.invalidate);
    useEffect(() => onAvatarPose(invalidate), [invalidate]);
    useFrame(({ camera }) => reportCamera(camera));
    return (
        <>
            {sessions.slice(0, MAX_BLOBS).map((id) => <Blob key={id} id={id} />)}
        </>
    );
};

const Blob = ({ id }: { id: string }) => {
    const invalidate = useThree((s) => s.invalidate);
    const { mesh, chain } = useMemo(() => {
        const material = new THREE.MeshStandardMaterial({
            color: blobColor(id),
            emissive: blobColor(id),
            emissiveIntensity: 0.18,
            roughness: 0.12,
            metalness: 0,
            transparent: true,
            opacity: 0.88,
        });
        const cubes = new MarchingCubes(RESOLUTION, material, false, false, 12000);
        cubes.isolation = ISOLATION;
        cubes.scale.setScalar(HALF_SIZE);
        // The surface moves around inside the cube; its bounds are not kept up to date.
        cubes.frustumCulled = false;
        // Blobs never take clicks or the first-person crosshair.
        cubes.raycast = () => {};
        const start = avatarPose(id)?.p ?? [0, 0, 0];
        return { mesh: cubes, chain: new BlobChain(blobTarget(start)) };
    }, [id]);

    useEffect(() => () => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
    }, [mesh]);

    useFrame((_, delta) => {
        const pose = avatarPose(id);
        if (!pose) return;
        chain.step(blobTarget(pose.p), delta);
        const centre = chain.centre;
        mesh.position.set(centre[0], centre[1], centre[2]);
        mesh.reset();
        for (const seg of chain.segments) {
            // Field coordinates: 0…1 across the cube, centred on the body.
            const x = 0.5 + (seg.position[0] - centre[0]) / (2 * HALF_SIZE);
            const y = 0.5 + (seg.position[1] - centre[1]) / (2 * HALF_SIZE);
            const z = 0.5 + (seg.position[2] - centre[2]) / (2 * HALF_SIZE);
            mesh.addBall(x, y, z, ballStrength(seg.radius, HALF_SIZE, ISOLATION, SUBTRACT), SUBTRACT);
        }
        mesh.update();
        // Keep rendering while the slime still settles.
        if (chain.length > 0.002 || Math.hypot(...chain.segments[0].velocity) > 0.002) invalidate();
    });

    return <primitive object={mesh} />;
};
