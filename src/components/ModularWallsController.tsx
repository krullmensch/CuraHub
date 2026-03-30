import { useEffect, useRef, useCallback, useMemo, Suspense, Fragment } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useEditorStore, instanceRefMap, type ModularWallData } from '@/store/editorStore';
import { useAuthStore } from '@/store/authStore';
import { ModularWallMesh } from './ModularWallMesh';

// Fixed wall dimensions (meters)
export const WALL_WIDTH = 4.2;
export const WALL_HEIGHT = 3.1;
export const WALL_THICKNESS = 0.4;

const WALL_Y = WALL_HEIGHT / 2; // Center of wall so bottom sits on floor

// Default walls spawn straight (0° rotation) centered in the room with a gap
const ANGLE_DEFAULT = 0;
const SPAWN_GAP = WALL_WIDTH / 2 + 0.5; // Half-width + 0.5m breathing room

export const DEFAULT_WALLS: Omit<ModularWallData, 'id' | 'versionId'>[] = [
    {
        label: 'Wall A',
        position_x: -SPAWN_GAP,
        position_y: WALL_Y,
        position_z: 0,
        rotation_x: 0,
        rotation_y: ANGLE_DEFAULT,
        rotation_z: 0,
        width: WALL_WIDTH,
        height: WALL_HEIGHT,
        thickness: WALL_THICKNESS,
        color: '#ffffff',
        isLocked: false,
    },
    {
        label: 'Wall B',
        position_x: SPAWN_GAP,
        position_y: WALL_Y,
        position_z: 0,
        rotation_x: 0,
        rotation_y: ANGLE_DEFAULT,
        rotation_z: 0,
        width: WALL_WIDTH,
        height: WALL_HEIGHT,
        thickness: WALL_THICKNESS,
        color: '#ffffff',
        isLocked: false,
    },
];

// ─── Collision Helpers ───────────────────────────────────────────────

/**
 * Calculate the 4 base-plane corners of a wall given its center position and Y-rotation.
 */
const getWallCorners = (
    cx: number, cz: number, rotY: number,
    halfW = WALL_WIDTH / 2,
    halfT = WALL_THICKNESS / 2,
): THREE.Vector2[] => {
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);

    // Local offsets for 4 corners (in XZ plane)
    const offsets: [number, number][] = [
        [halfW, halfT],
        [halfW, -halfT],
        [-halfW, halfT],
        [-halfW, -halfT],
    ];

    return offsets.map(([lx, lz]) => new THREE.Vector2(
        cx + lx * cos - lz * sin,
        cz + lx * sin + lz * cos,
    ));
};

/** AABB half-extents of a wall OBB rotated by rotY. */
const getAABBHalfExtents = (rotY: number) => {
    const abscos = Math.abs(Math.cos(rotY));
    const abssin = Math.abs(Math.sin(rotY));
    const halfW = WALL_WIDTH / 2;
    const halfT = WALL_THICKNESS / 2;
    return {
        ex: halfW * abscos + halfT * abssin,
        ez: halfW * abssin + halfT * abscos,
    };
};

/**
 * SAT (Separating Axis Theorem) overlap test for two OBBs in 2D (XZ plane).
 * Returns true if the two walls overlap.
 */
const wallsOverlap = (
    ax: number, az: number, aRotY: number,
    bx: number, bz: number, bRotY: number,
): boolean => {
    const cornersA = getWallCorners(ax, az, aRotY);
    const cornersB = getWallCorners(bx, bz, bRotY);

    // Get the 4 unique edge normals (2 per rectangle)
    const getAxes = (corners: THREE.Vector2[]): THREE.Vector2[] => {
        const axes: THREE.Vector2[] = [];
        const edges = [
            [corners[0], corners[1]], // halfW edge
            [corners[0], corners[2]], // halfT edge
        ];
        for (const [p1, p2] of edges) {
            const edge = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y);
            const normal = new THREE.Vector2(-edge.y, edge.x).normalize();
            axes.push(normal);
        }
        return axes;
    };

    const axes = [...getAxes(cornersA), ...getAxes(cornersB)];

    for (const axis of axes) {
        let minA = Infinity, maxA = -Infinity;
        let minB = Infinity, maxB = -Infinity;

        for (const c of cornersA) {
            const proj = c.dot(axis);
            if (proj < minA) minA = proj;
            if (proj > maxA) maxA = proj;
        }
        for (const c of cornersB) {
            const proj = c.dot(axis);
            if (proj < minB) minB = proj;
            if (proj > maxB) maxB = proj;
        }

        // If there's a separating axis, no overlap
        if (maxA <= minB || maxB <= minA) return false;
    }

    return true;
};


// ─── AABB Bounding Box Visual ────────────────────────────────────────

const WallBoundingBox = ({ wallRef }: { wallRef: THREE.Group }) => {
    const lineRef = useRef<THREE.LineSegments>(null);
    const fillRef = useRef<THREE.Mesh>(null);
    const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);

    useFrame(() => {
        if (!wallRef) return;
        const { x, z } = wallRef.position;
        const rotY = wallRef.rotation.y;
        const { ex, ez } = getAABBHalfExtents(rotY);

        for (const ref of [lineRef.current, fillRef.current]) {
            if (!ref) continue;
            ref.position.set(x, WALL_Y, z);
            ref.scale.set(ex * 2, WALL_HEIGHT, ez * 2);
        }
    });

    return (
        <>
            <lineSegments ref={lineRef} geometry={edges}>
                <lineBasicMaterial color="#4488ff" transparent opacity={0.6} />
            </lineSegments>
            <mesh ref={fillRef}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="#4488ff" transparent opacity={0.06} depthWrite={false} />
            </mesh>
        </>
    );
};

// ─── Component ───────────────────────────────────────────────────────

interface ModularWallsControllerProps {
    viewerWalls?: ModularWallData[];
    isEditor?: boolean;
}

export const ModularWallsController = ({ viewerWalls, isEditor = true }: ModularWallsControllerProps) => {
    const localWalls = useEditorStore((state) => state.localWalls);
    const setLocalWalls = useEditorStore((state) => state.setLocalWalls);
    const selectedWallId = useEditorStore((state) => state.selectedWallId);
    const updateWall = useEditorStore((state) => state.updateWall);
    const token = useAuthStore((state) => state.token);
    const activeVersionId = useEditorStore((state) => state.activeVersionId);
    const transformMode = useEditorStore((state) => state.transformMode);
    const setIsTransforming = useEditorStore((state) => state.setIsTransforming);
    const restrictionZones = useEditorStore((state) => state.restrictionZones);

    const { scene } = useThree();

    // Store last valid transform to snap back on collision with restriction zones
    const lastValidTransforms = useRef<Map<number, { x: number; z: number; ry: number }>>(new Map());

    // Raycast boundary detection against the room's inner wall surface
    const roomWallMeshRef = useRef<THREE.Mesh | null>(null);
    const raycaster = useRef(new THREE.Raycaster());
    // Temp vectors — reused every frame to avoid allocations
    const _rayOrigin = useRef(new THREE.Vector3(0, WALL_Y, 0)); // Room center at wall mid-height
    const _cornerPos = useRef(new THREE.Vector3());
    const _rayDir = useRef(new THREE.Vector3());

    const getRoomWallMesh = useCallback((): THREE.Mesh | null => {
        if (!roomWallMeshRef.current) {
            scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh && obj.name === 'Wall') {
                    roomWallMeshRef.current = obj;
                }
            });
        }
        return roomWallMeshRef.current;
    }, [scene]);

    /**
     * Cast a ray from the room center toward each AABB corner of the wall.
     * The AABB envelops the rotated OBB, so the collision boundary matches
     * the visible bounding box. If any room wall surface is closer to the
     * center than a corner, the box has crossed the boundary — invalid.
     */
    const isWithinRoom = useCallback((cx: number, cz: number, rotY: number): boolean => {
        const roomWall = getRoomWallMesh();
        if (!roomWall) return true;

        const { ex, ez } = getAABBHalfExtents(rotY);
        const aabbCorners: [number, number][] = [
            [cx + ex, cz + ez],
            [cx + ex, cz - ez],
            [cx - ex, cz + ez],
            [cx - ex, cz - ez],
        ];

        const origin = _rayOrigin.current;
        for (const [ax, az] of aabbCorners) {
            _cornerPos.current.set(ax, WALL_Y, az);
            _rayDir.current.subVectors(_cornerPos.current, origin).normalize();
            const dist = origin.distanceTo(_cornerPos.current);
            raycaster.current.set(origin, _rayDir.current);
            const hits = raycaster.current.intersectObject(roomWall);
            if (hits.length > 0 && hits[0].distance < dist) return false;
        }
        return true;
    }, [getRoomWallMesh]);

    // Refs for wall groups
    const wallRefs = useRef<Map<number, THREE.Group>>(new Map());
    const transformControlsRef = useRef<any>(null);

    const setWallRef = useCallback((id: number) => (el: THREE.Group | null) => {
        if (el) {
            wallRefs.current.set(id, el);
        } else {
            wallRefs.current.delete(id);
        }
    }, []);

    // Load walls: use DB data if it exists, otherwise use hardcoded defaults
    useEffect(() => {
        if (!isEditor || viewerWalls) return;
        if (!token || !activeVersionId) {
            setLocalWalls([]);
            return;
        }

        let cancelled = false;

        const loadWalls = async () => {
            try {
                const res = await fetch(`/api/walls?versionId=${activeVersionId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.status === 401) {
                    useAuthStore.getState().logout();
                    return;
                }
                if (!res.ok) throw new Error('Failed to fetch walls');
                if (cancelled) return;

                const data: ModularWallData[] = await res.json();

                if (data.length > 0) {
                    // DB has walls — use them
                    setLocalWalls(data);
                    data.forEach(w => lastValidTransforms.current.set(w.id, { x: w.position_x, z: w.position_z, ry: w.rotation_y }));
                } else {
                    // No walls in DB — use hardcoded defaults with temporary negative IDs
                    // Real DB records will be created on first user interaction
                    const defaults: ModularWallData[] = DEFAULT_WALLS.map((def, i) => ({
                        ...def,
                        id: -(i + 1), // Temporary negative IDs (not yet in DB)
                        versionId: activeVersionId,
                    } as ModularWallData));
                    setLocalWalls(defaults);
                    defaults.forEach(w => lastValidTransforms.current.set(w.id, { x: w.position_x, z: w.position_z, ry: w.rotation_y }));
                }
            } catch (err) {
                console.error("Failed to load walls:", err);
            }
        };

        loadWalls();
        return () => { cancelled = true; };
    }, [token, activeVersionId, setLocalWalls, isEditor, viewerWalls]);

    // Get the selected wall data and its ref
    const selectedWall = localWalls.find(w => w.id === selectedWallId);
    const selectedWallRef = selectedWallId ? wallRefs.current.get(selectedWallId) : null;

    // Only allow translate and rotate for walls
    const wallTransformMode = transformMode === 'scale' ? 'translate' : transformMode;

    // Restriction Zone Collision — full SAT OBB vs OBB test in XZ plane
    const isIntersectingZone = useCallback((cx: number, cz: number, rotY: number) => {
        const wallCorners = getWallCorners(cx, cz, rotY);

        return restrictionZones.some(zone => {
            // Fast vertical reject: wall occupies Y=[0, WALL_HEIGHT]
            if (0 > zone.max_y || WALL_HEIGHT < zone.min_y) return false;

            const zoneCx = (zone.min_x + zone.max_x) / 2;
            const zoneCz = (zone.min_z + zone.max_z) / 2;
            const zoneHalfW = (zone.max_x - zone.min_x) / 2;
            const zoneHalfD = (zone.max_z - zone.min_z) / 2;
            const zoneCorners = getWallCorners(zoneCx, zoneCz, zone.rotation_y || 0, zoneHalfW, zoneHalfD);

            // 4 SAT axes: 2 from wall OBB edges + 2 from zone OBB edges
            const axes: THREE.Vector2[] = [
                [wallCorners[0], wallCorners[1]],
                [wallCorners[0], wallCorners[2]],
                [zoneCorners[0], zoneCorners[1]],
                [zoneCorners[0], zoneCorners[2]],
            ].map(([p1, p2]) => {
                const edge = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y);
                return new THREE.Vector2(-edge.y, edge.x).normalize();
            });

            for (const axis of axes) {
                let minA = Infinity, maxA = -Infinity;
                let minB = Infinity, maxB = -Infinity;
                for (const c of wallCorners) {
                    const proj = c.dot(axis);
                    if (proj < minA) minA = proj;
                    if (proj > maxA) maxA = proj;
                }
                for (const c of zoneCorners) {
                    const proj = c.dot(axis);
                    if (proj < minB) minB = proj;
                    if (proj > maxB) maxB = proj;
                }
                if (maxA <= minB || maxB <= minA) return false;
            }
            return true;
        });
    }, [restrictionZones]);

    // ─── Real-time clamping during drag ─────────────────────────────
    const handleTransformChange = useCallback(() => {
        if (!selectedWallId || !selectedWallRef) return;

        const pos = selectedWallRef.position;
        const rot = selectedWallRef.rotation;

        // Force Y position to stay constant
        pos.y = WALL_Y;

        // 1. Check room boundaries via raycasting — revert if any corner exits the floor
        if (!isWithinRoom(pos.x, pos.z, rot.y)) {
            const last = lastValidTransforms.current.get(selectedWallId);
            if (last) {
                pos.x = last.x;
                pos.z = last.z;
                rot.y = last.ry;
            }
            return;
        }

        // 2. Check wall-to-wall overlap — use getState() for fresh data (not stale closure)
        const currentWalls = useEditorStore.getState().localWalls;
        const otherWall = currentWalls.find(w => w.id !== selectedWallId);
        if (otherWall && wallsOverlap(pos.x, pos.z, rot.y, otherWall.position_x, otherWall.position_z, otherWall.rotation_y)) {
            // Revert to last valid position
            const last = lastValidTransforms.current.get(selectedWallId);
            if (last) {
                pos.x = last.x;
                pos.z = last.z;
                rot.y = last.ry;
            }
            return;
        }

        // 3. Check restriction zone collision
        if (isIntersectingZone(pos.x, pos.z, rot.y)) {
            const last = lastValidTransforms.current.get(selectedWallId);
            if (last) {
                pos.x = last.x;
                pos.z = last.z;
                rot.y = last.ry;
            }
            return;
        }

        // 4. Valid placement — propagate delta to child artworks, then update last known good position
        const prev = lastValidTransforms.current.get(selectedWallId);
        if (prev) {
            const dx = pos.x - prev.x;
            const dz = pos.z - prev.z;
            const dRy = rot.y - prev.ry;

            if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6 || Math.abs(dRy) > 1e-6) {
                const childInstances = useEditorStore.getState().localInstances
                    .filter(i => i.wallId === selectedWallId);

                // Precompute rotation quaternion once if needed
                const deltaQuat = Math.abs(dRy) > 1e-6
                    ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dRy)
                    : null;
                const cosR = Math.cos(dRy);
                const sinR = Math.sin(dRy);

                for (const inst of childInstances) {
                    const ref = instanceRefMap.get(inst.id);
                    if (!ref) continue;

                    if (deltaQuat) {
                        // Rotation: orbit position around wall center in XZ plane
                        const relX = ref.position.x - prev.x;
                        const relZ = ref.position.z - prev.z;
                        ref.position.x = pos.x + relX * cosR - relZ * sinR;
                        ref.position.z = pos.z + relX * sinR + relZ * cosR;
                        // Compose orientation via quaternion (Euler addition breaks with complex rotations)
                        ref.quaternion.premultiply(deltaQuat);
                    } else {
                        // Pure translation
                        ref.position.x += dx;
                        ref.position.z += dz;
                    }
                }
            }
        }

        lastValidTransforms.current.set(selectedWallId, { x: pos.x, z: pos.z, ry: rot.y });
    }, [selectedWallId, selectedWallRef, isWithinRoom, isIntersectingZone]);

    // Persist to store + backend on mouse-up
    const handleTransformEnd = useCallback(() => {
        setIsTransforming(false);

        if (!selectedWallId || !selectedWallRef) return;

        const pos = selectedWallRef.position;
        const rot = selectedWallRef.rotation;

        // Store the final position
        lastValidTransforms.current.set(selectedWallId, { x: pos.x, z: pos.z, ry: rot.y });

        const wallUpdates = {
            position_x: pos.x,
            position_y: WALL_Y,
            position_z: pos.z,
            rotation_x: 0,
            rotation_y: rot.y,
            rotation_z: 0,
        };

        // Update local store — auto-sync subscriber handles backend persistence
        updateWall(selectedWallId, wallUpdates);

        // Commit child artwork positions from their Three.js refs to the store
        // Auto-sync subscriber handles backend persistence
        const store = useEditorStore.getState();
        const childInstances = store.localInstances.filter(i => i.wallId === selectedWallId);
        if (childInstances.length > 0) {
            const updatedInstances = store.localInstances.map(inst => {
                if (inst.wallId !== selectedWallId) return inst;
                const ref = instanceRefMap.get(inst.id);
                if (!ref) return inst;
                return {
                    ...inst,
                    position_x: ref.position.x,
                    position_y: ref.position.y,
                    position_z: ref.position.z,
                    rotation_x: ref.rotation.x,
                    rotation_y: ref.rotation.y,
                    rotation_z: ref.rotation.z,
                };
            });
            store.commitLocalChange(updatedInstances);
        }
    }, [selectedWallId, selectedWallRef, updateWall, setIsTransforming, token, activeVersionId, localWalls]);

    const walls = viewerWalls ?? localWalls;

    return (
        <group>
            <Suspense fallback={null}>
                {walls.map((wall) => (
                    <Fragment key={wall.id}>
                        <ModularWallMesh
                            ref={setWallRef(wall.id)}
                            wall={wall}
                            selected={isEditor ? wall.id === selectedWallId : false}
                            isEditor={isEditor}
                        />
                        {/* Physics collider for first-person collision */}
                        <RigidBody
                            type="fixed"
                            colliders={false}
                            position={[wall.position_x, wall.position_y, wall.position_z]}
                            rotation={[wall.rotation_x, wall.rotation_y, wall.rotation_z]}
                        >
                            <CuboidCollider args={[wall.width / 2, wall.height / 2, wall.thickness / 2]} />
                        </RigidBody>
                    </Fragment>
                ))}
            </Suspense>

            {/* Editor-only: bounding box + transform controls */}
            {isEditor && selectedWallRef && <WallBoundingBox wallRef={selectedWallRef} />}

            {isEditor && selectedWall && selectedWallRef && !selectedWall.isLocked && (
                <TransformControls
                    ref={transformControlsRef}
                    object={selectedWallRef}
                    mode={wallTransformMode}
                    onMouseDown={() => setIsTransforming(true)}
                    onMouseUp={handleTransformEnd}
                    onChange={handleTransformChange}
                    showX={wallTransformMode !== 'rotate'}
                    showY={wallTransformMode === 'rotate'}
                    showZ={wallTransformMode !== 'rotate'}
                />
            )}
        </group>
    );
};
