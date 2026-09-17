import { forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { Lock } from 'lucide-react';
import { useEditorStore, type ModularWallData } from '@/store/editorStore';
import { sideFromDirection, sideSeenFrom } from '@/lib/wallEditor/geometry';

interface ModularWallMeshProps {
    wall: ModularWallData;
    selected: boolean;
    isEditor?: boolean;
    /** 2D wall editor: another wall is open — hide this one. */
    hidden?: boolean;
    /** 2D wall editor: this wall is open — draw it unlit, like a plan. */
    flat?: boolean;
}

const _cameraPos = new THREE.Vector3();
const _faceNormal = new THREE.Vector3();

export const ModularWallMesh = forwardRef<THREE.Group, ModularWallMeshProps>(
    ({ wall, selected, isEditor = true, hidden = false, flat = false }, ref) => {
        const selectWall = useEditorStore((state) => state.selectWall);
        const openWallEditor = useEditorStore((state) => state.openWallEditor);
        const inWallEditor = hidden || flat;

        const handleClick = isEditor ? (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            selectWall(wall.id);
        } : undefined;

        // Double-click opens the 2D wall editor on the face that was clicked (incl. the narrow ends).
        const handleDoubleClick = isEditor ? (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            let side;
            if (e.face) {
                _faceNormal.copy(e.face.normal).transformDirection(e.object.matrixWorld);
                side = sideFromDirection(wall, _faceNormal.x, _faceNormal.z);
            } else {
                e.camera.getWorldPosition(_cameraPos);
                side = sideSeenFrom(wall, _cameraPos);
            }
            openWallEditor({ kind: 'wall', wallId: wall.id, side });
        } : undefined;

        // Wall color — slightly tinted when selected
        const wallColor = selected ? '#e0e0ff' : wall.color;
        const flatColor = useMemo(() => new THREE.Color(wall.color).multiplyScalar(0.93), [wall.color]);

        return (
            <group
                ref={ref}
                position={[wall.position_x, wall.position_y, wall.position_z]}
                rotation={[wall.rotation_x, wall.rotation_y, wall.rotation_z]}
                visible={!hidden}
            >
                {/* Main wall mesh */}
                <mesh
                    name="ModularWall"
                    onClick={handleClick}
                    onDoubleClick={handleDoubleClick}
                    userData={{ wallId: wall.id }}
                >
                    <boxGeometry args={[wall.width, wall.height, wall.thickness]} />
                    {flat ? (
                        <meshBasicMaterial color={flatColor} toneMapped={false} />
                    ) : (
                        <meshStandardMaterial
                            color={wallColor}
                            roughness={0.9}
                            metalness={0.02}
                        />
                    )}
                </mesh>

                {/* Selection outline effect */}
                {selected && (
                    <mesh>
                        <boxGeometry args={[
                            wall.width + 0.02,
                            wall.height + 0.02,
                            wall.thickness + 0.02
                        ]} />
                        <meshBasicMaterial
                            color="#4488ff"
                            transparent
                            opacity={0.15}
                            side={THREE.BackSide}
                        />
                    </mesh>
                )}

                {/* Lock indicator (editor only) */}
                {isEditor && !inWallEditor && wall.isLocked && (
                    <Html
                        position={[0, wall.height / 2 + 0.15, 0]}
                        center
                        style={{ pointerEvents: 'none' }}
                    >
                        <div style={{
                            background: 'rgba(0,0,0,0.7)',
                            borderRadius: '50%',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <Lock size={14} color="white" />
                        </div>
                    </Html>
                )}

                {/* Wall label (editor only) */}
                {isEditor && !inWallEditor && wall.label && (
                    <Html
                        position={[0, -wall.height / 2 - 0.15, 0]}
                        center
                        style={{ pointerEvents: 'none' }}
                    >
                        <div style={{
                            background: 'rgba(0,0,0,0.6)',
                            color: 'white',
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            whiteSpace: 'nowrap',
                            fontFamily: '"Albert Sans", sans-serif',
                        }}>
                            {wall.label}
                        </div>
                    </Html>
                )}
            </group>
        );
    }
);

ModularWallMesh.displayName = 'ModularWallMesh';
