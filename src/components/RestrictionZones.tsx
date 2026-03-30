import { useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { TransformControls, Html, Edges } from '@react-three/drei';
import { useEditorStore, type RestrictionZoneData } from '@/store/editorStore';
import { useAuthStore } from '@/store/authStore';

// Single restriction zone box
const RestrictionZone3D = ({
    zone,
    selected,
    isAdmin,
    innerRef
}: {
    zone: RestrictionZoneData;
    selected: boolean;
    isAdmin: boolean;
    innerRef: React.Ref<THREE.Group>;
}) => {
    const selectZone = useEditorStore((state) => state.selectZone);
    const setActiveObjectRef = useEditorStore((state) => state.setActiveObjectRef);

    // Compute center and size from unrotated AABB bounds
    const center = new THREE.Vector3(
        (zone.min_x + zone.max_x) / 2,
        (zone.min_y + zone.max_y) / 2,
        (zone.min_z + zone.max_z) / 2,
    );
    const size = new THREE.Vector3(
        zone.max_x - zone.min_x,
        zone.max_y - zone.min_y,
        zone.max_z - zone.min_z,
    );

    const handleClick = (e: any) => {
        if (!isAdmin) return;
        e.stopPropagation();
        selectZone(zone.id);
    };

    // Register active object ref for modal transforms
    const localRef = useRef<THREE.Group>(null);
    useEffect(() => {
        if (selected && localRef.current) {
            setActiveObjectRef(localRef.current);
        } else {
            // Unset if we are deselecting and we were the active one
            if (useEditorStore.getState().activeObjectRef === localRef.current) {
                setActiveObjectRef(null);
            }
        }
    }, [selected, setActiveObjectRef]);

    return (
        <group 
            ref={(node) => {
                // Attach to multiple refs safely
                localRef.current = node as THREE.Group;
                if (typeof innerRef === 'function') innerRef(node);
                else if (innerRef) (innerRef as any).current = node;
            }} 
            position={center} 
            rotation={[0, zone.rotation_y || 0, 0]}
        >
            <mesh onClick={handleClick}>
                <boxGeometry args={[size.x, size.y, size.z]} />
                <meshStandardMaterial
                    color={selected ? '#ff4444' : '#ff6b35'}
                    transparent
                    opacity={selected ? 0.3 : 0.15}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                />
                <Edges
                    threshold={15}
                    color={selected ? '#ff2222' : '#ff6b35'}
                    linewidth={selected ? 2 : 1}
                />
            </mesh>

            {/* Zone label */}
            <Html
                position={[0, size.y / 2 + 0.15, 0]}
                center
                style={{ pointerEvents: 'none' }}
            >
                <div style={{
                    background: 'rgba(255, 50, 50, 0.8)',
                    color: 'white',
                    fontSize: '9px',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    whiteSpace: 'nowrap',
                    fontFamily: '"Albert Sans", sans-serif',
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                }}>
                    ⛔ {zone.label || 'Restricted'}
                </div>
            </Html>
        </group>
    );
};

// Container: fetches zones, renders them, and provides TransformControls for admins
export const RestrictionZones = () => {
    const zones = useEditorStore((state) => state.restrictionZones);
    const setRestrictionZones = useEditorStore((state) => state.setRestrictionZones);
    const selectedZoneId = useEditorStore((state) => state.selectedZoneId);
    const updateRestrictionZone = useEditorStore((state) => state.updateRestrictionZone);
    const token = useAuthStore((state) => state.token);
    const isAdmin = useAuthStore((state) => state.isAdmin);
    const transformMode = useEditorStore((state) => state.transformMode);

    // Refs for zone groups — needed for TransformControls
    const zoneRefs = useRef<Map<number, THREE.Group>>(new Map());
    const transformRef = useRef<any>(null);
    const setIsTransforming = useEditorStore((state) => state.setIsTransforming);

    const setZoneRef = useCallback((id: number) => (el: THREE.Group | null) => {
        if (el) zoneRefs.current.set(id, el);
        else zoneRefs.current.delete(id);
    }, []);

    // Fetch all zones on mount (global, not version-dependent)
    useEffect(() => {
        if (!token) return;

        const fetchZones = async () => {
            try {
                const res = await fetch('/api/restrictions', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.status === 401) {
                    useAuthStore.getState().logout();
                    return;
                }
                if (!res.ok) throw new Error('Failed to fetch zones');
                const data: RestrictionZoneData[] = await res.json();
                setRestrictionZones(data);
            } catch (err) {
                console.error('Failed to load restriction zones:', err);
            }
        };

        fetchZones();
    }, [token, setRestrictionZones]);

    const selectedZone = zones.find(z => z.id === selectedZoneId);
    const selectedZoneRef = selectedZoneId ? zoneRefs.current.get(selectedZoneId) : null;

    // After admin drag-transforms a zone, convert group position+scale back to bounds and save
    const handleTransformEnd = useCallback(() => {
        if (!selectedZoneId || !selectedZone || !selectedZoneRef) return;

        const pos = selectedZoneRef.position; // New center
        const scl = selectedZoneRef.scale;    // Scale offsets
        const rot = selectedZoneRef.rotation; // New rotation

        // The zone's base dimensions (unscaled)
        const origW = selectedZone.max_x - selectedZone.min_x;
        const origH = selectedZone.max_y - selectedZone.min_y;
        const origD = selectedZone.max_z - selectedZone.min_z;

        const halfW = (origW * scl.x) / 2;
        const halfH = (origH * scl.y) / 2;
        const halfD = (origD * scl.z) / 2;

        const updates = {
            min_x: pos.x - halfW,
            max_x: pos.x + halfW,
            min_y: pos.y - halfH,
            max_y: pos.y + halfH,
            min_z: pos.z - halfD,
            max_z: pos.z + halfD,
            rotation_y: rot.y,
        };

        updateRestrictionZone(selectedZoneId, updates);

        // Reset scale so the re-render uses the native bounds with scale=1
        selectedZoneRef.scale.set(1, 1, 1);

        // Persist to backend
        const tokenStr = useAuthStore.getState().token;
        if (tokenStr) {
            fetch(`/api/restrictions/${selectedZoneId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tokenStr}`,
                },
                body: JSON.stringify(updates),
            }).catch(console.error);
        }
    }, [selectedZoneId, selectedZone, selectedZoneRef, updateRestrictionZone]);

    // Handle updates coming from ModalTransformSystem
    useEffect(() => {
        const unsubscribe = useEditorStore.subscribe((state, prevState) => {
            // If the user committed a transform globally, we check if it's our zone
            if (state.hasUnsavedChanges !== prevState.hasUnsavedChanges && state.selectedZoneId) {
                handleTransformEnd();
            }
        });
        return unsubscribe;
    }, [handleTransformEnd]);

    // Filter transform modes for Zone (only Y rotation makes sense for boxes generally)
    const activeTransformMode = transformMode === 'scale' ? 'scale' : transformMode === 'rotate' ? 'rotate' : 'translate';

    return (
        <group>
            {zones.map((zone) => (
                <RestrictionZone3D
                    key={zone.id}
                    zone={zone}
                    selected={zone.id === selectedZoneId}
                    isAdmin={isAdmin}
                    innerRef={setZoneRef(zone.id)}
                />
            ))}

            {/* TransformControls for admin editing */}
            {isAdmin && selectedZone && selectedZoneRef && (
                <TransformControls
                    ref={transformRef}
                    object={selectedZoneRef}
                    mode={activeTransformMode}
                    showY={activeTransformMode === 'rotate' ? false : true} // For box rotate, only show Y circle
                    showX={activeTransformMode === 'rotate' ? false : true}
                    showZ={activeTransformMode === 'rotate' ? false : true}
                    onMouseDown={() => setIsTransforming(true)}
                    onMouseUp={() => {
                        setIsTransforming(false);
                        handleTransformEnd();
                    }}
                />
            )}
        </group>
    );
};
