/**
 * Wall lifecycle events for code outside editorStore that keys data by wall id (ruler guides,
 * see lib/wallEditor/layoutSync.ts). No imports, so editorStore can use it without a cycle.
 */
export type WallEvent =
    | { type: 'replaced'; from: number; to: number }
    | { type: 'deleted'; id: number };

type Listener = (event: WallEvent) => void;

const listeners = new Set<Listener>();

export function onWallEvent(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function emitWallEvent(event: WallEvent): void {
    listeners.forEach((listener) => listener(event));
}
