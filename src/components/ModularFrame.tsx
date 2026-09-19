import { forwardRef } from 'react';
import * as THREE from 'three';
import { getFrameParts, getFramePartTransforms } from '../lib/frameProfileGeometry';
import { getFrameStyleMaterial } from '../lib/frameMaterials';
import { DEFAULT_FRAME_STYLE, frameStyle, type FrameStyleId } from '../lib/frameStyles';

interface ModularFrameProps {
    width: number;  // frame opening width in meters (picture or passepartout)
    height: number; // frame opening height in meters
    styleId?: FrameStyleId;
}

/**
 * A single picture frame as 8 meshes. Placed artworks go through InstancedFrameSlot
 * (RND-01); this component remains for the drag ghost preview and as fallback.
 */
export const ModularFrame = forwardRef<THREE.Group, ModularFrameProps>(
    ({ width, height, styleId = DEFAULT_FRAME_STYLE }, ref) => {
        const style = frameStyle(styleId);
        if (!style) return <group ref={ref} />;
        const parts = getFrameParts(style.profile.id);
        const material = getFrameStyleMaterial(style);
        const { corners, edges } = getFramePartTransforms(width, height);

        return (
            <group ref={ref}>
                {corners.map((part, i) => (
                    <mesh
                        key={`corner-${i}`}
                        geometry={parts.cornerGeometry}
                        material={material}
                        position={part.position}
                        rotation={[0, 0, part.angle]}
                    />
                ))}
                {edges.map((part, i) => (
                    <mesh
                        key={`edge-${i}`}
                        geometry={parts.edgeGeometry}
                        material={material}
                        position={part.position}
                        rotation={[0, 0, part.angle]}
                        scale={[Math.max(part.length, 1e-6), 1, 1]}
                    />
                ))}
            </group>
        );
    }
);

ModularFrame.displayName = 'ModularFrame';
