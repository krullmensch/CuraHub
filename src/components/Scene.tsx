import { useGLTF, Grid } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';

export const Scene = () => {
    const gltf = useGLTF('/models/Satellit.glb');

    return (
        <>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            {/* Show grid only during development/editing if needed, or keeping it for reference */}
            <Grid args={[20, 20]} cellColor="white" sectionColor="gray" infiniteGrid fadeDistance={50} position={[0, -0.01, 0]} />
            
            <RigidBody type="fixed" colliders="trimesh">
                <primitive object={gltf.scene} />
            </RigidBody>
        </>
    );
};

useGLTF.preload('/models/Satellit.glb');
