import { useEditorStore } from '../store/editorStore';
import { getDetectedRenderQuality, isRenderQualitySetting, RENDER_QUALITY_LABELS } from '../lib/renderQuality';
import { cn } from '@/lib/utils';

/** RND-11: manual override for the render preset (remembered per browser). */
export const RenderQualityControl = ({ className }: { className?: string }) => {
    const setting = useEditorStore((state) => state.renderQualitySetting);
    const setSetting = useEditorStore((state) => state.setRenderQualitySetting);
    const detected = getDetectedRenderQuality();

    return (
        <label
            className={cn('flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.15em] text-white/60', className)}
            title="Grafikqualität. Kantenglättung ändert sich erst nach dem Neuladen."
        >
            Qualität
            <select
                value={setting}
                onChange={(e) => {
                    if (isRenderQualitySetting(e.target.value)) setSetting(e.target.value);
                }}
                className="cursor-pointer rounded-md border border-white/10 bg-black/60 px-2 py-1 text-xs normal-case tracking-normal text-white outline-none focus:border-white/30"
            >
                <option value="auto">Automatisch ({RENDER_QUALITY_LABELS[detected]})</option>
                <option value="low">{RENDER_QUALITY_LABELS.low}</option>
                <option value="medium">{RENDER_QUALITY_LABELS.medium}</option>
                <option value="high">{RENDER_QUALITY_LABELS.high}</option>
            </select>
        </label>
    );
};
