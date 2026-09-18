import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
    AlignCenterHorizontal,
    AlignCenterVertical,
    AlignEndHorizontal,
    AlignEndVertical,
    AlignHorizontalDistributeCenter,
    AlignStartHorizontal,
    AlignStartVertical,
    AlignVerticalDistributeCenter,
    ChevronRight,
    MoveHorizontal,
    MoveVertical,
    Trash2,
} from 'lucide-react';
import { gooeyToast } from 'goey-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useEditorStore } from '@/store/editorStore';
import { useWallEditorView } from '@/store/wallEditorViewStore';
import { useWallFace } from '@/hooks/use-wall-face';
import { cmInputValue, formatCm, parseCm } from '@/lib/wallEditor/format';
import { centerX, centerY, right, top, uniformGap, unionRect, type AlignMode, type Axis } from '@/lib/wallEditor/layout';
import {
    alignSelection,
    centerSelectionOnWall,
    distributeSelection,
    hangSelection,
    selectAllOnFace,
    setSelectionEdge,
    setSelectionGap,
    type AlignTarget,
    type EdgeKey,
} from '@/lib/wallEditor/operations';
import { removeInstances } from '@/lib/wallEditor/wallArtworks';

// ── Small building blocks ────────────────────────────────────────────────

interface CmInputProps {
    label: string;
    value: number | null;
    placeholder?: string;
    onCommit: (metres: number) => void;
    disabled?: boolean;
    title?: string;
}

/** Centimetre input: edits locally, commits on Enter/blur, accepts "152,5". */
const CmInput = ({ label, value, placeholder, onCommit, disabled, title }: CmInputProps) => {
    const [text, setText] = useState(value === null ? '' : cmInputValue(value));
    const focused = useRef(false);
    const external = value === null ? '' : cmInputValue(value);

    useEffect(() => {
        if (!focused.current) setText(external); // eslint-disable-line react-hooks/set-state-in-effect
    }, [external]);

    const commit = () => {
        const parsed = parseCm(text);
        if (parsed === null || external === cmInputValue(parsed)) {
            setText(external);
            return;
        }
        onCommit(parsed);
    };

    return (
        <label className="block space-y-1" title={title}>
            <span className="block text-[10px] text-zinc-500">{label}</span>
            <div className="relative">
                <input
                    inputMode="decimal"
                    value={text}
                    placeholder={placeholder}
                    disabled={disabled}
                    onFocus={(e) => { focused.current = true; e.target.select(); }}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={() => { focused.current = false; commit(); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') { setText(external); (e.target as HTMLInputElement).blur(); }
                    }}
                    className="w-full h-8 rounded-md bg-zinc-900 border border-zinc-700 pl-2 pr-7 text-xs text-zinc-100 tabular-nums outline-none focus:border-blue-500 disabled:opacity-40"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 pointer-events-none">cm</span>
            </div>
        </label>
    );
};

const IconAction = ({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) => (
    <button
        type="button"
        title={label}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="h-8 flex-1 flex items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
    >
        {icon}
    </button>
);

const Section = ({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) => (
    <section className="space-y-2">
        <div className="flex items-center justify-between">
            <h3 className="text-xs text-zinc-400 uppercase tracking-wider">{title}</h3>
            {aside}
        </div>
        {children}
    </section>
);

const ALIGN_ACTIONS: { mode: AlignMode; label: string; icon: ReactNode }[] = [
    { mode: 'left', label: 'Links ausrichten', icon: <AlignStartVertical className="h-4 w-4" /> },
    { mode: 'hcenter', label: 'Horizontal mittig ausrichten', icon: <AlignCenterVertical className="h-4 w-4" /> },
    { mode: 'right', label: 'Rechts ausrichten', icon: <AlignEndVertical className="h-4 w-4" /> },
    { mode: 'top', label: 'Oben ausrichten', icon: <AlignStartHorizontal className="h-4 w-4" /> },
    { mode: 'vcenter', label: 'Vertikal mittig ausrichten', icon: <AlignCenterHorizontal className="h-4 w-4" /> },
    { mode: 'bottom', label: 'Unten ausrichten', icon: <AlignEndHorizontal className="h-4 w-4" /> },
];

const SHORTCUTS: [string, string][] = [
    ['V / H / M', 'Auswahl / Hand / Messen'],
    ['⇧ + Klick', 'Mehrfachauswahl'],
    ['⇧ beim Ziehen', 'Nur waagrecht/senkrecht'],
    ['⌘/Strg beim Ziehen', 'Einrasten umkehren'],
    ['Alt halten', 'Abstände zur Auswahl'],
    ['Pfeiltasten', '1 cm (⇧ 10 cm, Alt 1 mm)'],
    ['Scrollen', 'Ansicht verschieben'],
    ['⌘/Strg + Scrollen', 'Zoomen'],
    ['⇧1 / ⇧2', 'Wand / Auswahl einpassen'],
    ['Lineal ziehen', 'Hilfslinie setzen'],
    ['Esc', 'Abwählen / zurück zu 3D'],
];

// ── Panel ─────────────────────────────────────────────────────────────────

interface WallEditorPanelProps {
    onToggle: () => void;
}

/** Right-hand panel of the 2D wall editor (shown by PropertiesPanel while the editor is open). */
export const WallEditorPanel = ({ onToggle }: WallEditorPanelProps) => {
    const face = useWallFace();
    const selection = useEditorStore((s) => s.wallEditorSelection);
    const hangingHeight = useWallEditorView((s) => s.hangingHeight);
    const setHangingHeight = useWallEditorView((s) => s.setHangingHeight);
    const [alignTarget, setAlignTarget] = useState<AlignTarget>('selection');
    const [showShortcuts, setShowShortcuts] = useState(false);

    if (!face) return null;
    const selected = face.items.filter((i) => selection.includes(i.id));
    const count = selected.length;
    const box = unionRect(selected.map((i) => i.rect));
    const floor = face.wallRect.y;
    const single = count === 1 ? selected[0] : null;

    const gapValue = (axis: Axis) => {
        const g = uniformGap(selected, axis);
        return typeof g === 'number' ? g : null;
    };
    const gapPlaceholder = (axis: Axis) => (uniformGap(selected, axis) === 'mixed' ? 'Gemischt' : '');

    const edgeInput = (edge: EdgeKey, label: string, value: number | null, title?: string) => (
        <CmInput label={label} value={value} disabled={!box} onCommit={(v) => setSelectionEdge(edge, v)} title={title} />
    );

    const remove = () => {
        const ids = selected.map((i) => i.id);
        removeInstances(ids);
        gooeyToast.success(ids.length === 1 ? 'Werk entfernt' : `${ids.length} Werke entfernt`, {
            description: 'Mit ⌘/Strg + Z rückgängig machen.',
        });
    };

    return (
        <>
            <div className="flex items-center border-b border-zinc-800 bg-blue-600">
                <div className="flex-1 py-2.5 px-3 text-xs font-medium text-white">2D-Wandeditor</div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 mr-1" onClick={onToggle}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
                <Section title="Auswahl">
                    {count === 0 && (
                        <div className="space-y-2">
                            <p className="text-xs text-zinc-500 leading-relaxed">
                                Klicke ein Werk an oder ziehe einen Rahmen auf. Mit ⇧ wählst du mehrere aus.
                                {face.items.length === 0 && ' Auf dieser Seite hängt noch nichts – zieh ein Werk aus der Bibliothek auf die Wand.'}
                            </p>
                            <Button variant="secondary" size="sm" className="w-full h-8 text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700" onClick={selectAllOnFace} disabled={face.items.length === 0}>
                                Alle auswählen ({face.items.length})
                            </Button>
                        </div>
                    )}
                    {single && (
                        <div className="rounded-md bg-zinc-900 border border-zinc-800 p-2.5 space-y-0.5">
                            <div className="text-sm text-zinc-100 font-medium truncate" title={single.label}>{single.label}</div>
                            {(single.inst.artwork.artist || single.inst.artwork.year) && (
                                <div className="text-[11px] text-zinc-400 truncate">
                                    {[single.inst.artwork.artist, single.inst.artwork.year].filter(Boolean).join(', ')}
                                </div>
                            )}
                            <div className="text-[11px] text-zinc-500 tabular-nums">
                                {formatCm(single.rect.w, false)} × {formatCm(single.rect.h)}
                                {single.inst.artwork.asset.type === 'image' ? ' mit Rahmen' : ''}
                            </div>
                        </div>
                    )}
                    {count > 1 && box && (
                        <div className="rounded-md bg-zinc-900 border border-zinc-800 p-2.5">
                            <div className="text-sm text-zinc-100 font-medium">{count} Werke</div>
                            <div className="text-[11px] text-zinc-500 tabular-nums">Gruppe {formatCm(box.w, false)} × {formatCm(box.h)}</div>
                        </div>
                    )}
                </Section>

                <Separator className="bg-zinc-800" />

                <Section
                    title="Ausrichten"
                    aside={count > 1 ? (
                        <div className="flex rounded-md bg-zinc-900 border border-zinc-800 p-0.5 text-[10px]">
                            {(['selection', 'wall'] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setAlignTarget(t)}
                                    className={cn('px-1.5 py-0.5 rounded', alignTarget === t ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300')}
                                >
                                    {t === 'selection' ? 'Zueinander' : 'An Wand'}
                                </button>
                            ))}
                        </div>
                    ) : count === 1 ? <span className="text-[10px] text-zinc-500">an der Wand</span> : undefined}
                >
                    <div className="flex gap-0.5 rounded-md bg-zinc-900/60 border border-zinc-800 p-0.5">
                        {ALIGN_ACTIONS.map((a) => (
                            <IconAction key={a.mode} icon={a.icon} label={a.label} disabled={count === 0} onClick={() => alignSelection(a.mode, alignTarget)} />
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" size="sm" disabled={count === 0} onClick={() => centerSelectionOnWall('x')} className="h-8 text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700 gap-1.5">
                            <MoveHorizontal className="h-3.5 w-3.5" /> Auf Wand zentrieren
                        </Button>
                        <Button variant="secondary" size="sm" disabled={count === 0} onClick={() => centerSelectionOnWall('y')} className="h-8 text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700 gap-1.5">
                            <MoveVertical className="h-3.5 w-3.5" /> Vertikal zentrieren
                        </Button>
                    </div>
                </Section>

                <Separator className="bg-zinc-800" />

                <Section title="Abstände">
                    {count < 2 ? (
                        <p className="text-xs text-zinc-500">Wähle mindestens zwei Werke aus, um Abstände festzulegen.</p>
                    ) : (
                        <div className="space-y-2">
                            {(['x', 'y'] as const).map((axis) => (
                                <div key={axis} className="flex items-end gap-2">
                                    <div className="flex-1">
                                        <CmInput
                                            label={axis === 'x' ? 'Horizontaler Abstand' : 'Vertikaler Abstand'}
                                            value={gapValue(axis)}
                                            placeholder={gapPlaceholder(axis)}
                                            onCommit={(v) => setSelectionGap(axis, v)}
                                            title={axis === 'x' ? 'Das linke Werk bleibt stehen' : 'Das obere Werk bleibt stehen'}
                                        />
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        disabled={count < 3}
                                        title={axis === 'x' ? 'Horizontal gleichmäßig verteilen' : 'Vertikal gleichmäßig verteilen'}
                                        onClick={() => distributeSelection(axis)}
                                        className="h-8 w-8 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                                    >
                                        {axis === 'x' ? <AlignHorizontalDistributeCenter className="h-4 w-4" /> : <AlignVerticalDistributeCenter className="h-4 w-4" />}
                                    </Button>
                                </div>
                            ))}
                            <p className="text-[10px] text-zinc-500 leading-relaxed">
                                Tipp: Die pinken Abstandsmarken zwischen ausgewählten Werken lassen sich direkt ziehen.
                            </p>
                        </div>
                    )}
                </Section>

                <Separator className="bg-zinc-800" />

                <Section title={count > 1 ? 'Position der Gruppe' : 'Position'}>
                    <div className="grid grid-cols-2 gap-2">
                        {edgeInput('left', 'Abstand links', box ? box.x - face.wallRect.x : null, 'Von der linken Wandkante')}
                        {edgeInput('right', 'Abstand rechts', box ? right(face.wallRect) - right(box) : null, 'Bis zur rechten Wandkante')}
                        {edgeInput('hcenter', 'Mitte (horizontal)', box ? centerX(box) - face.wallRect.x : null, 'Von der linken Wandkante')}
                        <div />
                        {edgeInput('top', 'Oberkante', box ? top(box) - floor : null, 'Über dem Boden')}
                        {edgeInput('vcenter', 'Mitte (Höhe)', box ? centerY(box) - floor : null, 'Über dem Boden')}
                        {edgeInput('bottom', 'Unterkante', box ? box.y - floor : null, 'Über dem Boden')}
                    </div>
                </Section>

                <Separator className="bg-zinc-800" />

                <Section title="Hängung">
                    <CmInput label="Hängehöhe (Bildmitte über Boden)" value={hangingHeight} onCommit={setHangingHeight} />
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" size="sm" disabled={count === 0} onClick={() => hangSelection('each')} className="h-8 text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700" title="Jede Bildmitte auf die Hängehöhe setzen">
                            Mitten auf Linie
                        </Button>
                        <Button variant="secondary" size="sm" disabled={count < 2} onClick={() => hangSelection('group')} className="h-8 text-[11px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700" title="Die Mitte der ganzen Gruppe auf die Hängehöhe setzen (Petersburger Hängung)">
                            Gruppe auf Linie
                        </Button>
                    </div>
                </Section>

                <Separator className="bg-zinc-800" />

                <section>
                    <button type="button" onClick={() => setShowShortcuts((v) => !v)} className="w-full flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider hover:text-zinc-200">
                        Tastenkürzel
                        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', showShortcuts && 'rotate-90')} />
                    </button>
                    {showShortcuts && (
                        <dl className="mt-2 space-y-1">
                            {SHORTCUTS.map(([key, text]) => (
                                <div key={key} className="flex justify-between gap-2 text-[11px]">
                                    <dt className="text-zinc-300 whitespace-nowrap">{key}</dt>
                                    <dd className="text-zinc-500 text-right">{text}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </section>

                {count > 0 && (
                    <>
                        <Separator className="bg-zinc-800" />
                        <Button variant="destructive" size="sm" className="w-full" onClick={remove}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            {count === 1 ? 'Werk entfernen' : `${count} Werke entfernen`}
                        </Button>
                    </>
                )}
            </div>
        </>
    );
};
