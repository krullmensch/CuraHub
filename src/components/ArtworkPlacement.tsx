import { useRef, useState, useEffect, Suspense } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useEditorStore } from '../store/editorStore';

interface GhostPreviewProps {
    url: string;
    width: number;
    height: number;
    dpi: number;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    isValid: boolean;
}

const GhostPreview = ({ url, width, height, dpi, position, quaternion, isValid }: GhostPreviewProps) => {
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

    // DPI-based sizing: (pixels / dpi) * 0.0254 = meters
    const widthM = (width / dpi) * 0.0254;
    const heightM = (height / dpi) * 0.0254;
    const MAX_DIMENSION = 3;
    let scale = 1;
    if (widthM > MAX_DIMENSION || heightM > MAX_DIMENSION) {
        scale = MAX_DIMENSION / Math.max(widthM, heightM);
    }

    return (
        <group position={position} quaternion={quaternion} scale={[scale, scale, 1]}>
             <mesh position={[0, 0, 0.02]}>
                 <planeGeometry args={[widthM, heightM]} />
                 <meshBasicMaterial
                     map={texture}
                     transparent
                     opacity={0.6}
                     color={isValid ? "#4ade80" : "#f87171"}
                     side={THREE.DoubleSide}
                     toneMapped={false}
                 />
                 {/* Thin frame from previous steps */}
                 <mesh position={[0, 0, -0.02]}>
                     <boxGeometry args={[widthM + 0.05, heightM + 0.05, 0.01]} />
                     <meshBasicMaterial color={isValid ? "#22c55e" : "#ef4444"} transparent opacity={0.3} />
                 </mesh>
             </mesh>
        </group>
    );
};

// Ghost preview for 3D models — simple translucent box
const ModelGhostPreview = ({ position, isValid }: { position: THREE.Vector3; isValid: boolean }) => {
    return (
        <group position={position}>
            <mesh>
                <boxGeometry args={[0.5, 0.5, 0.5]} />
                <meshBasicMaterial
                    color={isValid ? "#a78bfa" : "#f87171"}
                    transparent
                    opacity={0.4}
                    wireframe={false}
                />
            </mesh>
            <mesh>
                <boxGeometry args={[0.5, 0.5, 0.5]} />
                <meshBasicMaterial
                    color={isValid ? "#7c3aed" : "#ef4444"}
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
    const restrictionZones = useEditorStore((state) => state.restrictionZones);

    const { camera, scene } = useThree();
    const raycaster = useRef(new THREE.Raycaster());

    // Local state for smooth updates (though we update store for validation)
    const [ghostState, setGhostState] = useState<{
        position: THREE.Vector3;
        quaternion: THREE.Quaternion;
        isValid: boolean;
    } | null>(null);

    // Collision check helper (handles rotated RestrictionZones OBBs)
    const isInsideRestriction = (pos: THREE.Vector3) => {
        return restrictionZones.some(zone => {
            const cx = (zone.min_x + zone.max_x) / 2;
            const cy = (zone.min_y + zone.max_y) / 2;
            const cz = (zone.min_z + zone.max_z) / 2;
            const w = zone.max_x - zone.min_x;
            const h = zone.max_y - zone.min_y;
            const d = zone.max_z - zone.min_z;

            const localPos = new THREE.Vector3(pos.x - cx, pos.y - cy, pos.z - cz);
            if (zone.rotation_y) {
                localPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), -zone.rotation_y);
            }

            return (
                localPos.x >= -w / 2 && localPos.x <= w / 2 &&
                localPos.y >= -h / 2 && localPos.y <= h / 2 &&
                localPos.z >= -d / 2 && localPos.z <= d / 2
            );
        });
    };

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

        // Intersect
        const intersects = raycaster.current.intersectObjects(scene.children, true);

        if (isModel) {
            // ── 3D MODEL: floor placement ──
            const floorHit = intersects.find(hit => {
                if (!hit.face) return false;
                const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
                // Horizontal surface (floor): normal pointing up
                return normal.y > 0.9 || hit.object.name === "Floor";
            });

            if (floorHit) {
                const position = floorHit.point.clone();
                const isRestricted = isInsideRestriction(position);
                const isValid = !isRestricted;

                setGhostState({
                    position,
                    quaternion: new THREE.Quaternion(),
                    isValid,
                });

                if (isValid) {
                    setValidPlacement({
                        position: [position.x, position.y, position.z],
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

            const isRestricted = isInsideRestriction(position);

            let isUnlockedWall = false;
            if (wallHit.object.name === "ModularWall") {
                const hitWallId = wallHit.object.userData.wallId as number | undefined;
                if (hitWallId != null) {
                    const wall = useEditorStore.getState().localWalls.find(w => w.id === hitWallId);
                    isUnlockedWall = !!wall && !wall.isLocked;
                }
            }

            const isValid = isVertical && !isRestricted && !isUnlockedWall;

            setGhostState({
                position,
                quaternion,
                isValid: isValid
            });

            if (isValid) {
                const dpi = draggedAsset.dpi || 72;
                const MAX_DIMENSION = 3;
                const widthM = (draggedAsset.width / dpi) * 0.0254;
                const heightM = (draggedAsset.height / dpi) * 0.0254;
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
                position={ghostState.position}
                quaternion={ghostState.quaternion}
                isValid={ghostState.isValid}
            />
        </Suspense>
    );
};
