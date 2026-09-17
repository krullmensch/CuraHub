import { forwardRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { FRAME_MODEL, extractFrameParts, getFramePartTransforms } from '../lib/modularFrameParts';
import { getFrameMaterial } from '../lib/frameMaterials';
import { DEFAULT_FRAME_STYLE, type FrameStyleId } from '../lib/frameStyles';

interface ModularFrameProps {
    width: number;  // inner picture width in meters
    height: number; // inner picture height in meters
    styleId?: FrameStyleId;
}

/**
 * A single picture frame as 8 meshes. Placed artworks go through InstancedFrameSlot
 * (RND-01); this component remains for the drag ghost preview and as fallback.
 */
export const ModularFrame = forwardRef<THREE.Group, ModularFrameProps>(
    ({ width, height, styleId = DEFAULT_FRAME_STYLE }, ref) => {
        const { scene } = useGLTF(FRAME_MODEL);
        const parts = useMemo(() => extractFrameParts(scene), [scene]);
        const material = useMemo(() => getFrameMaterial(styleId, parts.baseMaterial), [styleId, parts]);
        const { corners, edges } = getFramePartTransforms(width, height, styleId);

        return (
            <group ref={ref}>
                {corners.map((part, i) => (
                    <mesh
                        key={`corner-${i}`}
                        geometry={parts.cornerGeometry}
                        material={material}
                        position={part.position}
                        rotation={part.rotation}
                        scale={part.scale}
                    />
                ))}
                {edges.map((part, i) => (
                    <mesh
                        key={`edge-${i}`}
                        geometry={parts.edgeGeometry}
                        material={material}
                        position={part.position}
                        rotation={part.rotation}
                        scale={part.scale}
                    />
                ))}
            </group>
        );
    }
);

ModularFrame.displayName = 'ModularFrame';

// Preload moved to EditorPage/ViewerPage (mount-time useEffect) so importing this
// component no longer downloads the frame GLB on every route, including the home page
// (LOAD-02).
