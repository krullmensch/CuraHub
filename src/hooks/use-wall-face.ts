import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import { openFaceOf } from '@/lib/wallEditor/faces';
import { collectWallFace, type WallFace } from '@/lib/wallEditor/wallArtworks';

/** Re-measures footprints this often while some are still estimates (models loading). */
const REMEASURE_MS = 400;
const MAX_REMEASURES = 40;

/** The wall face open in the 2D wall editor, with its artworks in wall coordinates. */
export function useWallFace(): WallFace | null {
    useWallEditorView((s) => s.roomFaces); // re-resolve once the room faces are known
    const resolved = useEditorStore(openFaceOf);
    const instances = useEditorStore((s) => s.localInstances);
    const [measureRound, setMeasureRound] = useState(0);

    const face = useMemo(
        () => (resolved ? collectWallFace(resolved, instances) : null),
        // measureRound: re-run to pick up models that finished loading
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [resolved, instances, measureRound],
    );

    const pending = !!face && face.items.some((item) => !item.footprint.exact);
    useEffect(() => {
        if (!pending || measureRound >= MAX_REMEASURES) return;
        const timer = setTimeout(() => setMeasureRound((n) => n + 1), REMEASURE_MS);
        return () => clearTimeout(timer);
    }, [pending, measureRound]);

    return face;
}
