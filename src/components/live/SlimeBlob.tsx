import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { avatarPose } from '@/lib/live/avatarPoses';
import { BLOB_LABEL_LIFT, BlobChain, ballStrength, blobTarget } from '@/lib/live/blobChain';

/**
 * One person as a soft, glossy blob of slime at chest height that trails behind when it moves
 * and wobbles back when it stops — in the public viewer (VisitorBlobs) and for people walking in
 * first person in the editor (LiveSceneLayer). The body is a spring chain (lib/live/blobChain.ts)
 * whose segments are metaballs, melted into one surface by three's MarchingCubes (plain
 * material, so WebGPU and WebGL alike). Follows the pose of `id` in lib/live/avatarPoses.
 */

const RESOLUTION = 32;
/** Half the edge of a blob's field cube in metres: room for the head and a stretched tail. */
const HALF_SIZE = 1.1;
const ISOLATION = 80;
const SUBTRACT = 12;

export interface SlimeBlobLabel {
    texture: THREE.Texture;
    /** Sprite scale for a constant on-screen size (sizeAttenuation off). */
    scale: [number, number];
}

export const SlimeBlob = ({ id, color, label }: { id: string; color: string; label?: SlimeBlobLabel }) => {
    const invalidate = useThree((s) => s.invalidate);
    const sprite = useRef<THREE.Sprite>(null);
    const { mesh, chain } = useMemo(() => {
        const material = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
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
    }, [id, color]);

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
        const head = chain.segments[0].position;
        sprite.current?.position.set(head[0], head[1] + BLOB_LABEL_LIFT, head[2]);
        // Keep rendering while the slime still settles.
        if (chain.length > 0.002 || Math.hypot(...chain.segments[0].velocity) > 0.002) invalidate();
    });

    return (
        <>
            <primitive object={mesh} />
            {label && (
                <sprite ref={sprite} scale={[label.scale[0], label.scale[1], 1]} raycast={() => {}} renderOrder={12}>
                    <spriteMaterial map={label.texture} sizeAttenuation={false} depthWrite={false} depthTest={false} transparent toneMapped={false} />
                </sprite>
            )}
        </>
    );
};
