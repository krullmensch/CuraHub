import { useRef, useState, useEffect, Suspense } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useEditorStore } from '../store/editorStore';

interface GhostPreviewProps {
    url: string;
    width: number;
    height: number;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    isValid: boolean;
}

const GhostPreview = ({ url, width, height, position, quaternion, isValid }: GhostPreviewProps) => {
    // Apply anisotropy for preview
    const gl = useThree((state) => state.gl);
    useEffect(() => {
        if (texture) {
            texture.anisotropy = gl.capabilities.getMaxAnisotropy();
            texture.needsUpdate = true;
        }
    }, [texture, gl]);

    // ... scaling logic ...

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

export const ArtworkPlacement = () => {
    const { isDragging, draggedAsset, dragPosition } = useEditorStore((state) => state.dragState);
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

        // Setup Raycaster from NDC
        raycaster.current.setFromCamera(new THREE.Vector2(dragPosition.x, dragPosition.y), camera);
        
        // Intersect
        const intersects = raycaster.current.intersectObjects(scene.children, true);
        
        // Find "Wall" mesh
        // We filter for objects named "Wall" first
        const wallHit = intersects.find(hit => hit.object.name === "Wall");

        // Debugging logs
        // console.log("All intersects:", intersects.map(i => i.object.name));
        // console.log("Wall hit:", wallHit);
        
        if (wallHit && wallHit.face) {
            const point = wallHit.point;
            const faceNormal = wallHit.face.normal.clone().transformDirection(wallHit.object.matrixWorld).normalize();
            
            // Check verticality (y component of normal should be close to 0)
            // Allow some tolerance
            const isVertical = Math.abs(faceNormal.y) < 0.1;
            
            // Orientation
            const quaternion = new THREE.Quaternion();
            if (Math.abs(faceNormal.y) > 0.99) {
                // Should not happen if we filter isVertical, but for robustness
                quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), faceNormal);
            } else {
                 // Look at the normal direction
                 const lookTarget = point.clone().add(faceNormal);
                 const dummy = new THREE.Object3D();
                 dummy.position.copy(point);
                 dummy.lookAt(lookTarget);
                 quaternion.copy(dummy.quaternion);
            }
            
            const position = point.clone().add(faceNormal.multiplyScalar(0.01)); // Offset slightly
            
            setGhostState({
                position,
                quaternion,
                isValid: isVertical
            });
            
            if (isVertical) {
                // (Duplicate/Intermediate logic removed)
                
                // Correction: Store expects [number, number, number].
                // API expects {x,y,z}.
                // Let's convert quaternion to Euler
                // Calculate Scale
                const MAX_DIMENSION = 3;
                const widthM = draggedAsset.width / 100;
                const heightM = draggedAsset.height / 100;
                let scale = 1;
                if (widthM > MAX_DIMENSION || heightM > MAX_DIMENSION) {
                    scale = MAX_DIMENSION / Math.max(widthM, heightM);
                }



                // Wall Bounds Check
                // We cast object to Mesh to access geometry
                const wallMesh = wallHit.object as THREE.Mesh;
                
                if (wallMesh.geometry) {
                    if (!wallMesh.geometry.boundingBox) wallMesh.geometry.computeBoundingBox();
                    // Basic check could go here, but for now we rely on auto-scaling logic above 
                    // which ensures it's at most 3m, which fits most walls.
                    // Implementation of strict "fits" check is complex due to segmented wall meshes.
                }

                const euler = new THREE.Euler().setFromQuaternion(quaternion);
                setValidPlacement({
                    position: [position.x, position.y, position.z],
                    rotation: [euler.x, euler.y, euler.z],
                    scale: scale
                });

            } else {
                setValidPlacement(null);
            }

        } else {
            // No wall hit
            setGhostState(null);
            setValidPlacement(null);
        }
    });
    
    // Reset on unmount
    useEffect(() => {
        return () => setValidPlacement(null);
    }, [setValidPlacement]);

    if (!isDragging || !draggedAsset || !ghostState) return null;

    return (
        <Suspense fallback={null}>
            <GhostPreview 
                url={draggedAsset.url}
                width={draggedAsset.width}
                height={draggedAsset.height}
                position={ghostState.position}
                quaternion={ghostState.quaternion}
                isValid={ghostState.isValid}
            />
        </Suspense>
    );
};
