import { useMemo, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { gooeyToast } from 'goey-toast';
import {
    AlignCenterVertical,
    AlignEndVertical,
    AlignHorizontalDistributeCenter,
    AlignStartVertical,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
    AlignVerticalJustifyStart,
    Copy,
    PanelsTopLeft,
    Trash2,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { useWallEditorView } from '../store/wallEditorViewStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { displayArtworkTitle } from '@/lib/artworkTitle';
import { DEFAULT_FRAME_STYLE, DEFAULT_PASSEPARTOUT_WIDTH_CM, MAX_PASSEPARTOUT_WIDTH_CM, frameStyleOf, type FrameStyleId } from '@/lib/frameStyles';
import { passepartoutOf, type PassepartoutValue } from '@/lib/passepartout';
import { commonFaceTarget } from '@/lib/selectionFaces';
import { commitSelectionOperation, duplicateCurrentSelection } from '@/lib/selectionActions';
import {
    alignAxis,
    alignHeight,
    distributeAxis,
    isFramable,
    scaleSelection,
    setSelectionFrame,
    type AxisEdge,
    type WorldAxis,
} from '@/lib/selectionOperations';
import { FrameControls } from './FrameControls';
import { NumericInput } from './NumericInput';

const SCALE_STEP = 0.1;

const IconButton = ({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) => (
    <Button
        variant="secondary"
        size="icon"
        title={title}
        aria-label={title}
        onClick={onClick}
        disabled={disabled}
        className="h-8 w-8 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
    >
        {children}
    </Button>
);

const AXIS_EDGES: { edge: AxisEdge; icon: typeof AlignStartVertical; label: string }[] = [
    { edge: 'min', icon: AlignStartVertical, label: 'Anfang' },
    { edge: 'center', icon: AlignCenterVertical, label: 'Mitte' },
    { edge: 'max', icon: AlignEndVertical, label: 'Ende' },
];

/** Properties panel for more than one selected artwork (the 3D editor's multi-selection). */
export const MultiSelectionPanel = () => {
    const ids = useEditorStore(useShallow((state) => state.selectedInstanceIds));
    const primaryId = useEditorStore((state) => state.selectedInstanceId);
    const localInstances = useEditorStore((state) => state.localInstances);
    const localWalls = useEditorStore((state) => state.localWalls);
    const roomFaces = useWallEditorView((state) => state.roomFaces);
    const setInstanceSelection = useEditorStore((state) => state.setInstanceSelection);
    const toggleInstanceInSelection = useEditorStore((state) => state.toggleInstanceInSelection);
    const openWallEditor = useEditorStore((state) => state.openWallEditor);
    const setDefaultFrameStyle = useEditorStore((state) => state.setDefaultFrameStyle);
    const setDefaultPassepartout = useEditorStore((state) => state.setDefaultPassepartout);
    const [centreHeightCm, setCentreHeightCm] = useState(150);
    // Remounts the factor input after it was applied, so it shows 100 % again.
    const [scaleInputKey, setScaleInputKey] = useState(0);

    const selected = useMemo(() => localInstances.filter((i) => ids.includes(i.id)), [localInstances, ids]);
    const framable = useMemo(() => selected.filter(isFramable), [selected]);
    const face = useMemo(() => commonFaceTarget(selected, localWalls, roomFaces), [selected, localWalls, roomFaces]);
    const hasMonitor = selected.some((i) => i.medium === 'monitor');

    // Frame controls show the primary picture (or the first one) and flag differing pictures.
    const framePrimary = framable.find((i) => i.id === primaryId) ?? framable[0];
    const frameStyle = framePrimary ? frameStyleOf(framePrimary.frameStyle) : DEFAULT_FRAME_STYLE;
    const passepartout = framePrimary ? passepartoutOf(framePrimary) : { width: 0, placement: 'center' as const };
    const frameMixed = framable.some((i) => {
        const p = passepartoutOf(i);
        return frameStyleOf(i.frameStyle) !== frameStyle || p.width !== passepartout.width || p.placement !== passepartout.placement;
    });

    const run = (op: (instances: typeof localInstances) => typeof localInstances | null) => {
        const store = useEditorStore.getState();
        commitSelectionOperation(op(store.localInstances));
    };

    const onFrameStyleChange = (style: FrameStyleId) => {
        if (style !== 'none') setDefaultFrameStyle(style);
        run((instances) => setSelectionFrame(instances, ids, { frameStyle: style }));
    };
    const onPassepartoutChange = (next: PassepartoutValue) => {
        const width = Math.min(Math.max(next.width, 0), MAX_PASSEPARTOUT_WIDTH_CM);
        setDefaultPassepartout({ width, placement: next.placement });
        run((instances) => setSelectionFrame(instances, ids, { passepartoutWidth: width, passepartoutPlacement: next.placement }));
    };

    const applyScale = (factor: number) => run((instances) => scaleSelection(instances, ids, factor));

    const handleDelete = () => {
        const count = ids.length;
        useEditorStore.getState().deleteSelectedInstance();
        gooeyToast.success('Gelöscht', { description: `${count} Werke entfernt.` });
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
            <div className="space-y-2">
                <p className="text-sm font-medium text-zinc-100">{ids.length} Werke ausgewählt</p>
                <ul className="max-h-40 overflow-y-auto space-y-0.5 custom-scrollbar">
                    {selected.map((inst) => (
                        <li key={inst.id}>
                            <button
                                type="button"
                                onClick={(e) => {
                                    if (e.shiftKey || e.metaKey || e.ctrlKey) toggleInstanceInSelection(inst.id);
                                    else setInstanceSelection([inst.id]);
                                }}
                                className={cn(
                                    'w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-zinc-800',
                                    inst.id === primaryId ? 'font-semibold text-white' : 'text-zinc-300',
                                )}
                                title="Klick: nur dieses Werk · ⇧/⌘-Klick: aus der Auswahl entfernen"
                            >
                                {displayArtworkTitle(inst.artwork?.title || '') || 'Ohne Titel'}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            <Separator className="bg-zinc-800" />

            <div className="space-y-3">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Ausrichten</Label>
                <div className="flex items-center gap-2">
                    <span className="w-12 text-[11px] text-zinc-400">Höhe</span>
                    <IconButton title="Unterkanten angleichen" onClick={() => run((i) => alignHeight(i, ids, localWalls, 'bottom'))}>
                        <AlignVerticalJustifyEnd className="h-4 w-4" />
                    </IconButton>
                    <IconButton title="Mitten angleichen" onClick={() => run((i) => alignHeight(i, ids, localWalls, 'center'))}>
                        <AlignVerticalJustifyCenter className="h-4 w-4" />
                    </IconButton>
                    <IconButton title="Oberkanten angleichen" onClick={() => run((i) => alignHeight(i, ids, localWalls, 'top'))}>
                        <AlignVerticalJustifyStart className="h-4 w-4" />
                    </IconButton>
                </div>
                <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                        <Label className="text-[10px] text-zinc-500 uppercase">Mittelhöhe (cm)</Label>
                        <NumericInput
                            step="1"
                            min="0"
                            value={centreHeightCm}
                            onChange={(raw) => {
                                const cm = parseFloat(raw.replace(',', '.'));
                                if (!isNaN(cm) && cm > 0) setCentreHeightCm(cm);
                            }}
                            className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                        />
                    </div>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => run((i) => alignHeight(i, ids, localWalls, 'center', centreHeightCm / 100))}
                        className="h-8 text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                    >
                        Setzen
                    </Button>
                </div>
                {(['x', 'z'] as WorldAxis[]).map((axis) => (
                    <div key={axis} className="flex items-center gap-2">
                        <span className="w-12 text-[11px] text-zinc-400">Achse {axis.toUpperCase()}</span>
                        {AXIS_EDGES.map(({ edge, icon: Icon, label }) => (
                            <IconButton
                                key={edge}
                                title={`${label} auf ${axis.toUpperCase()} angleichen`}
                                onClick={() => run((i) => alignAxis(i, ids, localWalls, axis, edge))}
                            >
                                <Icon className="h-4 w-4" />
                            </IconButton>
                        ))}
                        <IconButton
                            title={`Entlang ${axis.toUpperCase()} gleichmäßig verteilen`}
                            onClick={() => run((i) => distributeAxis(i, ids, localWalls, axis))}
                            disabled={ids.length < 3}
                        >
                            <AlignHorizontalDistributeCenter className="h-4 w-4" />
                        </IconButton>
                    </div>
                ))}
                <p className="text-[10px] text-zinc-500">Ziel ist das zuletzt gewählte Werk. Werke an einer Wand richtest du im 2D-Editor genauer aus.</p>
            </div>

            {framable.length > 0 && (
                <>
                    <Separator className="bg-zinc-800" />
                    <FrameControls
                        frameStyle={frameStyle}
                        onFrameToggle={(framed) => onFrameStyleChange(framed ? (frameStyle === 'none' ? DEFAULT_FRAME_STYLE : frameStyle) : 'none')}
                        onFrameStyleChange={onFrameStyleChange}
                        passepartout={passepartout}
                        onPassepartoutToggle={(on) => onPassepartoutChange({
                            width: on ? (passepartout.width > 0 ? passepartout.width : DEFAULT_PASSEPARTOUT_WIDTH_CM) : 0,
                            placement: passepartout.placement,
                        })}
                        onPassepartoutChange={onPassepartoutChange}
                        mixed={frameMixed}
                    />
                    {framable.length < selected.length && (
                        <p className="text-[10px] text-zinc-500">Gilt für die {framable.length} Bilder der Auswahl.</p>
                    )}
                </>
            )}

            <Separator className="bg-zinc-800" />

            <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Größe</Label>
                <div className="flex items-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => applyScale(1 - SCALE_STEP)} className="h-8 text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700">−10 %</Button>
                    <Button size="sm" variant="secondary" onClick={() => applyScale(1 + SCALE_STEP)} className="h-8 text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700">+10 %</Button>
                    <div className="flex-1 space-y-1">
                        <Label className="text-[10px] text-zinc-500 uppercase">Faktor (%)</Label>
                        <NumericInput
                            key={scaleInputKey}
                            step="1"
                            min="1"
                            value={100}
                            onChange={(raw) => {
                                const pct = parseFloat(raw.replace(',', '.'));
                                if (isNaN(pct) || pct <= 0 || pct === 100) return;
                                setScaleInputKey((k) => k + 1);
                                applyScale(pct / 100);
                            }}
                            className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                        />
                    </div>
                </div>
                {hasMonitor && <p className="text-[10px] text-zinc-500 italic">Monitore behalten ihre Größe.</p>}
            </div>

            <Separator className="bg-zinc-800" />

            <div className="space-y-2">
                {face && (
                    <Button
                        size="sm"
                        onClick={() => openWallEditor(face, ids)}
                        className="w-full h-9 text-xs gap-1.5 bg-blue-600 hover:bg-blue-500 text-white"
                        title="Die gemeinsame Wand frontal bearbeiten (E)"
                    >
                        <PanelsTopLeft className="h-3.5 w-3.5" />
                        Im 2D-Editor öffnen
                    </Button>
                )}
                <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={duplicateCurrentSelection} className="flex-1 bg-zinc-800 text-zinc-100 hover:bg-zinc-700" title="Duplizieren (⌘D)">
                        <Copy className="h-4 w-4 mr-2" />
                        Duplizieren
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete} className="flex-1">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Löschen
                    </Button>
                </div>
            </div>
        </div>
    );
};
