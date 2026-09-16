import { useEditorStore } from '../store/editorStore';
import { getDetectedRenderQuality, isRenderQualitySetting, RENDER_QUALITY_LABELS } from '../lib/renderQuality';
import {
    getActiveRendererBackend,
    isRendererBackendSetting,
    readRendererBackendSetting,
    storeRendererBackendSetting,
    type RendererBackend,
} from '../lib/rendererBackend';
import { cn } from '@/lib/utils';

const RENDERER_LABELS: Record<RendererBackend, string> = {
    webgpu: 'WebGPU',
    webgl: 'WebGL',
};

const labelClass = 'flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.15em] text-white/60';
const selectClass = 'cursor-pointer rounded-md border border-white/10 bg-black/60 px-2 py-1 text-xs normal-case tracking-normal text-white outline-none focus:border-white/30';

/** RND-11: manual override for the render preset and the renderer (both remembered per browser). */
export const RenderQualityControl = ({ className }: { className?: string }) => {
    const setting = useEditorStore((state) => state.renderQualitySetting);
    const setSetting = useEditorStore((state) => state.setRenderQualitySetting);
    const detected = getDetectedRenderQuality();
    const rendererSetting = readRendererBackendSetting();
    const activeRenderer = getActiveRendererBackend();

    return (
        <div className={cn('flex items-center gap-4', className)}>
            <label className={labelClass} title="Grafikqualität. Kantenglättung ändert sich erst nach dem Neuladen.">
                Qualität
                <select
                    value={setting}
                    onChange={(e) => {
                        if (isRenderQualitySetting(e.target.value)) setSetting(e.target.value);
                    }}
                    className={selectClass}
                >
                    <option value="auto">Automatisch ({RENDER_QUALITY_LABELS[detected]})</option>
                    <option value="low">{RENDER_QUALITY_LABELS.low}</option>
                    <option value="medium">{RENDER_QUALITY_LABELS.medium}</option>
                    <option value="high">{RENDER_QUALITY_LABELS.high}</option>
                </select>
            </label>
            <label className={labelClass} title="Grafikschnittstelle. WebGPU, wenn der Browser es kann, sonst WebGL. Die Seite lädt beim Wechsel neu.">
                Renderer
                <select
                    value={rendererSetting}
                    onChange={(e) => {
                        if (!isRendererBackendSetting(e.target.value)) return;
                        storeRendererBackendSetting(e.target.value);
                        // A URL override (?renderer=) would win over the stored choice after reloading.
                        const url = new URL(window.location.href);
                        url.searchParams.delete('renderer');
                        window.location.replace(url);
                    }}
                    className={selectClass}
                >
                    <option value="auto">Automatisch{activeRenderer ? ` (${RENDERER_LABELS[activeRenderer]})` : ''}</option>
                    <option value="webgpu">{RENDERER_LABELS.webgpu}</option>
                    <option value="webgl">{RENDERER_LABELS.webgl}</option>
                </select>
            </label>
        </div>
    );
};
