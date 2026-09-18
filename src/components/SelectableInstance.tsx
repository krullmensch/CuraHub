import { forwardRef, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, WALL_PLACEMENT_OFFSET, type ArtworkInstanceData } from '../store/editorStore';
import { InstancedFrameSlot } from './FrameInstancer';
import { Passepartout } from './Passepartout';
import { framedArtworkLayout } from '../lib/frameStyles';
import { useArtworkTexture } from '../hooks/use-artwork-texture';
import { useRenderQualitySettings } from '../hooks/use-render-quality';

// Render so the frame's back face sits at outer-group local z = -WALL_PLACEMENT_OFFSET,
// cancelling out the placement offset baked into stored positions so the back is
// flush against the wall surface.
const FRAME_Z = -WALL_PLACEMENT_OFFSET;

interface SelectableInstanceProps {
    instance: ArtworkInstanceData;
    selected: boolean;
    isEditor?: boolean;
}

export const SelectableInstance = forwardRef<THREE.Group, SelectableInstanceProps>(
    ({ instance, selected, isEditor = true }, ref) => {
        const asset = instance.artwork.asset;
        const selectInstance = useEditorStore((state) => state.selectInstance);
        const { basicMaterials } = useRenderQualitySettings();
        const imageRef = useRef<THREE.Mesh>(null);

        // Use physical dimensions from artwork if available (in cm -> convert to meters)
        // Otherwise, fallback to DPI-based sizing: (pixels / dpi) * 0.0254 = meters
        const hasPhysicalSize = instance.artwork.width != null && instance.artwork.height != null;
        const baseWidth = hasPhysicalSize
            ? (instance.artwork.width! / 100)
            : (asset.width / (asset.dpi || 72)) * 0.0254;
        const baseHeight = hasPhysicalSize
            ? (instance.artwork.height! / 100)
            : (asset.height / (asset.dpi || 72)) * 0.0254;

        // Outer group keeps `instance.scale_*` so TransformControls and the modal
        // transform system still drive resizing through the Three.js matrix. An
        // inverse-scale child group cancels that scale for geometry, and we pass the
        // *effective* dimensions (base × scale) into the frame + image plane.
        // Net effect: edges stretch in length and corners reposition, but the frame
        // profile thickness stays constant — the whole picture area grows, the bevel
        // around it does not.
        const EPS = 1e-4;
        const sx = Math.abs(instance.scale_x) > EPS ? instance.scale_x : 1;
        const sy = Math.abs(instance.scale_y) > EPS ? instance.scale_y : 1;
        const sz = Math.abs(instance.scale_z) > EPS ? instance.scale_z : 1;
        const effWidth = baseWidth * sx;
        const effHeight = baseHeight * sy;

        // Frame and passepartout are per instance. The picture stays where it was placed; a
        // passepartout widens the frame's opening around it, and the chosen profile decides how
        // far everything stands off the wall and how deep the picture sits behind the frame.
        const layout = framedArtworkLayout({
            width: effWidth,
            height: effHeight,
            frameStyle: instance.frameStyle,
            passepartoutWidth: instance.passepartoutWidth,
            passepartoutPlacement: instance.passepartoutPlacement,
        });
        const imageZ = FRAME_Z + layout.pictureZ;

        // LOAD-05: resolution follows the on-screen size; the selected artwork gets the
        // highest resolution the render preset allows.
        const bindMaterial = useArtworkTexture(instance.id, {
            path: asset.path,
            thumbnailPath: asset.thumbnailPath ?? null,
            pixelWidth: asset.width || 0,
            pixelHeight: asset.height || 0,
            sizeM: Math.max(Math.abs(effWidth), Math.abs(effHeight)),
            forceMax: isEditor && selected,
        }, imageRef);

        const handleClick = (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            selectInstance(instance.id);
        };

        return (
            <group
                ref={ref}
                position={[instance.position_x, instance.position_y, instance.position_z]}
                rotation={[instance.rotation_x, instance.rotation_y, instance.rotation_z]}
                scale={[sx, sy, sz]}
                onClick={handleClick}
            >
                {/* Inverse-scale wrapper: geometry under this group renders at its
                    intrinsic size regardless of the outer instance scale. Positions
                    are preserved (outer_scale * inverse_scale = identity), so the
                    wall-flush offset and image inset stay correct. */}
                <group scale={[1 / sx, 1 / sy, 1 / sz]}>
                    {/* Picture frame in the instance's style — wrapped so we can offset
                        the entire frame back so it sits flush on the wall. Drawn by
                        FrameInstancer (RND-01), one instanced pair per style. */}
                    {layout.style && (
                        <group position={[0, 0, FRAME_Z]}>
                            <group position={[0, layout.openingOffsetY, 0]}>
                                <InstancedFrameSlot width={layout.openingWidth} height={layout.openingHeight} styleId={layout.style.id} />
                            </group>
                            {layout.passepartout && (
                                <Passepartout pictureWidth={effWidth} pictureHeight={effHeight} layout={layout.passepartout} />
                            )}
                        </group>
                    )}

                    {/* Image plane, just behind the frame's lip (or the passepartout's window).
                        RND-04: unlit MeshBasicMaterial (true photo colours, cheap) unless the
                        "high" preset asks for lit PBR. */}
                    <mesh ref={imageRef} position={[0, 0, imageZ]} castShadow={false} receiveShadow={false}>
                        <planeGeometry args={[effWidth, effHeight]} />
                        {basicMaterials ? (
                            <meshBasicMaterial ref={bindMaterial} side={THREE.DoubleSide} toneMapped={false} />
                        ) : (
                            <meshStandardMaterial
                                ref={bindMaterial}
                                side={THREE.DoubleSide}
                                roughness={1}
                                metalness={0}
                                transparent={false}
                            />
                        )}
                    </mesh>

                    {/* Selection halo — backside-rendered enlarged box (same pattern as ModularWallMesh) */}
                    {selected && (
                        <mesh position={[(layout.left + layout.right) / 2, (layout.bottom + layout.top) / 2, FRAME_Z + layout.depth / 2]}>
                            <boxGeometry args={[layout.right - layout.left + 0.05, layout.top - layout.bottom + 0.05, layout.depth + 0.01]} />
                            <meshBasicMaterial
                                color="#4488ff"
                                transparent
                                opacity={0.25}
                                side={THREE.BackSide}
                            />
                        </mesh>
                    )}
                </group>
            </group>
        );
    }
);

SelectableInstance.displayName = 'SelectableInstance';
