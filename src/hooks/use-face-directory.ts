import { useMemo } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import { targetForInstance, targetKey, type WallEditorTarget } from '@/lib/wallEditor/faces';
import { sideOfInstance, WALL_SIDES, type WallSide } from '@/lib/wallEditor/geometry';
import { formatCm } from '@/lib/wallEditor/format';

export interface FaceEntry {
    key: string;
    group: 'room' | 'wall';
    /** Face to open (for modular walls: the face with the most artworks). */
    target: WallEditorTarget;
    label: string;
    detail: string;
    /** Artworks on this room wall / on all faces of this modular wall. */
    count: number;
}

/** Every wall the 2D editor can open: the room's walls and the modular walls. */
export function useFaceDirectory(): FaceEntry[] {
    const walls = useEditorStore((s) => s.localWalls);
    const instances = useEditorStore((s) => s.localInstances);
    const rooms = useWallEditorView((s) => s.roomFaces);

    return useMemo(() => {
        const roomCounts = new Map<string, number>();
        const wallCounts = new Map<number, Record<WallSide, number>>();
        for (const wall of walls) wallCounts.set(wall.id, Object.fromEntries(WALL_SIDES.map((s) => [s, 0])) as Record<WallSide, number>);
        for (const inst of instances) {
            if (inst.wallId != null) {
                const wall = walls.find((w) => w.id === inst.wallId);
                const counts = wall ? wallCounts.get(wall.id) : undefined;
                if (wall && counts) counts[sideOfInstance(wall, inst)]++;
                continue;
            }
            const target = targetForInstance(inst, walls, rooms);
            if (target) roomCounts.set(targetKey(target), (roomCounts.get(targetKey(target)) ?? 0) + 1);
        }

        const entries: FaceEntry[] = rooms.map((room) => ({
            key: room.id,
            group: 'room',
            target: { kind: 'room', faceId: room.id },
            label: room.label,
            detail: `${formatCm(room.width, false)} × ${formatCm(room.height)}`,
            count: roomCounts.get(room.id) ?? 0,
        }));
        for (const wall of walls) {
            const counts = wallCounts.get(wall.id)!;
            const best = WALL_SIDES.reduce((a, b) => (counts[b] > counts[a] ? b : a), 'front' as WallSide);
            entries.push({
                key: `wall:${wall.id}`,
                group: 'wall',
                target: { kind: 'wall', wallId: wall.id, side: best },
                label: wall.label || 'Stellwand',
                detail: `${formatCm(wall.width, false)} × ${formatCm(wall.height)}`,
                count: WALL_SIDES.reduce((sum, s) => sum + counts[s], 0),
            });
        }
        return entries;
    }, [walls, instances, rooms]);
}
