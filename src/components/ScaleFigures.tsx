import { memo, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { TransformControls, useGLTF } from '@react-three/drei';
import { useEditorStore, type ScaleFigureData } from '@/store/editorStore';
import { useAuthStore } from '@/store/authStore';
import { SCALE_FIGURE_MESH, SCALE_FIGURE_URL, scaleFigureBridge, spawnPoseFromCamera } from '@/lib/scaleFigure';

useGLTF.preload(SCALE_FIGURE_URL);

// Shared by every figure: matte black, faceted. Selected: dark blue.
const FIGURE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.9, metalness: 0, flatShading: true });
const SELECTED_MATERIAL = new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.9, metalness: 0, flatShading: true });

const _euler = new THREE.Euler();
const _direction = new THREE.Vector3();

/** Turn around the vertical axis, in the full ±π range (XYZ Euler folds it into ±π/2). */
const yawOf = (object: THREE.Object3D): number => _euler.setFromQuaternion(object.quaternion, 'YXZ').y;

interface FigureProps {
    figure: ScaleFigureData;
    geometry: THREE.BufferGeometry;
    selected: boolean;
    onSelect?: (id: number) => void;
    groupRef?: (group: THREE.Group | null) => void;
}

const Figure = memo(function Figure({ figure, geometry, selected, onSelect, groupRef }: FigureProps) {
    return (
        <group
            ref={groupRef}
            position={[figure.position_x, 0, figure.position_z]}
            rotation={[0, figure.rotation_y, 0]}
            userData={{ scaleFigure: true }}
        >
            <mesh
                name="ScaleFigure"
                geometry={geometry}
                material={selected ? SELECTED_MATERIAL : FIGURE_MATERIAL}
                onClick={onSelect ? (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(figure.id); } : undefined}
            />
        </group>
    );
});

interface ScaleFiguresProps {
    /** Viewer: the published version's public figures. Editor: leave undefined (store). */
    viewerFigures?: ScaleFigureData[];
    isEditor?: boolean;
}

export const ScaleFigures = ({ viewerFigures, isEditor = true }: ScaleFiguresProps) => {
    const { nodes } = useGLTF(SCALE_FIGURE_URL);
    const geometry = (nodes[SCALE_FIGURE_MESH] as THREE.Mesh).geometry;
    const camera = useThree((s) => s.camera);

    const localFigures = useEditorStore((s) => s.localScaleFigures);
    const selectedFigureId = useEditorStore((s) => (isEditor ? s.selectedFigureId : null));
    const wallEditorOpen = useEditorStore((s) => isEditor && !!s.wallEditor);
    const transformMode = useEditorStore((s) => s.transformMode);
    const activeVersionId = useEditorStore((s) => s.activeVersionId);
    const selectFigure = useEditorStore((s) => s.selectFigure);
    const updateScaleFigure = useEditorStore((s) => s.updateScaleFigure);
    const setIsTransforming = useEditorStore((s) => s.setIsTransforming);
    const setLocalScaleFigures = useEditorStore((s) => s.setLocalScaleFigures);
    const hasToken = useAuthStore((s) => !!s.token);

    const interactive = isEditor && !viewerFigures;
    // The selected figure's group, set through its ref (null when nothing is selected)
    const [selectedObject, setSelectedObject] = useState<THREE.Group | null>(null);

    // Editor: load the version's figures
    useEffect(() => {
        if (!interactive) return;
        if (!hasToken || !activeVersionId) {
            setLocalScaleFigures([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/scale-figures?versionId=${activeVersionId}`, {
                    headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: ScaleFigureData[] = await res.json();
                if (!cancelled) setLocalScaleFigures(data);
            } catch (err) {
                console.error('Failed to load scale figures:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [interactive, hasToken, activeVersionId, setLocalScaleFigures]);

    // Editor: the toolbar asks here where a new figure goes
    useEffect(() => {
        if (!interactive) return;
        scaleFigureBridge.spawnPose = () => {
            camera.getWorldDirection(_direction);
            return spawnPoseFromCamera(camera.position, _direction);
        };
        return () => { scaleFigureBridge.spawnPose = () => null; };
    }, [interactive, camera]);

    const handleTransformChange = useCallback(() => {
        if (!selectedObject) return;
        // Figures stand upright on the floor: drop any tilt the free rotation ring adds.
        const yaw = yawOf(selectedObject);
        selectedObject.position.y = 0;
        selectedObject.rotation.set(0, yaw, 0);
    }, [selectedObject]);

    const handleTransformEnd = useCallback(() => {
        setIsTransforming(false);
        const id = useEditorStore.getState().selectedFigureId;
        if (id === null || !selectedObject) return;
        updateScaleFigure(id, {
            position_x: selectedObject.position.x,
            position_z: selectedObject.position.z,
            rotation_y: yawOf(selectedObject),
        });
    }, [selectedObject, setIsTransforming, updateScaleFigure]);

    const figures = viewerFigures ?? localFigures;
    const rotating = transformMode === 'rotate';

    return (
        <group visible={!wallEditorOpen}>
            {figures.map((figure) => (
                <Figure
                    key={figure.id}
                    figure={figure}
                    geometry={geometry}
                    selected={figure.id === selectedFigureId}
                    onSelect={interactive ? selectFigure : undefined}
                    groupRef={figure.id === selectedFigureId ? setSelectedObject : undefined}
                />
            ))}
            {interactive && !wallEditorOpen && selectedObject && (
                <TransformControls
                    object={selectedObject}
                    mode={rotating ? 'rotate' : 'translate'}
                    showX={!rotating}
                    showY={rotating}
                    showZ={!rotating}
                    onMouseDown={() => setIsTransforming(true)}
                    onMouseUp={handleTransformEnd}
                    onChange={handleTransformChange}
                />
            )}
        </group>
    );
};
