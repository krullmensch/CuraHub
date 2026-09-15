import { useEditorStore } from '../store/editorStore';
import { RENDER_QUALITY_SETTINGS, resolveRenderQuality, type RenderQuality, type RenderQualitySettings } from '../lib/renderQuality';

/** Effective render preset (manual choice or detected hardware class). RND-11 */
export function useRenderQuality(): RenderQuality {
    const setting = useEditorStore((state) => state.renderQualitySetting);
    return resolveRenderQuality(setting);
}

export function useRenderQualitySettings(): RenderQualitySettings {
    return RENDER_QUALITY_SETTINGS[useRenderQuality()];
}
