import { useRef, useState, useEffect, Suspense } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useEditorStore, WALL_PLACEMENT_OFFSET } from '../store/editorStore';
import { ModularFrame } from './ModularFrame';

// Halbe_Classic_Alu8 frame profile depth (Z) — matches SelectableInstance.
const FRAME_PROFILE_DEPTH = 0.027;
const IMAGE_INSET_FROM_FRONT = 0.004;
// Same back-face compensation as SelectableInstance so the ghost preview
// already shows the artwork sitting flush on the wall while dragging.
const GHOST_FRAME_Z = -WALL_PLACEMENT_OFFSET;
const GHOST_IMAGE_Z = GHOST_FRAME_Z + FRAME_PROFILE_DEPTH - IMAGE_INSET_FROM_FRONT;

interface GhostPreviewProps {
    url: string;
    width: number;
    height: number;
    dpi: number;
    artworkWidth?: number;
    artworkHeight?: number;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    isValid: boolean;
}

const GhostPreview = ({ url, width, height, dpi, artworkWidth, artworkHeight, position, quaternion, isValid }: GhostPreviewProps) => {
    // Apply anisotropy for preview
    const texture = useTexture(url);
    const gl = useThree((state) => state.gl);
    useEffect(() => {
        if (texture) {
            // eslint-disable-next-line react-hooks/immutability
            texture.anisotropy = gl.capabilities.getMaxAnisotropy();
            // eslint-disable-next-line react-hooks/immutability
            texture.needsUpdate = true;
        }
    }, [texture, gl]);

    // Use physical dimensions from artwork if available (in cm -> convert to meters)
    // Otherwise, fallback to DPI-based sizing: (pixels / dpi) * 0.0254 = meters
    const hasPhysicalSize = artworkWidth != null && artworkHeight != null;
    const widthM = hasPhysicalSize ? (artworkWidth! / 100) : (width / dpi) * 0.0254;
    const heightM = hasPhysicalSize ? (artworkHeight! / 100) : (height / dpi) * 0.0254;
    const MAX_DIMENSION = 3;
    let scale = 1;
    if (widthM > MAX_DIMENSION || heightM > MAX_DIMENSION) {
        scale = MAX_DIMENSION / Math.max(widthM, heightM);
    }

    return (
        <group position={position} quaternion={quaternion} scale={[scale, scale, 1]} name="__ghost__">
            <group position={[0, 0, GHOST_FRAME_Z]} name="__ghost__">
                <ModularFrame width={widthM} height={heightM} />
            </group>
            <mesh position={[0, 0, GHOST_IMAGE_Z]} name="__ghost__">
                <planeGeometry args={[widthM, heightM]} />
                <meshBasicMaterial
                    map={texture}
                    transparent
                    opacity={0.6}
                    color={isValid ? "#4ade80" : "#f87171"}
                    side={THREE.DoubleSide}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
};

// Ghost preview for 3D models — simple translucent box
// name="__ghost__" is used to exclude this mesh from raycaster intersections
const ModelGhostPreview = ({ position, isValid }: { position: THREE.Vector3; isValid: boolean }) => {
    return (
        <group position={position} name="__ghost__">
            <mesh name="__ghost__">
                <boxGeometry args={[0.5, 0.5, 0.5]} />
                <meshBasicMaterial
                    color={isValid ? "#4ade80" : "#f87171"}
                    transparent
                    opacity={0.4}
                    wireframe={false}
                />
            </mesh>
            <mesh name="__ghost__">
                <boxGeometry args={[0.5, 0.5, 0.5]} />
                <meshBasicMaterial
                    color={isValid ? "#22c55e" : "#ef4444"}
                    wireframe
                    transparent
                    opacity={0.8}
                />
            </mesh>
        </group>
    );
};

export const ArtworkPlacement = () => {
    // Select specific properties to avoid re-rendering when validPlacement changes
    const isDragging = useEditorStore((state) => state.dragState.isDragging);
    const draggedAsset = useEditorStore((state) => state.dragState.draggedAsset);
    const dragPosition = useEditorStore((state) => state.dragState.dragPosition);
    const setValidPlacement = useEditorStore((state) => state.setValidPlacement);

    const { camera, scene } = useThree();
    const raycaster = useRef(new THREE.Raycaster());

    // Local state for smooth updates (though we update store for validation)
    const [ghostState, setGhostState] = useState<{
        position: THREE.Vector3;
        quaternion: THREE.Quaternion;
        isValid: boolean;
    } | null>(null);

    useFrame(() => {
        if (!isDragging || !draggedAsset || !dragPosition) {
            if (ghostState) {
                setGhostState(null);
                setValidPlacement(null);
            }
            return;
        }

        const isModel = draggedAsset.assetType === 'model3d';

        // Setup Raycaster from NDC
        raycaster.current.setFromCamera(new THREE.Vector2(dragPosition.x, dragPosition.y), camera);

        // Intersect — exclude ghost meshes and invisible objects.
        // Three.js does NOT skip invisible meshes in raycasting, so we must filter
        // them manually. This prevents the hidden ceiling from blocking floor hits
        // when the camera is positioned above the room in editor mode.
        const intersects = raycaster.current
            .intersectObjects(scene.children, true)
            .filter(hit => {
                // Walk the parent chain — any ancestor named __ghost__ disqualifies
                // the hit (the ghost preview's nested ModularFrame meshes don't carry
                // the name themselves but live under a __ghost__ group).
                let obj: THREE.Object3D | null = hit.object;
                while (obj) {
                    if (obj.name === '__ghost__') return false;
                    if (!obj.visible) return false;
                    obj = obj.parent;
                }
                return true;
            });

        if (isModel) {
            // ── 3D MODEL: floor placement ──
            // A valid placement is a horizontal surface (normal.y > 0.85) at floor level (y < 0.1).
            // We look for the closest horizontal hit regardless of height, then decide validity by y.
            const horizontalHit = intersects.find(hit => {
                if (!hit.face) return false;
                const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
                return normal.y > 0.85;
            });

            if (horizontalHit) {
                const isValid = horizontalHit.point.y < 0.1; // floor ≈ y=0; wall tops / traverses are higher
                const position = horizontalHit.point.clone();
                if (isValid) {
                    // Snap to exact floor level so model always sits at y=0
                    position.y = 0;
                }

                setGhostState({ position, quaternion: new THREE.Quaternion(), isValid });

                if (isValid) {
                    setValidPlacement({
                        position: [position.x, 0, position.z],
                        rotation: [0, 0, 0],
                        scale: 1,
                        wallId: null,
                    });
                } else {
                    setValidPlacement(null);
                }
            } else {
                setGhostState(null);
                setValidPlacement(null);
            }
            return;
        }

        // ── IMAGE / VIDEO: wall placement (existing logic) ──
        const wallHit = intersects.find(hit =>
            hit.object.name === "Wall" ||
            hit.object.name === "Misc" ||
            hit.object.name === "Door" ||
            hit.object.name === "ModularWall"
        );

        if (wallHit && wallHit.face) {
            const point = wallHit.point;
            const faceNormal = wallHit.face.normal.clone().transformDirection(wallHit.object.matrixWorld).normalize();

            const isVertical = Math.abs(faceNormal.y) < 0.1;

            const quaternion = new THREE.Quaternion();
            if (Math.abs(faceNormal.y) > 0.99) {
                quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), faceNormal);
            } else {
                 const lookTarget = point.clone().add(faceNormal);
                 const dummy = new THREE.Object3D();
                 dummy.position.copy(point);
                 dummy.lookAt(lookTarget);
                 quaternion.copy(dummy.quaternion);
            }

            const position = point.clone().add(faceNormal.multiplyScalar(0.01));

            let isUnlockedWall = false;
            if (wallHit.object.name === "ModularWall") {
                const hitWallId = wallHit.object.userData.wallId as number | undefined;
                if (hitWallId != null) {
                    const wall = useEditorStore.getState().localWalls.find(w => w.id === hitWallId);
                    isUnlockedWall = !!wall && !wall.isLocked;
                }
            }

            const isValid = isVertical && !isUnlockedWall;

            setGhostState({
                position,
                quaternion,
                isValid: isValid
            });

            if (isValid) {
                const dpi = draggedAsset.dpi || 72;
                const MAX_DIMENSION = 3;
                const hasPhysicalSize = draggedAsset.artworkWidth != null && draggedAsset.artworkHeight != null;
                const widthM = hasPhysicalSize ? (draggedAsset.artworkWidth! / 100) : (draggedAsset.width / dpi) * 0.0254;
                const heightM = hasPhysicalSize ? (draggedAsset.artworkHeight! / 100) : (draggedAsset.height / dpi) * 0.0254;
                let scale = 1;
                if (widthM > MAX_DIMENSION || heightM > MAX_DIMENSION) {
                    scale = MAX_DIMENSION / Math.max(widthM, heightM);
                }

                const wallMesh = wallHit.object as THREE.Mesh;
                if (wallMesh.geometry) {
                    if (!wallMesh.geometry.boundingBox) wallMesh.geometry.computeBoundingBox();
                }

                const euler = new THREE.Euler().setFromQuaternion(quaternion);
                const hitWallId = wallHit.object.name === "ModularWall"
                    ? (wallHit.object.userData.wallId as number | undefined) ?? null
                    : null;
                setValidPlacement({
                    position: [position.x, position.y, position.z],
                    rotation: [euler.x, euler.y, euler.z],
                    scale: scale,
                    wallId: hitWallId,
                });

            } else {
                setValidPlacement(null);
            }

        } else {
            setGhostState(null);
            setValidPlacement(null);
        }
    });

    // Reset on unmount
    useEffect(() => {
        return () => setValidPlacement(null);
    }, [setValidPlacement]);

    if (!isDragging || !draggedAsset || !ghostState) return null;

    // 3D model ghost
    if (draggedAsset.assetType === 'model3d') {
        return <ModelGhostPreview position={ghostState.position} isValid={ghostState.isValid} />;
    }

    // Image / video ghost (video uses poster thumbnail as texture)
    return (
        <Suspense fallback={null}>
            <GhostPreview
                url={draggedAsset.url}
                width={draggedAsset.width}
                height={draggedAsset.height}
                dpi={draggedAsset.dpi}
                artworkWidth={draggedAsset.artworkWidth}
                artworkHeight={draggedAsset.artworkHeight}
                position={ghostState.position}
                quaternion={ghostState.quaternion}
                isValid={ghostState.isValid}
            />
        </Suspense>
    );
};
