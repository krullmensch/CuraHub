import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useEditorStore } from '../store/editorStore'; // We might listen to store to refetch
import { ArtworkInstanceMesh } from './ArtworkInstanceMesh';

export const ArtworkInstances = () => {
    const token = useAuthStore((state) => state.token);
    const isPlacing = useEditorStore((state) => state.isPlacing); 
    // naive refetch trigger: whenever we stop placing, we refetch?
    
    const [instances, setInstances] = useState<any[]>([]);

    const fetchInstances = async () => {
        if (!token) return;
        try {
            const res = await fetch('http://localhost:3000/instances', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setInstances(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchInstances();
    }, [token, isPlacing]); // Refetch when token changes or when we finish placing (toggle isPlacing)

    return (
        <group>
            {instances.map((inst) => (
                <ArtworkInstanceMesh 
                    key={inst.id}
                    id={inst.id}
                    position={[inst.position_x, inst.position_y, inst.position_z]}
                    rotation={[inst.rotation_x, inst.rotation_y, inst.rotation_z]}
                    scale={inst.scale}
                    artwork={inst.artwork}
                />
            ))}
        </group>
    );
};
