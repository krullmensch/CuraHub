import type { ReactNode } from 'react';
import { ArrowDownToLine, BetweenHorizontalStart, Ruler, SeparatorHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import type { MeasureToggleKey } from '@/lib/wallEditor/measureToggles';
import { CmInput } from './wall-editor/PanelPrimitives';
import { ToolbarPopoverButton } from './ToolbarPopoverButton';

const ENTRIES: { key: MeasureToggleKey; label: string; icon: ReactNode }[] = [
    { key: 'showHangingLine', label: 'Hängehöhe anzeigen', icon: <SeparatorHorizontal className="h-4 w-4" /> },
    { key: 'showFloorDistances', label: 'Höhen über Boden anzeigen', icon: <ArrowDownToLine className="h-4 w-4" /> },
    { key: 'showGaps', label: 'Abstände zwischen Werken anzeigen', icon: <BetweenHorizontalStart className="h-4 w-4" /> },
];

/** Tool bar popover: the wall measures of the 2D wall editor, shown on the walls in 3D. */
export const MeasurementsControl = () => {
    const showHangingLine = useWallEditorView((s) => s.showHangingLine);
    const showFloorDistances = useWallEditorView((s) => s.showFloorDistances);
    const showGaps = useWallEditorView((s) => s.showGaps);
    const hangingHeight = useWallEditorView((s) => s.hangingHeight);
    const toggle = useWallEditorView((s) => s.toggle);
    const setHangingHeight = useWallEditorView((s) => s.setHangingHeight);
    const perspective = useEditorStore((s) => s.plannerViewMode === 'perspective');

    const values: Record<MeasureToggleKey, boolean> = { showHangingLine, showFloorDistances, showGaps };

    return (
        <ToolbarPopoverButton icon={<Ruler size={16} />} tooltip="Maße" active={showHangingLine || showFloorDistances || showGaps}>
            <div className="flex w-64 flex-col gap-1 text-white">
                <span className="mb-1 text-xs font-semibold text-zinc-300">Maße an den Wänden</span>
                {ENTRIES.map((entry) => (
                    <button
                        key={entry.key}
                        type="button"
                        aria-pressed={values[entry.key]}
                        onClick={() => toggle(entry.key)}
                        className={cn(
                            'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                            values[entry.key] ? 'bg-blue-500/70 text-white' : 'text-zinc-300 hover:bg-white/10',
                        )}
                    >
                        {entry.icon}
                        <span>{entry.label}</span>
                    </button>
                ))}
                <div className="mt-2">
                    <CmInput label="Hängehöhe (Bildmitte über Boden)" value={hangingHeight} onCommit={setHangingHeight} />
                </div>
                {!perspective && <p className="mt-2 text-[11px] text-zinc-400">Nur in der 3D-Ansicht sichtbar.</p>}
            </div>
        </ToolbarPopoverButton>
    );
};
