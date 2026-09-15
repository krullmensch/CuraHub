import { Suspense, useMemo, useState, type ReactNode } from 'react';
import { useGLTF, KeyboardControls } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import type { GLTF } from 'three-stdlib';
import { useEditorStore, type ArtworkInstanceData, type ModularWallData } from '../../store/editorStore';
import { SATELLIT_MODEL_URL } from '../../lib/modelUrls';
import { Player, PlayerController, PLAYER_EYE_OFFSET } from '../Player';

/**
 * RND-08: everything that needs @react-three/rapier. Loaded lazily (Rapier is a ~2.3 MB chunk
 * with its WASM) and mounted
 *  - in the editor only in the first-person preview,
 *  - in the viewer always.
 * Visuals (room, walls, models) are rendered by Scene; this renders invisible colliders from the
 * same data plus the player body.
 */

type SatellitNodes = GLTF & {
    nodes: {
        Decke001: THREE.Mesh;
        Grundriss002: THREE.Mesh;
        Boden001: THREE.Mesh;
        Fenster001: THREE.Mesh;
        Traversen: THREE.Mesh;
        Tür2001: THREE.Mesh;
        Tür1001: THREE.Mesh;
        Fensterbank: THREE.Mesh;
    };
};

/** Same node geometries and transforms as Satellit.tsx. */
const RoomColliders = () => {
    const { nodes } = useGLTF(SATELLIT_MODEL_URL) as unknown as SatellitNodes;
    return (
        // Auto colliders are built via traverseVisible() unless includeInvisible is set — without
        // it the invisible collider meshes produce no collision and the player falls through.
        <RigidBody type="fixed" colliders="trimesh" includeInvisible>
            <mesh geometry={nodes.Decke001.geometry} visible={false} />
            <mesh geometry={nodes.Grundriss002.geometry} visible={false} />
            <mesh geometry={nodes.Boden001.geometry} visible={false} />
            <mesh geometry={nodes.Fenster001.geometry} visible={false} />
            <mesh geometry={nodes.Traversen.geometry} position={[-3.051, 3.453, -1.501]} rotation={[0, Math.PI / 2, 0]} visible={false} />
            <mesh geometry={nodes.Tür2001.geometry} position={[6.33, 1, 0.12]} visible={false} />
            <mesh geometry={nodes.Tür1001.geometry} position={[-6.33, 1, 2.372]} visible={false} />
            <mesh geometry={nodes.Fensterbank.geometry} visible={false} />
        </RigidBody>
    );
};

const WallColliders = ({ walls }: { walls: ModularWallData[] }) => (
    <>
        {walls.map((wall) => (
            <RigidBody
                key={wall.id}
                type="fixed"
                colliders={false}
                position={[wall.position_x, wall.position_y, wall.position_z]}
                rotation={[wall.rotation_x, wall.rotation_y, wall.rotation_z]}
            >
                <CuboidCollider args={[wall.width / 2, wall.height / 2, wall.thickness / 2]} />
            </RigidBody>
        ))}
    </>
);

/** Bounding-box collider, same box ModelInstance.tsx computes from the model. */
const ModelCollider = ({ instance }: { instance: ArtworkInstanceData }) => {
    const { scene } = useGLTF(instance.artwork.asset.path, '/draco/gltf/');
    const bbox = useMemo(() => {
        const box = new THREE.Box3().setFromObject(scene);
        return { size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };
    }, [scene]);

    return (
        <group
            position={[instance.position_x, instance.position_y, instance.position_z]}
            rotation={[instance.rotation_x, instance.rotation_y, instance.rotation_z]}
            scale={[instance.scale_x, instance.scale_y, instance.scale_z]}
        >
            <RigidBody type="fixed" colliders={false}>
                <CuboidCollider
                    args={[bbox.size.x / 2, bbox.size.y / 2, bbox.size.z / 2]}
                    position={[bbox.center.x, bbox.center.y, bbox.center.z]}
                />
            </RigidBody>
        </group>
    );
};

const EDITOR_KEY_MAP = [
    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
    { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
    { name: 'jump', keys: ['Space'] },
    { name: 'run', keys: ['Shift'] },
];

interface PhysicsWorldProps {
    /**
     * editor: pointer lock is owned by PlannerCameraSystem.
     * viewer: <Player/> also handles pointer lock (released while a dialog is open).
     */
    mode: 'editor' | 'viewer';
    viewerWalls?: ModularWallData[];
    viewerInstances?: ArtworkInstanceData[];
    children?: ReactNode;
}

export default function PhysicsWorld({ mode, viewerWalls, viewerInstances, children }: PhysicsWorldProps) {
    const isDialogOpen = useEditorStore((state) => state.isDialogOpen);
    const localWalls = useEditorStore((state) => state.localWalls);
    const localInstances = useEditorStore((state) => state.localInstances);
    // Editor: respawn where the first-person preview was left (saved by PlannerCameraSystem on exit).
    const [editorSpawn] = useState(() => {
        const { position, rotation } = useEditorStore.getState().firstPersonCameraState;
        return {
            body: [position[0], position[1] - PLAYER_EYE_OFFSET, position[2]] as [number, number, number],
            rotation,
        };
    });

    const walls = viewerWalls ?? localWalls;
    const instances = viewerInstances ?? localInstances;
    const modelInstances = useMemo(
        () => instances.filter((i) => (i.artwork?.asset?.type || 'image') === 'model3d'),
        [instances],
    );

    return (
        <Physics gravity={[0, -9.81, 0]}>
            {/* Suspends until the room model is available, so the player never spawns before
                the floor collider exists. */}
            <RoomColliders />
            <WallColliders walls={walls} />
            {modelInstances.map((instance) => (
                <Suspense key={instance.id} fallback={null}>
                    <ModelCollider instance={instance} />
                </Suspense>
            ))}
            {mode === 'viewer' ? (
                <Player />
            ) : (
                <KeyboardControls map={EDITOR_KEY_MAP}>
                    <PlayerController paused={isDialogOpen} spawn={editorSpawn.body} initialRotation={editorSpawn.rotation} />
                </KeyboardControls>
            )}
            {children}
        </Physics>
    );
}
