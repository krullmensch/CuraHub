import { useRef, useState, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';

export const ArtworkPlacement = () => {
    const { isPlacing, pendingArtwork, completePlacement } = useEditorStore();
    const token = useAuthStore((state) => state.token);
    const { camera, scene, pointer } = useThree();
    const raycaster = useRef(new THREE.Raycaster());
    const ghostRef = useRef<THREE.Mesh>(null);
    const [canPlace, setCanPlace] = useState(false);

    useFrame(() => {
        if (!isPlacing || !pendingArtwork || !ghostRef.current) return;

        raycaster.current.setFromCamera(pointer, camera);
        
        // Intersect with all meshes in the scene
        // In a real app, we might want to filter this to only "walls"
        const intersects = raycaster.current.intersectObjects(scene.children, true);
        
        // Filter out the ghost itself and non-mesh objects
        const hit = intersects.find(i => 
            i.object.type === 'Mesh' && 
            i.object !== ghostRef.current // && 
            // i.object.name.includes('Wall') // Optional specific filtering
        );

        if (hit) {
            setCanPlace(true);
            const { point, face } = hit;
            if (!face) return;

            // Position slightly off the wall to avoid z-fighting
            const normal = face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
            ghostRef.current.position.copy(point).add(normal.multiplyScalar(0.01));
            
            // Align rotation to the wall normal

            if (Math.abs(normal.y) > 0.99) {
                // If on floor/ceiling, change up vector
                ghostRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
            } else {
                ghostRef.current.lookAt(point.clone().add(normal));
            }
        } else {
            setCanPlace(false);
        }
    });

    // Use global click listener because raycast ignores the ghost mesh
    useEffect(() => {
        const handleGlobalClick = async () => {
             // Only allow placement if the pointer is locked to the game/canvas.
             // This prevents the "click to resume" action from placing the artwork.
             if (!document.pointerLockElement) {
                 return;
             }

             if (canPlace && isPlacing && pendingArtwork && ghostRef.current) {
                 if (!token) {
                     console.error("No token available");
                     return;
                 }
                 
                 console.log("Placing artwork at:", ghostRef.current.position);
                 
                 try {
                    const position = ghostRef.current.position;
                    const rotation = ghostRef.current.rotation;
                    
                    const response = await fetch('http://localhost:3000/instances', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            artworkId: pendingArtwork.id,
                            position: { x: position.x, y: position.y, z: position.z },
                            rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
                            scale: 1.0 
                        })
                    });

                    if (!response.ok) {
                        console.error('Failed to save placement');
                        alert('Failed to save placement');
                    } else {
                        console.log('Placement saved!');
                    }
                } catch(e) {
                    console.error(e);
                }
                
                completePlacement();
             }
        };

        window.addEventListener('click', handleGlobalClick);
        return () => window.removeEventListener('click', handleGlobalClick);
    }, [canPlace, isPlacing, pendingArtwork, token, completePlacement]); // dependencies important!

    if (!isPlacing || !pendingArtwork) return null;

    // Convert cm dimensions to meters (assuming 1 unit = 1 meter)
    const width = (pendingArtwork.width || 50) / 100; 
    const height = (pendingArtwork.height || 50) / 100;

    return (
        <mesh 
            ref={ghostRef} 
            // onClick removed, handled globally
            // Ignore raycast hits on itself
            raycast={() => null} 
        >
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial 
                color={canPlace ? "#00ff00" : "#ff0000"} 
                transparent 
                opacity={0.5} 
                side={THREE.DoubleSide}
            />
        </mesh>
    );
};
