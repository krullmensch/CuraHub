import type { RoomFace } from '@/lib/wallEditor/roomFaces';

type Vec3 = [number, number, number];

/**
 * Whether a point (someone's camera) is inside the room model: in front of every room wall face
 * (they face into the room; the room is convex) and between the floor and the top of the walls.
 * Without detected faces nobody counts as inside. Decides blob (inside) vs. camera marker
 * (looking at the room from outside) for orbit-view avatars.
 */
export function insideRoom(p: Vec3, faces: readonly RoomFace[]): boolean {
    if (faces.length === 0) return false;
    let top = 0;
    for (const face of faces) {
        const d = (p[0] - face.origin[0]) * face.normal[0] + (p[2] - face.origin[1]) * face.normal[1];
        if (d <= 0) return false;
        top = Math.max(top, face.height);
    }
    return p[1] > 0 && p[1] < top;
}
