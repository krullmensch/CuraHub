import { forwardRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { Lock } from 'lucide-react';
import { useEditorStore, type ModularWallData } from '@/store/editorStore';

interface ModularWallMeshProps {
    wall: ModularWallData;
    selected: boolean;
    isEditor?: boolean;
}

export const ModularWallMesh = forwardRef<THREE.Group, ModularWallMeshProps>(
    ({ wall, selected, isEditor = true }, ref) => {
        const selectWall = useEditorStore((state) => state.selectWall);

        const handleClick = isEditor ? (e: any) => {
            e.stopPropagation();
            selectWall(wall.id);
        } : undefined;

        // Wall color — slightly tinted when selected
        const wallColor = selected ? '#e0e0ff' : wall.color;

        return (
            <group
                ref={ref}
                position={[wall.position_x, wall.position_y, wall.position_z]}
                rotation={[wall.rotation_x, wall.rotation_y, wall.rotation_z]}
            >
                {/* Main wall mesh */}
                <mesh
                    name="ModularWall"
                    castShadow
                    receiveShadow
                    onClick={handleClick}
                    userData={{ wallId: wall.id }}
                >
                    <boxGeometry args={[wall.width, wall.height, wall.thickness]} />
                    <meshStandardMaterial
                        color={wallColor}
                        roughness={0.9}
                        metalness={0.02}
                    />
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
                {isEditor && wall.isLocked && (
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
                {isEditor && wall.label && (
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
