import { Suspense } from 'react';
import { Grid } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';
import { Satellit } from './Satellit';
import { PlacedArtworks } from './PlacedArtworks';
import { PlannerCameraSystem } from './PlannerCameraSystem';
import { useEditorStore } from '../store/editorStore';

interface SceneProps {
    isEditor?: boolean;
}

export const Scene = ({ isEditor = true }: SceneProps) => {
    const plannerViewMode = useEditorStore(state => state.plannerViewMode);
    
    // In Viewer mode (not editor), always force First Person
    const viewMode = isEditor ? plannerViewMode : 'firstPerson';

    return (
        <>
            {/* Only use Planner Camera System in Editor Mode */}
            {isEditor && <PlannerCameraSystem />}

            {/* Lighting Setup */}
            {/* Ambient Light: Base level illumination */}
            <ambientLight intensity={.9} />

            {/* Key Light: Main directional light casting shadows */}
            <directionalLight 
                position={[-2, 4, -5]} 
                intensity={2} 
                castShadow 
                shadow-mapSize={[2048, 2048]}
                shadow-bias={-0.0001}
            >
                <orthographicCamera attach="shadow-camera" args={[-10, 10, 10, -10]} />
            </directionalLight>

            {/* Fill Light: Softens shadows from the opposite side */}
            <pointLight position={[-5, 5, -5]} intensity={0.5} color="#eef" />

            {/* Show grid only in Editor (and not in First Person) */}
            {isEditor && viewMode !== 'firstPerson' && (
                <Grid args={[20, 20]} cellColor="white" sectionColor="gray" infiniteGrid fadeDistance={50} position={[0, -0.01, 0]} />
            )}
            
            <RigidBody type="fixed" colliders="trimesh">
                <Satellit viewMode={viewMode} />
            </RigidBody>

            <Suspense fallback={null}>
                <PlacedArtworks />
            </Suspense>
        </>
    );
};


