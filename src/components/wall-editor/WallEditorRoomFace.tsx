import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useEditorStore } from '@/store/editorStore';
import { openFaceOf } from '@/lib/wallEditor/faces';
import { wallToWorld } from '@/lib/wallEditor/geometry';

/** Plain wall colour of the flat 2D view (matches ModularWallMesh `flat`). */
const FLAT_WALL_COLOR = new THREE.Color('#ffffff').multiplyScalar(0.93);

/**
 * While a room wall is open in the 2D wall editor the room model is hidden (its other walls would
 * block the orthographic camera), so the open wall is drawn here from its extracted triangles.
 * Windows and doors stay open. Named "Wall" so drag & drop placement (ArtworkPlacement) hits it.
 */
export const WallEditorRoomFace = () => {
    const face = useEditorStore(openFaceOf);
    const room = face?.room ?? null;
    const frame = face?.frame ?? null;

    const geometry = useMemo(() => {
        if (!room || !frame) return null;
        const positions = new Float32Array((room.triangles.length / 2) * 3);
        const p = new THREE.Vector3();
        for (let i = 0, j = 0; i < room.triangles.length; i += 2, j += 3) {
            wallToWorld(frame, room.triangles[i], room.triangles[i + 1], 0, p);
            positions[j] = p.x;
            positions[j + 1] = p.y;
            positions[j + 2] = p.z;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const normals = new Float32Array(positions.length);
        for (let j = 0; j < normals.length; j += 3) {
            normals[j] = frame.normal.x;
            normals[j + 2] = frame.normal.z;
        }
        g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        // Front faces towards the viewer: fix the winding per triangle.
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
        for (let j = 0; j < positions.length; j += 9) {
            a.fromArray(positions, j);
            b.fromArray(positions, j + 3);
            c.fromArray(positions, j + 6);
            n.subVectors(b, a).cross(c.sub(a));
            if (n.dot(frame.normal) < 0) {
                for (let k = 0; k < 3; k++) {
                    const tmp = positions[j + 3 + k];
                    positions[j + 3 + k] = positions[j + 6 + k];
                    positions[j + 6 + k] = tmp;
                }
            }
        }
        g.computeBoundingBox();
        g.computeBoundingSphere();
        return g;
    }, [room, frame]);

    useEffect(() => () => geometry?.dispose(), [geometry]);

    if (!geometry) return null;
    return (
        <mesh name="Wall" geometry={geometry} userData={{ wallEditorRoomFace: true }}>
            <meshBasicMaterial color={FLAT_WALL_COLOR} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
    );
};
