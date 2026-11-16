import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { getWebGPUSupport, isWebGPURenderer } from '../lib/rendererBackend';
import { readAmbientOcclusionOverride, shouldRunAmbientOcclusion } from '../lib/ambientOcclusion';
import { useRenderQualitySettings } from '../hooks/use-render-quality';
import { useEditorStore } from '../store/editorStore';
import { useExportMode } from '../lib/arExport/exportMode';

/**
 * Soft corner darkening of the room (GTAO, WebGPU only, preset "Hoch"). While it is on,
 * it renders the frame itself (useFrame priority 1 stops R3F's own render call); otherwise R3F
 * renders as before. Spec: docs/superpowers/specs/2026-11-16-raum-ao-design.md
 */
export function RoomAmbientOcclusion() {
    const gl = useThree((state) => state.gl);
    const scene = useThree((state) => state.scene);
    const camera = useThree((state) => state.camera);
    const { ambientOcclusion } = useRenderQualitySettings();
    const wallEditorOpen = useEditorStore((state) => !!state.wallEditor);
    const mobilePlanner = useEditorStore((state) => state.mobilePlanner);
    const exportMode = useExportMode().active;
    const override = useMemo(() => readAmbientOcclusionOverride(window.location.search), []);

    const enabled = shouldRunAmbientOcclusion({
        qualityEnabled: ambientOcclusion,
        webgpu: isWebGPURenderer(gl),
        override: override.enabled,
        wallEditorOpen,
        exportMode,
        mobilePlanner,
    });

    const pipeline = useMemo(
        () => (enabled ? getWebGPUSupport(gl).createAmbientOcclusionPipeline(gl, scene, camera, override.options) : null),
        [enabled, gl, scene, camera, override],
    );
    useEffect(() => () => pipeline?.dispose(), [pipeline]);

    useFrame(() => {
        pipeline?.render();
    }, pipeline ? 1 : 0);

    return null;
}
