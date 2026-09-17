import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { collectWallFace, type WallFace } from '@/lib/wallEditor/wallArtworks';

/** Re-measures footprints this often while some are still estimates (models loading). */
const REMEASURE_MS = 400;
const MAX_REMEASURES = 40;

/** The wall face open in the 2D wall editor, with its artworks in wall coordinates. */
export function useWallFace(): WallFace | null {
    const wallEditor = useEditorStore((s) => s.wallEditor);
    const wall = useEditorStore((s) => (s.wallEditor ? s.localWalls.find((w) => w.id === s.wallEditor!.wallId) : undefined));
    const instances = useEditorStore((s) => s.localInstances);
    const [measureRound, setMeasureRound] = useState(0);

    const face = useMemo(
        () => (wall && wallEditor ? collectWallFace(wall, wallEditor.side, instances) : null),
        // measureRound: re-run to pick up models that finished loading
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [wall, wallEditor, instances, measureRound],
    );

    const pending = !!face && face.items.some((item) => !item.footprint.exact);
    useEffect(() => {
        if (!pending || measureRound >= MAX_REMEASURES) return;
        const timer = setTimeout(() => setMeasureRound((n) => n + 1), REMEASURE_MS);
        return () => clearTimeout(timer);
    }, [pending, measureRound]);

    return face;
}
