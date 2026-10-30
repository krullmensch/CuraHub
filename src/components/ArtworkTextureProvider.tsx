import { useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ArtworkTextureManager } from '../lib/artworkTextureManager';
import { ArtworkTextureContext } from '../lib/artworkTextureContext';
import { useRenderQualitySettings } from '../hooks/use-render-quality';
import { getMaxTextureSize, onRendererContextRestored } from '../lib/rendererBackend';
import { resetArtworkLoadProgress, setArtworkLoadProgress } from '../lib/artworkLoadProgress';
import { useExportMode } from '../lib/arExport/exportMode';

/**
 * LOAD-05 / LOAD-07: owns the artwork texture LOD manager for this Canvas and drives it
 * once per rendered frame. Artworks never suspend on their images any more — the room and
 * frames show immediately and pictures sharpen progressively.
 */
export const ArtworkTextureProvider = ({ children }: { children: ReactNode }) => {
    const { active: exportMode, maxTexture, session } = useExportMode();
    const manager = useMemo(() => new ArtworkTextureManager({ topTierOnly: exportMode }), [exportMode]);
    const presetSettings = useRenderQualitySettings();
    // AR export: the export's texture cap instead of the preset's, and no memory budget (that
    // would step works down below their top tier).
    const settings = useMemo(
        () => (exportMode
            ? { ...presetSettings, maxTextureDim: maxTexture, textureBudgetBytes: Infinity, maxConcurrentLoads: 4 }
            : presetSettings),
        [exportMode, presetSettings, maxTexture],
    );
    const gl = useThree((state) => state.gl);
    const invalidate = useThree((state) => state.invalidate);

    useLayoutEffect(() => {
        manager.configure(settings, getMaxTextureSize(gl), invalidate);
    }, [manager, settings, gl, invalidate]);

    useEffect(() => {
        return onRendererContextRestored(gl, () => {
            manager.handleContextRestored();
            invalidate();
        });
    }, [manager, gl, invalidate]);

    useEffect(() => {
        if (!session) return;
        session.setTextureStatus({
            failed: () => manager.exportFailedIds,
            pending: () => manager.exportPendingIds,
            progress: () => manager.exportProgress,
        });
    }, [session, manager]);

    // Export canvases report through their session; the global progress belongs to the visible canvas
    // (the mobile planner's AR builder runs next to the editor's).
    useEffect(() => () => {
        manager.dispose();
        if (!exportMode) resetArtworkLoadProgress();
    }, [manager, exportMode]);

    useFrame((state) => {
        manager.tick(state.camera, gl, performance.now());
        if (!exportMode) setArtworkLoadProgress(manager.baseProgress);
    });

    return <ArtworkTextureContext.Provider value={manager}>{children}</ArtworkTextureContext.Provider>;
};
